// Golden traces: every plan of tests/plans.mjs run through the game logic, one line per tick
// (positions, mode, action, pose, ball, sounds), compared with tests/golden/<plan>.txt. A change
// in how the game behaves shows up here line by line; when it is meant, write them anew:
//   UPDATE_GOLDEN=1 node --test "tests/*.test.mjs"
// and the diff of tests/golden/ in the pull request shows what changed.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { runPlan, traceLine } from './harness.mjs';
import { PLANS } from './plans.mjs';

const DIR = new URL('./golden/', import.meta.url);
const UPDATE = Boolean(process.env.UPDATE_GOLDEN);

function trace(frames, plan) {
  const lines = [];
  runPlan(plan, frames, (s, info) => lines.push(traceLine(s, info)));
  return `${lines.join('\n')}\n`;
}

for (const [name, [frames, plan]] of Object.entries(PLANS)) {
  test(`golden trace: ${name}`, () => {
    const file = new URL(`${name}.txt`, DIR);
    const actual = trace(frames, plan);
    if (UPDATE) {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, actual);
      return;
    }
    let expected;
    try {
      expected = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
    } catch {
      assert.fail(`no tests/golden/${name}.txt yet: run UPDATE_GOLDEN=1 node --test "tests/*.test.mjs"`);
    }
    // The first line that differs says more than the whole trace.
    const a = actual.split('\n');
    const e = expected.split('\n');
    const i = a.findIndex((line, k) => line !== e[k]);
    if (i >= 0 || a.length !== e.length) {
      const at = i >= 0 ? i : Math.min(a.length, e.length);
      assert.fail(`${name}, tick ${at + 1}:\n  now:  ${a[at] ?? '(ends)'}\n  was:  ${e[at] ?? '(ends)'}`);
    }
  });
}

test('the same plan gives the same trace twice (no hidden state between runs)', () => {
  const [frames, plan] = PLANS.juggle;
  assert.equal(trace(frames, plan), trace(frames, plan));
});
