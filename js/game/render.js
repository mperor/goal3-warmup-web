import { BALL_FRAMES, PALETTES, PLAYER_POSES, SHADOW, TILES } from '../art/sprites.js';

// The canvas covers screen rows 0..172; NES sprites appear one row below their OAM y.
const toCanvasY = (oamY) => oamY + 1;

export function paintParts(parts, width, height, palette, mirror) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);

  for (const [dx, dy, tile, flipH, flipV] of parts) {
    const x0 = mirror ? width - 8 - dx : dx;
    const hFlip = mirror ? !flipH : flipH;
    TILES[tile].forEach((row, ty) => {
      for (let tx = 0; tx < 8; tx++) {
        const index = Number(row[hFlip ? 7 - tx : tx]);
        if (index === 0) continue;
        const px = x0 + tx;
        const py = dy + (flipV ? 7 - ty : ty);
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const color = palette[index];
        const i = (py * width + px) * 4;
        image.data[i] = parseInt(color.slice(1, 3), 16);
        image.data[i + 1] = parseInt(color.slice(3, 5), 16);
        image.data[i + 2] = parseInt(color.slice(5, 7), 16);
        image.data[i + 3] = 255;
      }
    });
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const poses = PLAYER_POSES.map((pose) => ({
    left: paintParts(pose.parts, pose.width, pose.height, PALETTES.player, false),
    right: paintParts(pose.parts, pose.width, pose.height, PALETTES.player, true),
    offset: { left: pose.left, right: pose.right },
  }));
  const ballFrames = BALL_FRAMES.map((parts) => paintParts(parts, 16, 16, PALETTES.ball, false));
  const shadow = paintParts([[0, 0, SHADOW.tile, 0, 0]], 8, 8, PALETTES.player, false);

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    player(x, z, poseIndex, facing) {
      const pose = poses[poseIndex];
      const [dx, oamY] = pose.offset[facing];
      if (z > 0) ctx.drawImage(shadow, Math.floor(x) - 4, toCanvasY(SHADOW.playerY));
      ctx.drawImage(pose[facing], Math.floor(x) + dx, toCanvasY(oamY - Math.floor(z)));
    },
    ball(x, z, frame) {
      if (Math.floor(z) > 0) ctx.drawImage(shadow, Math.floor(x) - 4, toCanvasY(SHADOW.ballY));
      ctx.drawImage(ballFrames[frame], Math.floor(x) - 8, toCanvasY(149 - Math.floor(z)));
    },
  };
}
