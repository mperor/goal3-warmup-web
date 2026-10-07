// Writes the favicon from the game's ball sprite: favicon.svg (sharp at any size) and favicon.png
// (32x32, for browsers without SVG favicons). Run: node tools/gen_favicon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { BALL_FRAMES, PALETTES, TILES } from '../js/art/sprites.js';

const FRAME = 1; // the symmetric one, the clearest at this size
const SIZE = 16;
const PNG_SCALE = 2;

// Palette indices per pixel, 0 = transparent.
const pixels = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
for (const [dx, dy, tile, flipH, flipV] of BALL_FRAMES[FRAME]) {
  TILES[tile].forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '0') pixels[dy + (flipV ? 7 - y : y)][dx + (flipH ? 7 - x : x)] = Number(c);
  }));
}

function svg() {
  // One rect per run of a colour in a row.
  const rects = [];
  pixels.forEach((row, y) => {
    for (let x = 0; x < SIZE;) {
      let end = x + 1;
      while (end < SIZE && row[end] === row[x]) end += 1;
      if (row[x]) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PALETTES.ball[row[x]]}"/>`);
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">\n${rects.join('\n')}\n</svg>\n`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png() {
  const side = SIZE * PNG_SCALE;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc(side * (1 + side * 4)); // each row: filter byte 0, then pixels
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const index = pixels[Math.floor(y / PNG_SCALE)][Math.floor(x / PNG_SCALE)];
      if (!index) continue;
      const hex = PALETTES.ball[index];
      const at = y * (1 + side * 4) + 1 + x * 4;
      raw.set([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), at);
      raw[at + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('../favicon.svg', import.meta.url), svg());
writeFileSync(new URL('../favicon.png', import.meta.url), png());
