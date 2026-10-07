import { CPU_HZ, FRAME_CYCLES, createApu } from './apu.js';

// Plays the captured register writes through the APU, one frame of writes per NES frame: the
// song (intro once, then the loop) and sound effects. Like the game's sound engine, an effect takes
// its channels from the music while it lasts (the music's writes to them are held back), then the
// music's last values are written back.
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
  const shadow = new Array(0x14).fill(null);
  let shadowEnable = 0;
  const owner = {}; // channel -> playing effect
  const effects = [];
  let position = 0;
  let playing = false;
  const cyclesPerSample = CPU_HZ / sampleRate;
  let untilFrame = 0;
  let last = 0;
  let filtered = 0;

  const maskOf = (channels) => channels.reduce((m, ch) => m | ENABLE_BITS[ch], 0);
  const effectMask = () => effects.reduce((m, e) => m | e.mask, 0);

  function musicWrite(reg, value) {
    if (reg === 0x15) {
      shadowEnable = value;
      apu.enable(0x1f & ~effectMask(), value);
      return;
    }
    if (reg < 0x14) shadow[reg] = value;
    if (!owner[CHANNEL_OF[reg]]) apu.write(reg, value);
  }

  function release(effect) {
    effects.splice(effects.indexOf(effect), 1);
    effect.channels.forEach((ch) => {
      if (owner[ch] !== effect) return;
      delete owner[ch];
      if (!playing) return;
      CHANNEL_REGS[ch].forEach((reg) => shadow[reg] !== null && apu.write(reg, shadow[reg]));
    });
    if (playing) apu.enable(effect.mask, shadowEnable);
    else apu.enable(effect.mask, 0);
  }

  function frame() {
    if (playing) {
      song[position].forEach(([reg, value]) => musicWrite(reg, value));
      position = position + 1 < song.length ? position + 1 : data.intro.length;
    }
    for (const effect of [...effects]) {
      effect.frames[effect.position].forEach(([reg, value]) => {
        if (reg === 0x15) apu.enable(effect.mask, value);
        else apu.write(reg, value);
      });
      effect.position += 1;
      if (effect.position >= effect.frames.length) release(effect);
    }
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
      // A newer effect takes over a channel from an older one.
      sfx.channels.forEach((ch) => owner[ch] && release(owner[ch]));
      const effect = { channels: sfx.channels, mask: maskOf(sfx.channels), frames: sfx.frames, position: 0 };
      effects.push(effect);
      sfx.channels.forEach((ch) => (owner[ch] = effect));
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
