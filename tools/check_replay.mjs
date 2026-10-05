// Replays the original's recorded input through the game logic and compares it with RAM.
// Needs tools/.cache/trace.json from tools/export_trace.py. Run: node tools/check_replay.mjs
import { readFileSync } from 'node:fs';
import { createPlayer, framePlayer, tickPlayer } from '../js/game/player.js';
import { createPractice, tickPractice } from '../js/game/practice.js';

const { ticks, frames } = JSON.parse(readFileSync(new URL('./.cache/trace.json', import.meta.url)));
const TOLERANCE = 1.01;
const BALL_TOLERANCE = 2.01; // the original keeps a resting ball at z ~0.48 and x fractions we drop
const SPRITE_LAG = 4;

// Each scenario starts from the recorded state at `from`, set by hand where RAM alone is not enough.
const SCENARIOS = [
  { name: 'running dribble, jump with ball, jump kick, landing, bounces', from: 2015, to: 2170,
    player: { mode: 'run', runDir: 1, vx: 3.5, coast: 1, runTicks: 20, hasBall: true, facing: 'right' } },
  { name: 'trap a dropping ball, settle, dribble away', from: 2198, to: 2260,
    player: { facing: 'right', vx: 2.3125 } },
  { name: 'overhead kick with own ball', from: 2297, to: 2372,
    player: { mode: 'air', facing: 'left', hasBall: true } },
  { name: 'lift the ball, jump', from: 2867, to: 2921,
    player: { facing: 'right', hasBall: true } },
  { name: 'bicycle kick (B + back)', from: 2921, to: 2990,
    player: { mode: 'air', facing: 'right' } },
  { name: 'overhead kick without the ball', from: 3014, to: 3050,
    player: { mode: 'air', facing: 'right' } },
  { name: 'overhead kick at the edge of reach', from: 3590, to: 3620,
    player: { mode: 'air', facing: 'right' } },
  { name: 'land, hold A, volley a dropping ball from the ground', from: 3944, to: 3990,
    player: { mode: 'land', landTicks: 1, facing: 'right' } },
  { name: 'walk with A held, brake, high volley', from: 4040, to: 4100,
    player: { facing: 'right' } },
  { name: 'sprint with the ball, A+B+forward: skid and flick it over the head', from: 4871, to: 4900,
    player: { mode: 'run', runDir: 1, boost: 2, runTicks: 10, hasBall: true, facing: 'right' } },
];

const tickAt = (f) => ticks.findIndex((t) => t.f === f);

function runScenario(sc) {
  const i0 = tickAt(sc.from);
  const t0 = ticks[i0];
  const s = createPractice(t0.px, t0.bx);
  Object.assign(s.player, { tick: t0.it, z: t0.pz, vx: t0.pvx, vz: t0.pvz }, sc.player);
  Object.assign(s.ball, { z: t0.bz < 1 ? 0 : t0.bz, vx: t0.bvx, vz: t0.bvz, hang: t0.hang });
  const off = [];
  for (let i = i0 + 1; ticks[i] && ticks[i].f <= sc.to; i++) {
    const t = ticks[i];
    tickPractice(s, t);
    const { player: p, ball: b } = s;
    if (Math.abs(p.x - t.px) > TOLERANCE || Math.abs(p.z - t.pz) > TOLERANCE
      || Math.abs(b.x - t.bx) > BALL_TOLERANCE || Math.abs(b.z - t.bz) > BALL_TOLERANCE) {
      off.push(`${t.f}: player ${p.x.toFixed(1)},${p.z.toFixed(1)} want ${t.px.toFixed(1)},${t.pz.toFixed(1)}; `
        + `ball ${b.x.toFixed(1)},${b.z.toFixed(1)} want ${t.bx.toFixed(1)},${t.bz.toFixed(1)}`);
    }
  }
  return off;
}

// Ground movement only (walk, run, skid; the run boost is a known approximation): per tick,
// from the recorded position, does the logic produce the recorded velocity and pose?
function groundMovement(from, to) {
  const seg = ticks.filter((t) => t.f >= from && t.f <= to);
  const p = createPlayer(seg[0].px);
  let velocity = 0;
  for (let i = 1; i < seg.length; i++) {
    p.x = seg[i - 1].px;
    tickPlayer(p, seg[i]);
    if (Math.abs(p.x - seg[i].px) < 1e-6) velocity += 1;
  }

  const q = createPlayer(frames[from].x);
  q.facing = frames[from + SPRITE_LAG].facing;
  let poses = 0;
  for (let f = from; f <= to; f++) {
    if (f % 3 === 2) {
      q.x = frames[f - 3].x;
      tickPlayer(q, frames[f]);
    }
    const pose = framePlayer(q);
    const want = frames[f + SPRITE_LAG];
    if (pose === want.pose && q.facing === want.facing) poses += 1;
  }
  return { velocity: `${velocity}/${seg.length - 1}`, poses: `${poses}/${to - from + 1}` };
}

const ground = groundMovement(1319, 2017);
console.log(`ground movement 1319-2017: velocity exact ${ground.velocity} ticks, pose+facing exact ${ground.poses} frames`);

let failed = 0;
for (const sc of SCENARIOS) {
  const off = runScenario(sc);
  console.log(`${off.length ? 'FAIL' : 'ok  '} ${sc.from}-${sc.to} ${sc.name}${off.length ? ` (${off.length} ticks off)` : ''}`);
  off.slice(0, 3).forEach((line) => console.log(`       ${line}`));
  if (off.length) failed += 1;
}
process.exitCode = failed ? 1 : 0;
