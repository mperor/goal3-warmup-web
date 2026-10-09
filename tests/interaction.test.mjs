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

test('the record of a tick says what made each kick and where the ball was; the sounds come from it', () => {
  const plan = [[40, 70, 'R'], ...tap(120, 'AB'), ...tap(208, 'A'), ...tap(327, 'A'), ...tap(389, 'AB'), ...tap(398, 'B')];
  const events = [];
  runPlan(plan, 470, (s) => {
    events.push(...s.events);
    // Every kind of event so far has the sound of its name, in the order they happened.
    assert.deepEqual(s.sounds, s.events.map((e) => e.type));
  });
  const keepUp = events.find((e) => e.type === 'kick' && e.by === 'keepUp');
  const overhead = events.find((e) => e.type === 'shot' && e.by === 'overhead');
  assert.ok(keepUp, 'the keep-up is a kick by keepUp');
  assert.ok(overhead, 'the overhead kick is a shot by overhead');
  // Met within the overhead kick's reach (practice.js: 13 px ahead, 11.25 px up).
  assert.ok(overhead.dx > 0 && overhead.dx <= 13 && overhead.dz <= 11.25, `met at dx ${overhead.dx}, dz ${overhead.dz}`);
});

test('A+B while trapping a ball at the thigh, the way he faces held: he takes it and flicks it, staying down', () => {
  const plan = [[20, 24, 'L'], [28, 32, 'L'], [32, 81, 'L'], ...tap(32, 'AB'), [37, 40, 'BL'], [84, 88, 'L'], [92, 96, 'L'],
    [96, 133, 'L'], [133, 137, 'R'], [141, 145, 'R'], [145, 199, 'R'], ...tap(164, 'AB')];
  const ticks = play(plan, 200);
  const trapped = ticks.filter((t) => t.frame < 165).at(-1);
  const flick = ticks.find((t) => t.frame > 160 && t.action === 'flick');
  assert.ok(flick, 'a flick');
  assert.equal(flick.frame, 165);
  assert.equal(flick.hasBall, true, 'the ball taken on that tick');
  assert.ok(ticks.every((t) => t.frame < 160 || t.mode !== 'air'), 'no jump');
  assert.ok(trapped.ball.z > 16, `trapped at the thigh (${trapped.ball.z} px up)`);
});

