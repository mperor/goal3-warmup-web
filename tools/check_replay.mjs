// Replays the original's recorded input through the game logic and compares it with RAM.
// Needs tools/.cache/<recording>.json from tools/export_trace.py. Run: node tools/check_replay.mjs
import { existsSync, readFileSync } from 'node:fs';
import { createPlayer, framePlayer, tickPlayer } from '../js/game/player.js';
import { createPractice, tickPractice } from '../js/game/practice.js';

const TOLERANCE = 1.01;
const BALL_TOLERANCE = 2.01; // the original keeps a resting ball at z ~0.48 and x fractions we drop
const SPRITE_LAG = 4;

// Each scenario starts from the recorded state at `from`, set by hand where RAM alone is not enough.
// With `poses`, the displayed pose and facing must match on every frame too.
const RECORDINGS = {
  'ball-practice': {
    ground: [1319, 2017],
    scenarios: [
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
        player: { mode: 'land', landTicks: 2, facing: 'right' } },
      { name: 'walk with A held, brake, high volley', from: 4040, to: 4100,
        player: { facing: 'right' } },
      { name: 'sprint with the ball, A+B+forward: skid and flick it over the head', from: 4871, to: 4900,
        player: { mode: 'run', runDir: 1, boost: 2, runTicks: 10, hasBall: true, facing: 'right' } },
    ],
  },
  'shots-passes': {
    scenarios: [
      { name: 'pass: A with the ball, standing', from: 58, to: 100, poses: true,
        player: { facing: 'right', hasBall: true } },
      { name: 'A at a high dropping ball: volley it back', from: 151, to: 215, poses: true,
        player: { facing: 'right' } },
      { name: 'shot: B with the ball, standing', from: 976, to: 1020, poses: true,
        player: { facing: 'right', hasBall: true } },
      { name: 'shot: B with the ball while walking', from: 1504, to: 1545, poses: true,
        player: { facing: 'right', hasBall: true, vx: 2.3125 } },
      { name: 'B at a ball dropping close, after a run: overhead shot', from: 1582, to: 1636, poses: true,
        player: { mode: 'run', runDir: 1, vx: 3.5, coast: 1, runTicks: 10, facing: 'right' } },
      { name: 'run, back + B: skid, then a volley shot facing back', from: 1660, to: 1705, poses: true,
        player: { mode: 'run', runDir: -1, vx: -3.5, coast: 1, runTicks: 10, facing: 'left',
          animation: 'run', animFacing: 'left', animFrame: 6 } },
      { name: 'run, back + B: skid, then an overhead shot facing back', from: 2092, to: 2140, poses: true,
        player: { mode: 'run', runDir: -1, vx: -3.5, coast: 1, runTicks: 10, facing: 'left' } },
      { name: 'B at a high dropping ball while walking: volley shot', from: 1750, to: 1790, poses: true,
        player: { facing: 'right', vx: 2.3125 } },
      { name: 'B at a ball dropping close: overhead shot', from: 1846, to: 1880, poses: true,
        player: { facing: 'right' } },
      { name: 'B at a ball dropping right above: volley shot at once', from: 2437, to: 2470, poses: true,
        player: { facing: 'right', vx: 1.5625 } },
      { name: 'B at a ball near the feet: overhead shot', from: 2197, to: 2240, poses: true,
        player: { facing: 'right', vx: 2.3125 } },
    ],
  },
};

function runScenario({ ticks, frames }, sc) {
  const i0 = ticks.findIndex((t) => t.f === sc.from);
  const t0 = ticks[i0];
  const s = createPractice(t0.px, t0.bx);
  Object.assign(s.player, { tick: t0.it, z: t0.pz, vx: t0.pvx, vz: t0.pvz }, sc.player);
  Object.assign(s.ball, { z: t0.bz < 1 ? 0 : t0.bz, vx: t0.bvx, vz: t0.bvz, hang: t0.hang });
  framePlayer(s.player);
  const off = [];
  let poses = 0;
  let poseFrames = 0;
  for (let i = i0 + 1; ticks[i] && ticks[i].f <= sc.to; i++) {
    const t = ticks[i];
    tickPractice(s, t);
    const { player: p, ball: b } = s;
    const problems = [];
    if (Math.abs(p.x - t.px) > TOLERANCE || Math.abs(p.z - t.pz) > TOLERANCE
      || Math.abs(b.x - t.bx) > BALL_TOLERANCE || Math.abs(b.z - t.bz) > BALL_TOLERANCE) {
      problems.push(`player ${p.x.toFixed(1)},${p.z.toFixed(1)} want ${t.px.toFixed(1)},${t.pz.toFixed(1)}; `
        + `ball ${b.x.toFixed(1)},${b.z.toFixed(1)} want ${t.bx.toFixed(1)},${t.bz.toFixed(1)}`);
    }
    const next = ticks[i + 1] ? ticks[i + 1].f : t.f + 3;
    for (let f = t.f; f < next; f++) {
      const pose = framePlayer(p);
      const want = frames[f + SPRITE_LAG];
      if (!want || want.pose === null) continue;
      poseFrames += 1;
      if (pose === want.pose && p.facing === want.facing) poses += 1;
      else if (sc.poses && f === t.f) problems.push(`pose ${pose}${p.facing[0]} want ${want.pose}${want.facing[0]}`);
    }
    if (problems.length) off.push(`${t.f}: ${problems.join('; ')}`);
  }
  return { off, poses: `${poses}/${poseFrames}` };
}

// Ground movement only (walk, run, skid; the run boost is a known approximation): per tick,
// from the recorded position, does the logic produce the recorded velocity and pose?
function groundMovement({ ticks, frames }, [from, to]) {
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

let failed = 0;
for (const [name, { ground, scenarios }] of Object.entries(RECORDINGS)) {
  const file = new URL(`./.cache/${name}.json`, import.meta.url);
  if (!existsSync(file)) {
    console.log(`skip ${name}: no tools/.cache/${name}.json (run py tools/export_trace.py)`);
    continue;
  }
  const trace = JSON.parse(readFileSync(file));
  console.log(name);
  if (ground) {
    const g = groundMovement(trace, ground);
    console.log(`     ground movement ${ground.join('-')}: velocity exact ${g.velocity} ticks, `
      + `pose+facing exact ${g.poses} frames`);
  }
  for (const sc of scenarios) {
    const { off, poses } = runScenario(trace, sc);
    console.log(`${off.length ? 'FAIL' : 'ok  '} ${sc.from}-${sc.to} ${sc.name} (poses ${poses})`
      + `${off.length ? ` (${off.length} ticks off)` : ''}`);
    off.slice(0, 4).forEach((line) => console.log(`       ${line}`));
    if (off.length) failed += 1;
  }
}
process.exitCode = failed ? 1 : 0;
