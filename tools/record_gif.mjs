// Records the warm-up screen as an animated GIF: the game logic and renderer run
// headless on a scripted input plan, drawn over the title scene as index.html lays it out.
// Run: node tools/record_gif.mjs [--scale 2] [--out tools/.cache/warmup.gif] [--png frame]
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PRESS_START } from '../js/art/press-start.js';
import { START } from '../js/art/sprites.js';
import { TITLE_LOGO } from '../js/art/title-logo.js';
import { drawnFacing, framePlayer } from '../js/game/player.js';
import { createPractice, tickPractice } from '../js/game/practice.js';
import { pixelTextRows } from '../js/pixel-font.js';

const FRAMES_PER_TICK = 3;
const BG = '#155fd9';
const TEXT = '#ffffff';
const BLINK_FRAMES = 24; // .press-start: 0.4 s, shown for the first half

// The scene in NES pixels, measured in the browser relative to the top of the logo (css/style.css).
const TOP = -8; // the scene's padding (the canvas reaches 32 above the title; no ball in PLAN flies that high)
const WIDTH = 256;
const HEIGHT = 176 + 8 - TOP; // down to the credits, plus the padding again
const CANVAS = { x: 0, y: -32 };
const LOGO = { x: 33, y: 0 };
const SUBTITLE = { x: 33, y: 49, text: 'KUNIO KUN NO NEKKETSU SOCCER LEAGUE', gaps: [5, 5, 4, 4, 4] };
const PRESS = { x: 49, y: 141 };
const GROUND = { x: 48, y: 154, width: 143 };
const CREDITS = { x: 24, y: 168, text: '© 1993 TECHNOS JAPAN CORP.' };

// The input, as in tools/simulate.py: (from, to, buttons) in frames, buttons from LRUDAB.
// Timed with the game logic: change one press and the ones after it may need moving too.
const tap = (at, buttons, frames = 2) => [[at, at + frames, buttons]];
const doubleTap = (at, buttons) => [...tap(at, buttons, 4), ...tap(at + 8, buttons, 4)];
const PLAN = [
  [40, 70, 'R'], // a few steps with the ball
  ...tap(120, 'AB'), // lift it
  ...tap(208, 'A'), ...tap(327, 'A'), // keep it up twice
  ...tap(389, 'AB'), ...tap(398, 'B'), // jump, overhead kick: off the right wall and back
  [490, 530, 'R'], // walk up to it, take it
  ...doubleTap(600, 'L'), [608, 660, 'L'], // run left with it
  ...tap(660, 'AB'), ...tap(672, 'RB'), // jump with it, volley it to the right
];
const FIRST = 30; // the GIF starts here...
const FRAMES = 800; // ...and ends here, as the ball comes back off the wall

const BUTTONS = { L: 'left', R: 'right', U: 'up', D: 'down', A: 'a', B: 'b' };

function heldAt(frame) {
  const held = { left: false, right: false, up: false, down: false, a: false, b: false };
  for (const [from, to, buttons] of PLAN) {
    if (frame >= from && frame < to) for (const c of buttons) held[BUTTONS[c]] = true;
  }
  return held;
}

// A minimal 2D canvas for js/game/render.js: sprites are RGBA images, the screen a framebuffer.
function installCanvas() {
  const image = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0, pixels: null };
      canvas.getContext = () => ({
        createImageData: image,
        putImageData: (img) => (canvas.pixels = img),
      });
      return canvas;
    },
  };
}

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const palette = [];
let clippedAt = null; // the first frame with a sprite above TOP

function createScreen() {
  const index = (hex) => {
    const key = hex.toLowerCase();
    let i = palette.indexOf(key);
    if (i < 0) i = palette.push(key) - 1;
    return i;
  };
  const pixels = new Uint8Array(WIDTH * HEIGHT).fill(index(BG));
  const plot = (x, y, color) => {
    y -= TOP;
    if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) pixels[y * WIDTH + x] = color;
  };
  const rows = (x, y, rowList, colors) => {
    rowList.forEach((row, dy) => [...row].forEach((c, dx) => c in colors && plot(x + dx, y + dy, colors[c])));
  };
  return { index, pixels, plot, rows };
}

function drawScene(screen, frame) {
  const white = screen.index(TEXT);
  const logoColors = Object.fromEntries(Object.entries(TITLE_LOGO.palette).map(([k, c]) => [k, screen.index(c)]));
  screen.rows(LOGO.x, LOGO.y, TITLE_LOGO.rows, logoColors);
  screen.rows(SUBTITLE.x, SUBTITLE.y, pixelTextRows('sans6', SUBTITLE.text, SUBTITLE.gaps), { '#': white });
  if (frame % BLINK_FRAMES < BLINK_FRAMES / 2) {
    screen.rows(PRESS.x, PRESS.y, PRESS_START.rows, { W: screen.index(PRESS_START.palette.W) });
  }
  for (let x = 0; x < GROUND.width; x += 2) screen.plot(GROUND.x + x, GROUND.y, white);
  screen.rows(CREDITS.x, CREDITS.y, pixelTextRows('serif8', CREDITS.text), { '#': white });
}

// Draws into the screen of the current frame (screen.current).
function createContext(screen) {
  const toIndex = new Map();
  return {
    clearRect() {},
    drawImage(src, x, y) {
      if (CANVAS.y + y < TOP) clippedAt ??= screen.current.frame;
      const { width, height, data } = src.pixels;
      for (let sy = 0; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
          const i = (sy * width + sx) * 4;
          if (data[i + 3] === 0) continue;
          const hex = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
          if (!toIndex.has(hex)) toIndex.set(hex, screen.current.index(hex));
          screen.current.plot(CANVAS.x + x + sx, CANVAS.y + y + sy, toIndex.get(hex));
        }
      }
    },
  };
}

async function record() {
  installCanvas();
  const { createRenderer } = await import('../js/game/render.js');
  const practice = createPractice(START.playerX, START.ballX);
  const target = { current: null };
  const render = createRenderer({ getContext: () => createContext(target) });
  const frames = [];
  let tapped = { a: false, b: false };
  let pose = framePlayer(practice.player);

  for (let frame = 0; frame < FRAMES; frame++) {
    // Like js/game/input.js: a press between two ticks still reaches the next one.
    const held = heldAt(frame);
    tapped = { a: tapped.a || held.a, b: tapped.b || held.b };
    if (frame % FRAMES_PER_TICK === 0) {
      tickPractice(practice, { ...held, a: tapped.a, b: tapped.b });
      tapped = { a: false, b: false };
    }
    pose = framePlayer(practice.player);

    const screen = createScreen();
    drawScene(screen, frame);
    screen.frame = frame;
    target.current = screen;
    const { player, ball } = practice;
    render.player(player.x, player.z, pose, drawnFacing(player, pose));
    render.ball(ball.x, ball.z, ball.frame);
    frames.push(screen.pixels);
  }
  if (clippedAt !== null) console.warn(`warning: a sprite is cut off at the top from frame ${clippedAt}; lower TOP`);
  return frames;
}

// --- GIF (89a), one global palette, each frame only the rectangle that changed ---

function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = [];
  let size = minCodeSize + 1;
  let next = end + 1;
  let dict = new Map();
  let acc = 0;
  let bits = 0;
  const emit = (code) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  };

  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const key = prefix * 256 + indices[i];
    const code = dict.get(key);
    if (code !== undefined) {
      prefix = code;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      dict = new Map();
      size = minCodeSize + 1;
      next = end + 1;
    } else {
      if (next >= 1 << size) size++;
      dict.set(key, next++);
    }
    prefix = indices[i];
  }
  emit(prefix);
  emit(end);
  if (bits > 0) out.push(acc & 0xff);
  return out;
}

function scaleUp(pixels, width, height, scale) {
  const out = new Uint8Array(width * scale * height * scale);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) out[y * width * scale + x] = pixels[Math.floor(y / scale) * width + Math.floor(x / scale)];
  }
  return out;
}

function changedRect(a, b) {
  let x0 = WIDTH, y0 = HEIGHT, x1 = -1, y1 = -1;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (a[y * WIDTH + x] === b[y * WIDTH + x]) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(pixels, { x, y, w, h }) {
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) out.set(pixels.subarray((y + r) * WIDTH + x, (y + r) * WIDTH + x + w), r * w);
  return out;
}

function encodeGif(frames, palette, scale, frameStep) {
  const bytes = [];
  const u16 = (v) => bytes.push(v & 0xff, v >> 8);
  const colorBits = Math.max(1, Math.ceil(Math.log2(palette.length)));

  bytes.push(...Buffer.from('GIF89a'));
  u16(WIDTH * scale);
  u16(HEIGHT * scale);
  bytes.push(0x80 | ((colorBits - 1) << 4) | (colorBits - 1), 0, 0);
  for (let i = 0; i < 1 << colorBits; i++) bytes.push(...(palette[i] ? rgb(palette[i]) : [0, 0, 0]));
  bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0); // loop forever

  // 60 Hz frames shown every frameStep, in centiseconds: delays carry the rounding over.
  const shown = [];
  for (let f = FIRST; f < frames.length; f += frameStep) {
    const prev = shown.at(-1);
    const rect = prev ? changedRect(prev.pixels, frames[f]) : { x: 0, y: 0, w: WIDTH, h: HEIGHT };
    if (rect) shown.push({ pixels: frames[f], rect, frames: frameStep });
    else prev.frames += frameStep;
  }

  let clock = 0;
  for (const { pixels, rect, frames: n } of shown) {
    const delay = Math.round(((clock + n) * 100) / 60) - Math.round((clock * 100) / 60);
    clock += n;
    bytes.push(0x21, 0xf9, 4, 1 << 2, delay & 0xff, delay >> 8, 0, 0); // keep the previous frame
    bytes.push(0x2c);
    u16(rect.x * scale);
    u16(rect.y * scale);
    u16(rect.w * scale);
    u16(rect.h * scale);
    bytes.push(0);
    const minCodeSize = Math.max(2, colorBits);
    const data = lzw(scaleUp(crop(pixels, rect), rect.w, rect.h, scale), minCodeSize);
    bytes.push(minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return { gif: Buffer.from(bytes), frames: shown.length };
}

function encodePng(pixels, palette, scale) {
  const w = WIDTH * scale;
  const h = HEIGHT * scale;
  const big = scaleUp(pixels, WIDTH, HEIGHT, scale);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) Buffer.from(rgb(palette[big[y * w + x]])).copy(raw, y * (w * 3 + 1) + 1 + x * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const scale = Number(option('--scale', 2));
const frames = await record();

if (args.includes('--png')) {
  const frame = Number(option('--png'));
  const dir = new URL('./.cache/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`frame-${frame}.png`, dir);
  writeFileSync(file, encodePng(frames[frame], palette, scale));
  console.log(`wrote ${file.pathname}`);
} else {
  const out = option('--out', 'tools/.cache/warmup.gif');
  const { gif, frames: shown } = encodeGif(frames, palette, scale, 2);
  writeFileSync(out, gif);
  console.log(`wrote ${out}: ${shown} frames, ${(gif.length / 1024).toFixed(0)} KiB, ${palette.length} colours`);
}
