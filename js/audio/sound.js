import { SOUND_DATA } from './sound-data.js';
import { decodeFrames } from './sequencer.js';

const VOLUME = 0.6;
const STORAGE_KEY = 'goal3-warmup:muted';

// The generated data, base64, to what the sequencer plays.
export function decode(data) {
  const bytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return {
    intro: decodeFrames(data.intro),
    loop: decodeFrames(data.loop),
    sfx: Object.fromEntries(Object.entries(data.sfx).map(([name, s]) => [name, { channels: s.channels, frames: decodeFrames(s.frames) }])),
    samples: Object.fromEntries(Object.entries(data.samples).map(([address, s]) => [address, bytes(s)])),
  };
}

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Not remembered then.
  }
}

// The original's music and sound effects, played by an emulated NES sound chip. Browsers only
// allow sound after a user gesture, so it starts on the first key press or click.
export function createSound() {
  let context = null;
  let gain = null;
  let node = null;
  let muted = readMuted();
  const listeners = new Set();

  function start() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    if (!window.AudioContext || !window.AudioWorkletNode) return;
    context = new AudioContext();
    gain = context.createGain();
    gain.gain.value = muted ? 0 : VOLUME;
    gain.connect(context.destination);
    context.audioWorklet.addModule(new URL('./apu-worklet.js', import.meta.url)).then(() => {
      node = new AudioWorkletNode(context, 'nes-audio', {
        numberOfInputs: 0,
        outputChannelCount: [1],
        processorOptions: { data: decode(SOUND_DATA), music: true },
      });
      node.connect(gain);
    });
  }

  return {
    start,
    play(name) {
      if (node) node.port.postMessage({ type: 'sfx', name });
    },
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
      saveMuted(muted);
      if (gain) gain.gain.setTargetAtTime(muted ? 0 : VOLUME, context.currentTime, 0.01);
      listeners.forEach((listener) => listener(muted));
    },
    onMutedChange(listener) {
      listeners.add(listener);
    },
  };
}
