// What the inspector's views share: pose names and drawing a pose on a canvas.
import { BALL_FRAMES, PALETTES, PLAYER_POSES } from '../../js/art/sprites.js';
import { POSE } from '../../js/game/animation.js';
import { paintParts } from '../../js/game/render.js';

export const FRAME_MS = 1000 / 60;
export const POSE_NAMES = Object.fromEntries(Object.entries(POSE).map(([name, i]) => [i, name]));
// The side of a square every pose fits in.
export const BOX = Math.max(...PLAYER_POSES.map((p) => Math.max(p.width, p.height)));

const sprites = new Map();

// The pose as painted by the game (stored facing left; mirror for right).
export function poseSprite(index, mirror) {
  const key = `${index}:${mirror}`;
  if (!sprites.has(key)) {
    const { parts, width, height } = PLAYER_POSES[index];
    sprites.set(key, paintParts(parts, width, height, PALETTES.player, mirror));
  }
  return sprites.get(key);
}

// Draws the pose standing on the bottom of a BOX x BOX square at (x, y), `size` px across.
export function drawPose(ctx, index, { mirror = true, x = 0, y = 0, size = BOX } = {}) {
  const sprite = poseSprite(index, mirror);
  const k = size / BOX;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, x + Math.floor((BOX - sprite.width) / 2) * k, y + (BOX - sprite.height) * k, sprite.width * k, sprite.height * k);
}

// A frame of the ball's spin, `size` px across, its top left at (x, y).
const balls = BALL_FRAMES.map((parts) => paintParts(parts, 16, 16, PALETTES.ball, false));
export function drawBall(ctx, frame, { x = 0, y = 0, size = 16 } = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(balls[frame], x, y, size, size);
}

export const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
