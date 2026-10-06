// Replays the original's recorded input through the game logic and compares it with RAM.
// Needs tools/.cache/<recording>.json from tools/export_trace.py. Run: node tools/check_replay.mjs
import { existsSync, readFileSync } from 'node:fs';
import { createPlayer, drawnFacing, framePlayer, tickPlayer } from '../js/game/player.js';
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
  'no-ball': {
    scenarios: [
      { name: 'Up held, then double-tapped: run and sprint on the spot', from: 16, to: 90, poses: true,
        player: { facing: 'left' } },
      { name: 'Down double-tapped: run and sprint to the right', from: 127, to: 200, poses: true,
        player: { facing: 'right', vx: 0.8125 } },
      { name: 'jump, B: overhead kick in the air', from: 418, to: 530, poses: true,
        player: { facing: 'right' } },
      { name: 'jump, B + back: bicycle kick', from: 533, to: 645, poses: true,
        player: { facing: 'right' } },
      { name: 'jump, B + forward: volley in the air', from: 676, to: 780, poses: true,
        player: { mode: 'air', facing: 'right', prevA: true, prevB: true } },
      { name: 'A far from the ball: kick in the air', from: 898, to: 960, poses: true,
        player: { facing: 'right' } },
      { name: 'B far from the ball: overhead kick', from: 967, to: 1035, poses: true,
        player: { facing: 'right' } },
      { name: 'walk left, B + left: dive, slide, get up, B: dive again', from: 1039, to: 1170, poses: true,
        player: { facing: 'right' } },
      { name: 'walk right, B + right: dive, slide, get up', from: 1222, to: 1309, poses: true,
        player: { facing: 'right' } },
    ],
  },
  'shot-close': {
    scenarios: [
      { name: 'shot with the ball, it comes back off the wall and stops short', from: 55, to: 268, poses: true,
        player: { facing: 'right', hasBall: true } },
      { name: 'B at a ball lying out of reach: overhead kick still hits it; back again', from: 273, to: 463, poses: true,
        player: { facing: 'right' } },
      { name: 'B at a ball lying out of reach again, back off the wall', from: 463, to: 570, poses: true,
        player: { facing: 'right' } },
      { name: 'shot with the ball that came back to the feet', from: 676, to: 890, poses: true,
        player: { facing: 'right', hasBall: true } },
    ],
  },
  'run-shot': {
    scenarios: [
      { name: 'walk, run, sprint with the ball, A+B: jump with it, B: shot in the air', from: 82, to: 228, poses: true,
        player: { facing: 'right', hasBall: true } },
      { name: 'sprint with the ball, A then A+B: jump, B: shot in the air', from: 425, to: 535, poses: true,
        player: { mode: 'run', runDir: 1, vx: 3.5, runTicks: 2, hasBall: true, facing: 'right',
          animation: 'run', animFacing: 'right', animFrame: 3 } },
      { name: 'run and sprint back towards the returning ball, skid', from: 549, to: 585, poses: true,
        player: { mode: 'run', runDir: 1, vx: 3.5, runTicks: 1, facing: 'right',
          animation: 'run', animFacing: 'right', animFrame: 3 } },
      { name: 'walk, run, A+B: jump with the ball, B: shot in the air', from: 735, to: 860, poses: true,
        player: { facing: 'right', hasBall: true } },
    ],
  },
  'on-ball': {
    scenarios: [
      { name: 'walk, jump onto the ball, stand up on it, ride: run and sprint', from: 374, to: 503, poses: true,
        player: { facing: 'left' } },
      { name: 'skid on the ball, A+B + forward: flick it up and drop off', from: 503, to: 572, poses: true,
        player: { onBall: true, mode: 'run', runDir: -1, vx: -3.25, runTicks: 20, z: 13, facing: 'left',
          animation: 'ride', animFacing: 'left', animFrame: 6 }, practice: { rideFrac: 0.766 } },
      { name: 'jump onto the ball again, ride, sprint, coast', from: 1202, to: 1340, poses: true,
        player: { facing: 'right' } },
      { name: 'on the ball: walk taps, then a run', from: 1487, to: 1545, poses: true,
        player: { onBall: true, z: 13, facing: 'right', vx: 2.3125, prevDir: 1, tapDir: 1 }, practice: { rideFrac: 0.824 } },
      { name: 'riding, A+B: jump off and the ball rolls on', from: 1661, to: 1700, poses: true,
        player: { onBall: true, mode: 'run', runDir: 1, vx: 3.25, runTicks: 20, z: 13, facing: 'right',
          animation: 'ride', animFacing: 'right', animFrame: 0 }, practice: { rideFrac: 0.824 } },
      { name: 'run, jump over a ball: take it on the way up, B: overhead turning round', from: 1804, to: 1880, poses: true,
        player: { mode: 'run', runDir: -1, vx: -3.5, runTicks: 2, facing: 'left', prevDir: -1,
          animation: 'run', animFacing: 'left', animFrame: 3 } },
    ],
  },
  'jump-ball': {
    scenarios: [
      { name: 'jump with the ball, B: toss it ahead, overhead shot', from: 266, to: 345, poses: true,
        player: { mode: 'air', hasBall: true, facing: 'right' } },
      { name: 'jump with the ball, B + forward: toss it high, volley shot', from: 611, to: 695, poses: true,
        player: { mode: 'air', hasBall: true, facing: 'right' } },
      { name: 'jump with the ball, B + back: toss it back, bicycle shot', from: 962, to: 1040, poses: true,
        player: { mode: 'air', hasBall: true, facing: 'right' } },
    ],
  },
};

function runScenario({ ticks, frames }, sc) {
  const i0 = ticks.filter((t) => t.f <= sc.from).length - 1;
  const t0 = ticks[i0];
  const s = createPractice(t0.px, t0.bx);
  Object.assign(s.player, { tick: t0.it, z: t0.pz, vx: t0.pvx, vz: t0.pvz }, sc.player);
  Object.assign(s.ball, { z: t0.bz < 1 ? 0 : t0.bz, vx: t0.bvx, vz: t0.bvz, hang: t0.hang });
  Object.assign(s, sc.practice);
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
      const facing = drawnFacing(p, pose);
      if (pose === want.pose && facing === want.facing) poses += 1;
      else if (sc.poses && f === t.f) problems.push(`pose ${pose}${facing[0]} want ${want.pose}${want.facing[0]}`);
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
