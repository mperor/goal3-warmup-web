import { START } from '../art/sprites.js';
import { drawnFacing, framePlayer } from './animation.js';
import { createInput } from './input.js';
import { startLoop } from './loop.js';
import { createPractice, tickPractice } from './practice.js';
import { createRenderer } from './render.js';

const FRAMES_PER_TICK = 3;

// The game holds still (nothing moves, no input is taken) while paused() says so.
export function startGame(canvas, { input = createInput(), sound, paused = () => false } = {}) {
  const render = createRenderer(canvas);
  const practice = createPractice(START.playerX, START.ballX);
  let frame = 0;

  let pose = framePlayer(practice.player);
  startLoop(() => {
    input.poll();
    if (paused()) {
      input.snapshot(); // drop taps made meanwhile
    } else {
      if (frame % FRAMES_PER_TICK === 0) {
        tickPractice(practice, input.snapshot());
        practice.sounds.forEach((name) => sound?.play(name));
      }
      frame += 1;
      pose = framePlayer(practice.player);
    }

    const { player, ball } = practice;
    render.clear();
    render.player(player.x, player.z, pose, drawnFacing(player, pose));
    render.ball(ball.x, ball.z, ball.frame);
  });

  return practice;
}
