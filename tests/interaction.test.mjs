// The player and the ball together, as one would describe them: what a press does with the ball
// and which sounds go with it. Timings as in tests/plans.mjs (frames from the start of the screen).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doubleTap, runPlan, tap } from './harness.mjs';

// Every tick as { frame, mode, action, hasBall, ball: {x, z, vx, vz}, sounds }.
function play(plan, frames) {
  const ticks = [];
  runPlan(plan, frames, (s, { frame }) => {
    const { player: p, ball: b } = s;
    ticks.push({
      frame, mode: p.mode, action: p.action?.name ?? null, hasBall: p.hasBall, x: p.x,
      ball: { x: b.x, z: b.z, vx: b.vx, vz: b.vz }, sounds: [...s.sounds],
    });
  });
  return ticks;
}

const firstWith = (ticks, sound, after = 0) => ticks.find((t) => t.frame >= after && t.sounds.includes(sound));

test('the player starts with the ball at his feet', () => {
  const [first] = play([], 3);
  assert.equal(first.hasBall, true);
  assert.equal(first.ball.z < 1, true);
});

test('A with the ball passes it: a kick, it flies off forward, and it cannot be taken back at once', () => {
  const ticks = play(tap(30, 'A'), 200);
  const kick = firstWith(ticks, 'kick');
  assert.ok(kick, 'a kick sound');
  assert.equal(kick.hasBall, false);
  assert.ok(kick.ball.vx > 0 && kick.ball.vz > 0, 'forward and up');
  assert.equal(kick.action, 'pass');
  const next = ticks.filter((t) => t.frame > kick.frame).slice(0, 9);
  assert.ok(next.every((t) => !t.hasBall), 'not his again on the next ticks');
});

test('A+B standing with the ball lifts it straight up; it comes back down to him', () => {
  const ticks = play(tap(31, 'AB'), 300);
  const lifted = ticks.find((t) => t.action === 'lift' && !t.hasBall);
  assert.ok(lifted, 'the lift lets go of the ball');
  assert.equal(lifted.ball.vx, 0);
  const top = Math.max(...ticks.map((t) => t.ball.z));
  assert.ok(top > 60, `goes up high (${top} px)`);
  const back = firstWith(ticks, 'pickup', lifted.frame);
  assert.ok(back, 'taken back');
});

test('A as the lifted ball drops to his foot knocks it up again', () => {
  const ticks = play([[40, 70, 'R'], ...tap(120, 'AB'), ...tap(208, 'A')], 330);
  const keepUp = ticks.find((t) => t.action === 'keepUp' && t.sounds.includes('kick'));
  assert.ok(keepUp, 'a kick while keeping it up');
  assert.ok(keepUp.ball.vz > 0, 'the ball goes up again');
  assert.equal(keepUp.hasBall, false);
});

test('an overhead kick in a jump sends a dropping ball towards the goal at 8 px/tick', () => {
  const plan = [[40, 70, 'R'], ...tap(120, 'AB'), ...tap(208, 'A'), ...tap(327, 'A'), ...tap(389, 'AB'), ...tap(398, 'B')];
  const ticks = play(plan, 470);
  const jump = firstWith(ticks, 'jump', 380);
  const shot = firstWith(ticks, 'shot', 380);
  const land = firstWith(ticks, 'land', 380);
  assert.ok(jump && shot && land, 'jump, shot and landing sounds');
  assert.ok(jump.frame < shot.frame && shot.frame < land.frame, 'in that order');
  assert.equal(shot.action, 'overhead');
  assert.equal(shot.ball.vx, 8);
});

test('a double tap starts a run with the ball; the other way then skids', () => {
  const ticks = play([...doubleTap(60, 'L'), [72, 95, 'L'], [95, 125, 'R']], 160);
  const run = ticks.find((t) => t.mode === 'run');
  const skid = ticks.find((t) => t.mode === 'skid');
  assert.ok(run && skid && run.frame < skid.frame, 'a run, then a skid');
  assert.equal(run.hasBall, true);
});

test('the ball hits the ground with a bounce sound after a pass', () => {
  const ticks = play(tap(30, 'A'), 300);
  assert.ok(firstWith(ticks, 'bounce', 30));
});
