// Replays the original's input through the game logic and compares it with the recorded RAM,
// tick by tick (tools/check_replay.mjs, tools/compare_sim.mjs).
import { drawnFacing, framePlayer } from '../js/game/player.js';
import { createPractice, tickPractice } from '../js/game/practice.js';

const TOLERANCE = 1.01;
const BALL_TOLERANCE = 2.01; // the original keeps a resting ball at z ~0.48 and x fractions we drop
export const SPRITE_LAG = 4;

// Sets the given fields, into the groups of the state too ({ run: { dir: 1 } } keeps run's others).
function merge(target, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key], value);
    else target[key] = value;
  }
}

// A scenario starts from the recorded state at `from`, set by hand where RAM alone is not enough
// (`tapAgo`: the last press of a direction, that many ticks before).
// With `poses`, the displayed pose and facing must match on every frame too.
// Returns the ticks that are off (`at`: frame, `text`), and the pose frames that match.
export function runScenario({ ticks, frames }, sc) {
  const i0 = ticks.filter((t) => t.f <= sc.from).length - 1;
  const t0 = ticks[i0];
  const s = createPractice(t0.px, t0.bx);
  merge(s.player, { tick: t0.it, z: t0.pz, vx: t0.pvx, vz: t0.pvz });
  merge(s.player, sc.player ?? {});
  if (sc.tapAgo !== undefined) s.player.input.tapTick = t0.it - sc.tapAgo;
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
    if (problems.length) off.push({ at: t.f, text: `${t.f}: ${problems.join('; ')}` });
  }
  return { off, poses: `${poses}/${poseFrames}` };
}
