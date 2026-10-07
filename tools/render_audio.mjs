// Renders the captured music and sound effects through js/audio to WAV files in tools/.cache/audio/,
// to listen to them outside the browser. Run: node tools/render_audio.mjs [seconds of music]
import { mkdirSync, writeFileSync } from 'node:fs';
import { SOUND_DATA } from '../js/audio/sound-data.js';
import { createSequencer } from '../js/audio/sequencer.js';
import { decode } from '../js/audio/sound.js';

const RATE = 44100;
const out = new URL('./.cache/audio/', import.meta.url);
mkdirSync(out, { recursive: true });

function wav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
  return buffer;
}

function render(seconds, setup) {
  const sequencer = createSequencer(decode(SOUND_DATA), RATE);
  setup(sequencer);
  const samples = new Float32Array(Math.round(seconds * RATE));
  sequencer.render(samples);
  return samples;
}

function stats(name, samples) {
  let peak = 0;
  let sum = 0;
  for (const s of samples) {
    if (!Number.isFinite(s)) throw new Error(`${name}: not a number in the output`);
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  console.log(`${name}: ${(samples.length / RATE).toFixed(1)} s, peak ${peak.toFixed(3)}, rms ${Math.sqrt(sum / samples.length).toFixed(3)}`);
}

const seconds = Number(process.argv[2] || 85);
const music = render(seconds, (s) => s.playMusic());
stats('music', music);
writeFileSync(new URL('music.wav', out), wav(music));
for (const name of Object.keys(SOUND_DATA.sfx)) {
  const sfx = render(2, (s) => s.playEffect(name));
  stats(name, sfx);
  writeFileSync(new URL(`${name}.wav`, out), wav(sfx));
}
console.log(`wrote ${out.pathname}`);
