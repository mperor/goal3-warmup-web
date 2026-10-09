// Random play (seeded, so the same every run) checked against what must always hold, whatever the
// buttons: finds the combinations nobody thought of trying. The mix of inputs follows
// tools/simulate.py's random plans: walks, runs, taps of A and B, Up and Down, jumps.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALL_FRAMES, PLAYER_POSES, START } from '../js/art/sprites.js';
import { createPractice } from '../js/game/practice.js';
import { doubleTap, runPlan, tap } from './harness.mjs';

const PLANS = 300;
const FRAMES = 1800;

// Mulberry32: small, seeded, the same everywhere.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPlan(seed) {
  const rnd = random(seed);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  const plan = [];
  for (let f = 20; f < FRAMES - 60;) {
    const d = pick(['L', 'R']);
    const kind = rnd();
    if (kind < 0.25) plan.push([f, f + int(5, 60), d + pick(['', '', 'U', 'D'])]);
    else if (kind < 0.4) plan.push(...doubleTap(f, d), [f + 12, f + 12 + int(10, 80), d]);
    else if (kind < 0.5) plan.push([f, f + int(5, 40), pick(['U', 'D'])]);
    else if (kind < 0.75) plan.push(...tap(f, pick(['A', 'B', 'A', 'B', 'AB']) + pick(['', '', d]), int(1, 4)));
    else plan.push(...tap(f, 'AB'), ...tap(f + int(3, 15), pick(['A', 'B', `B${d}`]), int(1, 3)));
    f += int(6, 60);
  }
  return plan;
}

const finite = (o, keys) => keys.every((k) => Number.isFinite(o[k]));

// Every rule broken on a tick, as text (empty when all hold).
function broken(s, { pose }) {
  const { player: p, ball: b } = s;
  const out = [];
  if (!finite(p, ['x', 'z', 'vx', 'vz']) || !finite(b, ['x', 'z', 'vx', 'vy', 'vz'])) out.push('a position or speed is not a number');
  if (p.z < 0 || b.z < 0) out.push('below the ground');
  if (p.x < 0 || p.x > 256) out.push(`player off the screen at x ${p.x}`);
  if (b.x < -32 || b.x > 288) out.push(`ball far off the screen at x ${b.x}`);
  if (!(pose >= 0 && pose < PLAYER_POSES.length)) out.push(`no such pose ${pose}`);
  if (!(b.frame >= 0 && b.frame < BALL_FRAMES.length)) out.push(`no such ball frame ${b.frame}`);
  // One relation with the ball at a time (a trap carried into a jump is the known case below).
  const trapping = p.trapping && p.mode !== 'air';
  const relations = [p.hasBall && 'hasBall', p.onBall && 'onBall', s.headRide && 'headRide', trapping && 'trapping'].filter(Boolean);
  if (relations.length > 1) out.push(`the ball is ${relations.join(' and ')} at once`);
  if (p.hasBall && !p.onBall && Math.abs(b.x - p.x) > 20) out.push(`has the ball ${(b.x - p.x).toFixed(1)} px away`);
  if (p.onBall && Math.abs(b.x - p.x) > 2) out.push(`rides a ball ${(b.x - p.x).toFixed(1)} px away`);
  if (p.onBall && p.mode !== 'land' && p.z !== 13 && p.z !== 9) out.push(`on the ball at height ${p.z}`);
  return out;
}

// The first tick of each plan (up to five plans) where check(s, info) finds something.
function firstFailures(check) {
  const failures = [];
  for (let seed = 1; seed <= PLANS && failures.length < 5; seed++) {
    let first = null;
    runPlan(randomPlan(seed), FRAMES, (s, info) => {
      if (first) return;
      const rules = check(s, info);
      if (rules.length) first = `seed ${seed}, frame ${info.frame}: ${rules.join('; ')}`;
    });
    if (first) failures.push(first);
  }
  return failures;
}

test(`${PLANS} random plans keep the rules on every tick`, () => {
  assert.deepEqual(firstFailures(broken), []);
});

// A+B while trapping takes the ball first, as the original does (tools/simulate.py, trap-ab): it
// used to leave the trap flag set in the air with the ball on his head.
test('a trap does not go on into a jump', () => {
  assert.deepEqual(firstFailures((s) => (s.player.trapping && s.player.mode === 'air' ? ['trapping in the air'] : [])), []);
});

// Every field of the state is there from the start (createPractice, createPlayer, createBall):
// none appears on the way, so the state can be shown and compared whole. The action under way is
// the one part that comes and goes.
function shape(o, path = '') {
  return Object.entries(o).flatMap(([key, value]) => {
    const at = path + key;
    if (key === 'action') return [at];
    return value && typeof value === 'object' && !Array.isArray(value) ? [at, ...shape(value, `${at}.`)] : [at];
  });
}

// Values JSON would change or drop: undefined, NaN, Infinity (-0 becomes 0, which is the same here).
function jsonUnsafe(o, path = '') {
  return Object.entries(o).flatMap(([key, value]) => {
    if (value && typeof value === 'object') return jsonUnsafe(value, `${path}${key}.`);
    const bad = value === undefined || (typeof value === 'number' && !Number.isFinite(value));
    return bad ? [`${path}${key} = ${value}`] : [];
  });
}

test('the state keeps the fields it starts with, and goes through JSON unchanged', () => {
  const start = createPractice(START.playerX, START.ballX);
  // headRide and curve hold an object or null: only their presence is fixed.
  const fixed = (keys) => keys.filter((k) => !/^(headRide|ball\.curve)\./.test(k)).sort();
  const expected = fixed(shape(start));
  assert.deepEqual(firstFailures((s) => {
    const out = [];
    const keys = fixed(shape(s));
    const added = keys.filter((k) => !expected.includes(k));
    const gone = expected.filter((k) => !keys.includes(k));
    if (added.length || gone.length) out.push(`fields added ${added.join(',') || '-'}, gone ${gone.join(',') || '-'}`);
    const unsafe = jsonUnsafe(s);
    if (unsafe.length) out.push(`not for JSON: ${unsafe.join(', ')}`);
    return out;
  }), []);
});
