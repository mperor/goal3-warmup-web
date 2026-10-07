// Runs the game logic through the plans played on the original by tools/simulate.py, from the
// first tick of the ball-practice screen, and reports where each first goes its own way.
// Run: node tools/compare_sim.mjs [plan ...]
import { readdirSync, readFileSync } from 'node:fs';
import { runScenario, SPRITE_LAG } from './replay.mjs';

const BUTTONS = { left: 'L', right: 'R', up: 'U', down: 'D', a: 'A', b: 'B' };
const CONTEXT_TICKS = 6;

const dir = new URL('./.cache/sim/', import.meta.url);
const only = process.argv.slice(2);
const names = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  .filter((n) => !only.length || only.includes(n))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

const held = (t) => Object.entries(BUTTONS).filter(([k]) => t[k]).map(([, c]) => c).join('') || '-';
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

let failed = 0;
for (const name of names) {
  const trace = JSON.parse(readFileSync(new URL(`${name}.json`, dir)));
  const { ticks, frames } = trace;
  const sc = { from: ticks[0].f, to: Infinity, poses: true, player: { facing: frames[SPRITE_LAG].facing } };
  const { off, poses } = runScenario(trace, sc);
  if (!off.length) {
    console.log(`ok   ${name}: ${ticks.length} ticks, poses ${poses}`);
    continue;
  }
  failed += 1;
  const first = off[0].at;
  console.log(`FAIL ${name}: first off at frame ${first} (${off.length}/${ticks.length} ticks off), poses ${poses}`);
  // What the original did up to there: input and state per tick.
  const i = ticks.findIndex((t) => t.f === first);
  for (const t of ticks.slice(Math.max(0, i - CONTEXT_TICKS), i + 2)) {
    console.log(`       ${String(t.f).padStart(5)} ${held(t).padEnd(4)} player ${fmt(t.px)},${fmt(t.pz)} v ${fmt(t.pvx)},${fmt(t.pvz)}`
      + `  ball ${fmt(t.bx)},${fmt(t.bz)} v ${fmt(t.bvx)},${fmt(t.bvz)}`);
  }
  off.slice(0, 3).forEach(({ text }) => console.log(`       ours ${text}`));
}
process.exitCode = failed ? 1 : 0;
