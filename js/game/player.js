// Speeds are px per logic tick (3 frames), measured from a RAM dump of the original.
const WALK_SPEED = 2.3125;
const WALK_DECEL = 0.75;
const RUN_SPEED = 3.5;
const BOOST_SPEED = 5;
// The original's boost rule depends on state not visible in the recording; approximated.
const BOOST_TICKS = 7;
const BOOST_MIN_RUN_TICKS = 3;
const COAST_TICKS = 15;
const RUN_DECEL = 1;
const DOUBLE_TAP_TICKS = 8;
const MIN_X = 27.5;
const MAX_X = 229;

const POSE = { stand: 0, walk1: 1, walk2: 2, run1: 3, sprint1: 4, sprint2: 5, skid: 6 };

const ANIMATIONS = {
  stand: { poses: [POSE.stand], frames: 1 },
  walk: { poses: [POSE.walk1, POSE.stand, POSE.walk2, POSE.stand], frames: 6 },
  run: { poses: [POSE.run1, POSE.stand], frames: 6 },
  sprint: { poses: [POSE.sprint1, POSE.sprint2], frames: 3 },
  skid: { poses: [POSE.skid], frames: 1 },
};

export function createPlayer(x) {
  return {
    x,
    vx: 0,
    facing: 'right',
    mode: 'walk',
    runDir: 0,
    boost: 0,
    coast: 0,
    runTicks: 0,
    prevDir: 0,
    tapDir: 0,
    tapTick: -Infinity,
    skidPause: false,
    skidHold: 0,
    tick: 0,
    animation: 'stand',
    animFacing: 'right',
    animFrame: 0,
  };
}

function approachZero(v, step) {
  return v > 0 ? Math.max(0, v - step) : Math.min(0, v + step);
}

export function tickPlayer(p, input) {
  const dir = input.left === input.right ? 0 : input.left ? -1 : 1;
  const pressed = dir !== 0 && dir !== p.prevDir;
  p.prevDir = dir;
  p.tick += 1;
  if (p.skidHold > 0) p.skidHold -= 1;

  if (pressed) {
    if (p.mode === 'run' && dir === p.runDir) {
      if (p.boost === 0 && p.runTicks >= BOOST_MIN_RUN_TICKS) p.boost = BOOST_TICKS;
    } else if (p.mode === 'walk' && dir === p.tapDir && p.tick - p.tapTick <= DOUBLE_TAP_TICKS) {
      p.mode = 'run';
      p.runDir = dir;
      p.facing = dir < 0 ? 'left' : 'right';
      p.boost = 0;
      p.coast = 0;
      p.runTicks = 0;
      p.tapTick = -Infinity;
    } else {
      p.tapDir = dir;
      p.tapTick = p.tick;
    }
  }

  let skidStart = false;
  if (p.mode === 'run') {
    p.runTicks += 1;
    if (dir === -p.runDir) {
      skidStart = true;
    } else if (p.boost > 0) {
      p.vx = BOOST_SPEED * p.runDir;
      p.boost -= 1;
    } else {
      p.vx = RUN_SPEED * p.runDir;
      p.coast = dir === p.runDir ? 0 : p.coast + 1;
      if (p.coast > COAST_TICKS) skidStart = true;
    }
  }

  if (skidStart) {
    // The original holds still for the first tick of a skid, still in the running pose.
    p.mode = 'skid';
    p.skidPause = true;
    p.vx = RUN_SPEED * p.runDir;
    return;
  }

  if (p.mode === 'skid') {
    p.skidPause = false;
    p.vx = approachZero(p.vx, RUN_DECEL);
    if (p.vx === 0) {
      p.mode = 'walk';
      p.skidHold = 1;
    }
  } else if (p.mode === 'walk') {
    if (dir !== 0) {
      p.vx = WALK_SPEED * dir;
      p.facing = dir < 0 ? 'left' : 'right';
    } else {
      p.vx = approachZero(p.vx, WALK_DECEL);
    }
  }

  p.x = Math.min(MAX_X, Math.max(MIN_X, p.x + p.vx));
  if ((p.x === MIN_X || p.x === MAX_X) && p.mode === 'run') {
    p.mode = 'walk';
    p.vx = 0;
  }
}

function currentAnimation(p) {
  if (p.mode === 'skid') return p.skidPause ? p.animation : 'skid';
  if (p.skidHold > 0) return 'skid';
  if (p.mode === 'run') return Math.abs(p.vx) > RUN_SPEED ? 'sprint' : 'run';
  return p.prevDir === 0 || p.vx === 0 ? 'stand' : 'walk';
}

export function framePlayer(p) {
  const animation = currentAnimation(p);
  if (animation !== p.animation || p.facing !== p.animFacing) {
    p.animation = animation;
    p.animFacing = p.facing;
    p.animFrame = 0;
  }
  const { poses, frames } = ANIMATIONS[animation];
  const pose = poses[Math.floor(p.animFrame / frames) % poses.length];
  p.animFrame += 1;
  return pose;
}
