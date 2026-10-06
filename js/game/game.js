import { START } from '../art/sprites.js';
import { createInput } from './input.js';
import { startLoop } from './loop.js';
import { drawnFacing, framePlayer } from './player.js';
import { createPractice, tickPractice } from './practice.js';
import { createRenderer } from './render.js';

const FRAMES_PER_TICK = 3;

export function startGame(canvas) {
  const input = createInput();
  const render = createRenderer(canvas);
  const practice = createPractice(START.playerX, START.ballX);
  let frame = 0;

  startLoop(() => {
    if (frame % FRAMES_PER_TICK === 0) tickPractice(practice, input.snapshot());
    frame += 1;

    const { player, ball } = practice;
    render.clear();
    const pose = framePlayer(player);
    render.player(player.x, player.z, pose, drawnFacing(player, pose));
    render.ball(ball.x, ball.z, ball.frame);
  });

  return practice;
}
