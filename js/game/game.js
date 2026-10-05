import { START } from '../art/sprites.js';
import { createInput } from './input.js';
import { startLoop } from './loop.js';
import { createPlayer, framePlayer, tickPlayer } from './player.js';
import { createRenderer } from './render.js';

const FRAMES_PER_TICK = 3;

export function startGame(canvas) {
  const input = createInput();
  const render = createRenderer(canvas);
  const player = createPlayer(START.playerX);
  const ball = { x: START.ballX, z: 0, frame: 0 };
  let frame = 0;

  startLoop(() => {
    if (frame % FRAMES_PER_TICK === 0) tickPlayer(player, input.snapshot());
    frame += 1;

    render.clear();
    render.player(player.x, 0, framePlayer(player), player.facing);
    render.ball(ball.x, ball.z, ball.frame);
  });

  return { player, ball };
}
