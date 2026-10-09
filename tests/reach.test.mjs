// The reach rules (js/game/reach.js): the hits and misses measured on the original, and the boxes
// each rule gives for drawing agreeing with what it decides.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REACH } from '../js/game/reach.js';

// The ball from a player standing facing right: `ahead` px ahead, `dz` px up.
const at = (ahead, dz, z = dz) => ({ dx: ahead, ahead, dz, z });

// From the comments in reach.js: [rule, where, context, taken or not].
const MEASURED = [
  ['overhead', at(13.6, 11.5), { t: 7 }, false, 'ahead, missed 13.6 px away 11.5 px up'],
  ['overhead', at(-13.1, 5.9), { t: 7 }, true, 'behind, hit 13.1 px away 5.9 px up'],
  ['overhead', at(-13.1, 10.9), { t: 7 }, false, 'behind, missed 10.9 px up'],
  ['bicycle', at(12, 22.3), {}, true, 'hit 22.3 px up'],
  ['bicycle', at(12, 23.5), {}, false, 'missed 23.5 px up'],
  ['volleyShotAir', at(-12, 28), {}, true, 'hit 12 px behind 28 px up'],
  ['volleyShotAir', at(-12, 32.6), {}, false, 'not 32.6 px up'],
  ['dive', at(20.6, -10.2), { backward: false }, false, 'missed 20.6 px away 10.2 px below'],
  ['dive', at(29.2, 17.3), { backward: true }, true, 'backwards, hit 29.2 px ahead 17.3 px up'],
  ['dive', at(27.2, 20.3), { backward: true }, false, 'backwards, missed 27.2 px ahead 20.3 px up'],
  ['take', { dx: 14.3 }, { air: false }, true, 'on the ground, taken 14.3 px away'],
  ['take', { dx: 15.7 }, { air: false }, false, 'on the ground, not 15.7 px away'],
  ['mount', { dx: 14.8, dz: -5 }, {}, true, 'landed on it 14.8 px away'],
  ['mount', { dx: 15.6, dz: -5 }, {}, false, 'missed 15.6 px away'],
  ['catch', { dx: 13.2, ahead: 13.2, dz: -14, z: 10 }, {}, true, 'caught 13.2 px ahead, 14.0 px below'],
  ['catch', { dx: 15.5, ahead: 15.5, dz: -10, z: 10 }, {}, false, 'missed 15.5 px ahead'],
  ['catch', { dx: 10, ahead: 10, dz: -14.1, z: 10 }, {}, false, 'missed 14.1 px below'],
  ['trap', { dx: 5, z: 31.4 }, { trapping: false }, true, 'trapped 31.4 px up'],
];

for (const [rule, rel, ctx, taken, what] of MEASURED) {
  test(`${rule}: ${what}`, () => assert.equal(REACH[rule].fits(rel, ctx), taken));
}

// The comment's first overhead measurement and the narrower reach found later with
// tools/simulate.py (OVERHEAD_FAR_DZ_MAX, 10.5 px beyond 11 px ahead) disagree; which is right is
// for the original to say.
test('overhead: ahead, hit 12.3 px away 11.2 px up', { todo: 'the recorded hit is outside OVERHEAD_FAR_DZ_MAX' }, () => {
  assert.equal(REACH.overhead.fits(at(12.3, 11.2), { t: 7 }), true);
});

// Every rule with the contexts it is asked in.
const CONTEXTS = {
  hit: [{}],
  overhead: Array.from({ length: 14 }, (_, t) => ({ t })),
  bicycle: [{}],
  volleyShotAir: [{}],
  dive: [{ backward: false }, { backward: true }],
  strike: ['volley', 'volleyShot', 'overheadShot'].flatMap((kind) => [1, 4, 5, 9].map((t) => ({ kind, t }))),
  keepUp: [{}],
  keepUpChoice: [{}],
  juggle: [{}],
  catch: [{}],
  take: [{ air: false }, { air: true }],
  trap: [{ trapping: false }, { trapping: true }],
  head: [{}],
  mount: [{}],
};

const inside = (box, rel) => ['ahead', 'dz', 'z'].every((axis) => !box[axis] || (rel[axis] >= box[axis][0] && rel[axis] <= box[axis][1]));

test('every rule is tried here, with a note', () => {
  assert.deepEqual(Object.keys(CONTEXTS).sort(), Object.keys(REACH).sort());
  for (const rule of Object.values(REACH)) assert.ok(rule.note);
});

// On a grid off the ends of the boxes (where an end is in or out does not show in a drawing).
test('the boxes of every rule cover what it takes and nothing else', () => {
  const wrong = [];
  for (const [name, contexts] of Object.entries(CONTEXTS)) {
    for (const ctx of contexts) {
      const boxes = REACH[name].shapes(ctx);
      for (let ahead = -40.13; ahead <= 40; ahead += 0.5) {
        for (let dz = -30.07; dz <= 45; dz += 0.5) {
          const rel = at(ahead, dz);
          const fits = REACH[name].fits(rel, ctx);
          if (fits !== boxes.some((box) => inside(box, rel)) && wrong.length < 5) {
            wrong.push(`${name} ${JSON.stringify(ctx)} at ahead ${ahead.toFixed(2)}, dz ${dz.toFixed(2)}: fits ${fits}`);
          }
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
});
