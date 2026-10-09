// What the player looks like: his pose on each frame, from his state alone. Nothing here changes
// the game; the mechanics (player.js, practice.js) leave what only the pose needs in p.look, and
// the animation playing is kept in p.anim.

export const POSE = {
  stand: 0, walk1: 1, walk2: 2, run1: 3, sprint1: 4, sprint2: 5, skid: 6, air: 7, jumpKick: 8, land: 9,
  windUp: 10, overhead1: 11, overhead2: 12, overheadOwnBall: 13, overhead: 14,
  flip1: 15, flip2: 16, flip3: 17, flip4: 18, lift: 19, volley: 20, pass: 21, dive: 22, slide: 23,
  crawl: 24, feint: 25, dash: 26,
};

// Poses the original draws mirrored against the way the player faces: the bicycle kick's turn
// and the slide after a dive.
const MIRRORED_POSES = new Set([POSE.flip2, POSE.flip3, POSE.flip4, POSE.slide]);

export function drawnFacing(p, pose) {
  if (!MIRRORED_POSES.has(pose)) return p.facing;
  return p.facing === 'left' ? 'right' : 'left';
}

export const ANIMATIONS = {
  stand: { poses: [POSE.stand], frames: 1 },
  walk: { poses: [POSE.walk1, POSE.stand, POSE.walk2, POSE.stand], frames: 6 },
  // Treading on the spot (Up or Down) after an action or a run: the walk, from half a step earlier.
  tread: { poses: [POSE.stand, POSE.walk1, POSE.walk1, POSE.stand, POSE.stand, POSE.walk2, POSE.walk2, POSE.stand], frames: 3 },
  // Running on the ball: the walking steps, twice as fast.
  ride: { poses: [POSE.walk1, POSE.stand, POSE.walk2, POSE.stand], frames: 3 },
  run: { poses: [POSE.run1, POSE.stand], frames: 6 },
  skid: { poses: [POSE.skid], frames: 1 },
};

// The pose of an action on its tick.
function actionPose(a) {
  let t = a.t;
  for (const [pose, ticks] of a.steps) {
    if (t < ticks) return pose;
    t -= ticks;
  }
  return a.steps[a.steps.length - 1][0];
}

function currentAnimation(p) {
  if (p.action) return `action:${actionPose(p.action)}`;
  if (p.mode === 'air') return `action:${POSE.air}`;
  if (p.mode === 'land') return `action:${p.look.touchdown ? POSE.air : POSE.land}`;
  if (p.mode === 'dive' && p.dive.crawlTicks > 0) return `action:${POSE.crawl}`;
  if (p.mode === 'dive') return `action:${p.vz >= 0 && !p.dive.landed ? POSE.dive : POSE.slide}`;
  if (p.juggleTicks > 0) return `action:${p.look.juggleLow ? POSE.lift : POSE.windUp}`;
  if (p.trapping || p.look.trapCaught) return `action:${p.look.trapLow ? POSE.lift : POSE.windUp}`;
  if (p.mode === 'skid') return p.look.skidPause ? p.anim.name : 'skid';
  if (p.look.skidHold > 0) return 'skid';
  // Sprint poses alternate each tick of a boost, the last tick repeating the second one.
  if (p.mode === 'run' && p.run.sprinting) return `action:${p.run.boost > 0 && p.run.boost % 2 === 0 ? POSE.sprint1 : POSE.sprint2}`;
  if (p.mode === 'run') return p.onBall ? 'ride' : 'run';
  if (p.input.vertical) return p.anim.name === 'walk' || p.anim.name === 'stand' ? 'walk' : 'tread';
  if ((p.input.prevDir === 0 && !p.input.stepped) || p.vx === 0) return 'stand';
  // Walking on straight out of a run (stopped by a wall) starts half a step later, like treading.
  return p.anim.name === 'run' || p.anim.name === 'tread' ? 'tread' : 'walk';
}

export function framePlayer(p) {
  const animation = currentAnimation(p);
  if (animation !== p.anim.name || (p.facing !== p.anim.facing && animation !== 'walk')) {
    p.anim.name = animation;
    p.anim.facing = p.facing;
    p.anim.frame = 0;
  }
  if (animation.startsWith('action:')) return Number(animation.slice(7));
  const { poses, frames } = ANIMATIONS[animation];
  const pose = poses[Math.floor(p.anim.frame / frames) % poses.length];
  p.anim.frame += 1;
  return pose;
}
