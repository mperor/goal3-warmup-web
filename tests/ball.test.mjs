// The ball's physics (js/game/ball.js) against the numbers its comments give, measured on the original.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBall, rollBall, tickBall } from '../js/game/ball.js';

const ball = (props) => Object.assign(createBall(100), props);

test('rolling at 1 px/tick or more, 3/32 of the speed goes on each tick', () => {
  const b = ball({ vx: 2 });
  tickBall(b);
  assert.equal(b.vx, 2 - 2 / 16 - 2 / 32);
  assert.equal(b.x, 100 + b.vx);
});

test('the shifts take a little more off a negative speed (8.8 fixed point)', () => {
  const right = ball({ vx: 282 / 256 });
  const left = ball({ vx: -282 / 256 });
  tickBall(right);
  tickBall(left);
  assert.equal(right.vx, 257 / 256);
  assert.equal(left.vx, -255 / 256);
});

test('slower than 1 px/tick it loses 1/8, or 1/16 while the other speed is still 1 or more', () => {
  const alone = ball({ vx: 0.5 });
  const withDepth = ball({ vx: 0.5, vy: 1.5 });
  tickBall(alone);
  tickBall(withDepth);
  assert.equal(alone.vx, 0.5 - 1 / 8);
  assert.equal(withDepth.vx, 0.5 - 1 / 16);
});

test('dropped, it bounces lower each time and settles on the ground', () => {
  const b = ball({ z: 40, grounded: false });
  const peaks = [];
  let rising = false;
  for (let i = 0; i < 200; i++) {
    const zBefore = b.z;
    tickBall(b);
    if (rising && b.z < zBefore) peaks.push(zBefore);
    rising = b.z > zBefore;
  }
  assert.ok(peaks.length >= 2, `bounced ${peaks.length} times`);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1], 'each bounce lower');
  assert.equal(b.vz, 0);
  assert.ok(b.z < 1, `lies a fraction up at most, z ${b.z}`);
});

test('the left wall turns it below x 8: at 8.0 it flies on, at 7.48 it turns', () => {
  const at8 = ball({ x: 8, vx: -1, z: 10, grounded: false });
  const below = ball({ x: 7.48, vx: -1, z: 10, grounded: false });
  tickBall(at8);
  tickBall(below);
  assert.equal(at8.vx, -1);
  assert.equal(below.vx, 2);
});

test('off a wall it goes up at 2 px/tick plus the fraction it had (-1.5 gives 2.5, 5 gives 2)', () => {
  // Hanging, so gravity does not take its half off on the same tick.
  const falling = ball({ x: 256, vx: 3, vz: -1.5, z: 30, grounded: false, hang: 5 });
  const rising = ball({ x: 256, vx: 3, vz: 5, z: 30, grounded: false, hang: 5 });
  tickBall(falling);
  tickBall(rising);
  assert.equal(falling.vx, -2);
  assert.equal(falling.vz, 2.5);
  assert.equal(rising.vz, 2);
});

test('it turns a frame every 5 px rolled, the other way round going left', () => {
  const frames = (dx) => {
    const b = createBall(100);
    return [1, 2, 3, 4].map(() => {
      rollBall(b, dx);
      return b.frame;
    });
  };
  assert.deepEqual(frames(5), [4, 1, 5, 3]);
  assert.deepEqual(frames(-5), [3, 2, 1, 0]);
});
