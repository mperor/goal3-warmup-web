import { CPU_HZ, FRAME_CYCLES, createApu } from './apu.js';

// Plays the captured register writes through the APU, one frame of writes per NES frame: the
// song (intro once, then the loop) and sound effects. Like the game's sound engine, an effect takes
// a channel from the music while it plays on it (the music's writes to it are held back).
const CHANNEL_REGS = { p1: [0, 1, 2, 3], p2: [4, 5, 6, 7], tri: [8, 9, 10, 11], noise: [12, 13, 14, 15], dmc: [16, 17, 18, 19] };
const ENABLE_BITS = { p1: 1, p2: 2, tri: 4, noise: 8, dmc: 16 };
const CHANNEL_OF = [];
Object.entries(CHANNEL_REGS).forEach(([ch, regs]) => regs.forEach((r) => (CHANNEL_OF[r] = ch)));

const SUBSTEPS = 4; // averaged per output sample against aliasing
const DC_BLOCK = 0.995;

// Base64 frames (a count, then register/value pairs) to [[reg, value], ...] per frame.
export function decodeFrames(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const frames = [];
  for (let i = 0; i < bytes.length;) {
    const n = bytes[i++];
    const frame = [];
    for (let k = 0; k < n; k++, i += 2) frame.push([bytes[i], bytes[i + 1]]);
    frames.push(frame);
  }
  return frames;
}

// data: { intro, loop: frames; sfx: { name: { channels, frames } }; samples: { address: Uint8Array } }
export function createSequencer(data, sampleRate) {
  const memory = new Uint8Array(0x10000);
  Object.entries(data.samples).forEach(([address, bytes]) => memory.set(bytes, Number(address)));
  const apu = createApu((address) => memory[address]);
  const song = [...data.intro, ...data.loop];
  let shadowEnable = 0;
  const owner = {}; // channel -> playing effect
  const effects = [];
  let position = 0;
  let playing = false;
  const cyclesPerSample = CPU_HZ / sampleRate;
  let untilFrame = 0;
  let last = 0;
  let filtered = 0;

  const maskOf = (channels) => [...channels].reduce((m, ch) => m | ENABLE_BITS[ch], 0);
  const effectMask = () => effects.reduce((m, e) => m | maskOf(e.held), 0);

  function musicWrite(reg, value) {
    if (reg === 0x15) {
      shadowEnable = value;
      apu.enable(0x1f & ~effectMask(), value);
      return;
    }
    if (!owner[CHANNEL_OF[reg]]) apu.write(reg, value);
  }

  // An effect holds a channel only from its first to its last write to it.
  function take(effect, ch) {
    if (owner[ch] && owner[ch] !== effect) giveBack(owner[ch], ch);
    owner[ch] = effect;
    effect.held.add(ch);
  }

  // The music gets the channel back as it is: like the game's engine, nothing is written back, the
  // music's next writes take over (checked against the original's writes for the shot).
  function giveBack(effect, ch) {
    effect.held.delete(ch);
    if (owner[ch] !== effect) return;
    delete owner[ch];
    apu.enable(ENABLE_BITS[ch], playing ? shadowEnable : 0);
  }

  function end(effect) {
    effects.splice(effects.indexOf(effect), 1);
    [...effect.held].forEach((ch) => giveBack(effect, ch));
  }

  function frame() {
    // A channel an effect starts on this frame is its before the music writes to it.
    effects.forEach((effect) => Object.entries(effect.spans)
      .forEach(([ch, [first]]) => first === effect.position && take(effect, ch)));
    if (playing) {
      song[position].forEach(([reg, value]) => musicWrite(reg, value));
      position = position + 1 < song.length ? position + 1 : data.intro.length;
    }
    for (const effect of [...effects]) {
      const at = effect.position;
      effect.frames[at].forEach(([reg, value]) => {
        // Its channel switches are for the channels it still has to play on, that no other has.
        if (reg === 0x15) apu.enable(maskOf(Object.keys(effect.spans).filter((ch) => effect.spans[ch][1] >= at && (!owner[ch] || owner[ch] === effect))), value);
        else if (owner[CHANNEL_OF[reg]] === effect) apu.write(reg, value);
      });
      Object.entries(effect.spans).forEach(([ch, [, last]]) => last === at && giveBack(effect, ch));
      effect.position += 1;
      if (effect.position >= effect.frames.length) end(effect);
    }
  }

  // Per channel, the first and the last frame of an effect that writes to it.
  function spansOf(sfx) {
    const spans = {};
    sfx.frames.forEach((writes, i) => writes.forEach(([reg]) => {
      const ch = CHANNEL_OF[reg];
      if (!ch || !sfx.channels.includes(ch)) return;
      spans[ch] = spans[ch] ? [spans[ch][0], i] : [i, i];
    }));
    return spans;
  }

  return {
    playMusic() {
      if (playing) return;
      playing = true;
      position = 0;
    },
    stopMusic() {
      playing = false;
      apu.enable(0x1f & ~effectMask(), 0);
    },
    playEffect(name) {
      const sfx = data.sfx[name];
      if (!sfx) return;
      // A newer effect takes over from an older one on the same channels.
      effects.filter((e) => e.channels.some((ch) => sfx.channels.includes(ch))).forEach(end);
      effects.push({ channels: sfx.channels, spans: spansOf(sfx), held: new Set(), frames: sfx.frames, position: 0 });
    },
    render(out) {
      for (let i = 0; i < out.length; i++) {
        if (untilFrame <= 0) {
          frame();
          untilFrame += FRAME_CYCLES;
        }
        let sum = 0;
        for (let k = 0; k < SUBSTEPS; k++) {
          apu.clock(cyclesPerSample / SUBSTEPS);
          sum += apu.output();
        }
        untilFrame -= cyclesPerSample;
        const x = sum / SUBSTEPS;
        filtered = x - last + DC_BLOCK * filtered;
        last = x;
        out[i] = filtered;
      }
    },
  };
}
