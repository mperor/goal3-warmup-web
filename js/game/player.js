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

const JUMP_SPEED = 4;
const GRAVITY = 0.5;
const AIR_CONTROL = 3 / 64;
const LAND_TICKS = 5;
const LAND_DECEL = 1;
const AB_WINDOW_TICKS = 2;

export const POSE = {
  stand: 0, walk1: 1, walk2: 2, run1: 3, sprint1: 4, sprint2: 5, skid: 6, air: 7, jumpKick: 8, land: 9,
  windUp: 10, overhead1: 11, overhead2: 12, overheadOwnBall: 13, overhead: 14,
  flip1: 15, flip2: 16, flip3: 17, flip4: 18, lift: 19, volley: 20,
};

const ANIMATIONS = {
  stand: { poses: [POSE.stand], frames: 1 },
  walk: { poses: [POSE.walk1, POSE.stand, POSE.walk2, POSE.stand], frames: 6 },
  run: { poses: [POSE.run1, POSE.stand], frames: 6 },
  sprint: { poses: [POSE.sprint1, POSE.sprint2], frames: 3 },
  skid: { poses: [POSE.skid], frames: 1 },
};

// Scripted actions: [pose, ticks] steps, and events emitted at a tick index (0 = the press tick).
const ACTIONS = {
  lift: { steps: [[POSE.lift, 5]], events: { 1: 'lift' } },
  jumpKick: { steps: [[POSE.air, 3], [POSE.jumpKick, 8]], events: { 3: 'jumpKick' } },
  volley: { steps: [[POSE.air, 1], [POSE.windUp, 7], [POSE.volley, 4]], events: { 8: 'chip' } },
  groundVolley: { steps: [[POSE.volley, 6]], events: {} },
  overheadOwnBall: {
    steps: [[POSE.air, 4], [POSE.overhead1, 3], [POSE.overhead2, 1], [POSE.overheadOwnBall, 7]],
    events: { 0: 'float', 8: 'hit' },
  },
  overhead: {
    steps: [[POSE.air, 2], [POSE.overhead1, 3], [POSE.overhead2, 1], [POSE.overhead, 7]],
    events: { 7: 'hit' },
  },
  bicycle: {
    steps: [[POSE.air, 2], [POSE.windUp, 4], [POSE.flip1, 1], [POSE.flip2, 2], [POSE.flip3, 2], [POSE.flip4, 1]],
    events: { 7: 'hitBehind' },
  },
};

export function createPlayer(x) {
  return {
    x,
    z: 0,
    vx: 0,
    vz: 0,
    facing: 'right',
    mode: 'walk',
    runDir: 0,
    boost: 0,
    coast: 0,
    runTicks: 0,
    prevDir: 0,
    prevA: false,
    prevB: false,
    abTick: -Infinity,
    tapDir: 0,
    tapTick: -Infinity,
    skidPause: false,
    skidHold: 0,
    landTicks: 0,
    airActionUsed: false,
    settleTicks: 0,
    readyToKick: false,
    action: null,
    hasBall: false,
    trapping: false,
    tick: 0,
    animation: 'stand',
    animFacing: 'right',
    animFrame: 0,
  };
}

const facingSign = (p) => (p.facing === 'left' ? -1 : 1);
const clampX = (x) => Math.min(MAX_X, Math.max(MIN_X, x));

function approachZero(v, step) {
  return v > 0 ? Math.max(0, v - step) : Math.min(0, v + step);
}

export function startAction(p, name) {
  p.action = { ...ACTIONS[name], name, t: 0 };
}

function runAction(p, events) {
  const a = p.action;
  if (!a) return;
  if (a.events[a.t]) events.push(a.events[a.t]);
  a.t += 1;
  if (a.t >= a.steps.reduce((n, [, ticks]) => n + ticks, 0)) p.action = null;
}

function actionPose(a) {
  let t = a.t;
  for (const [pose, ticks] of a.steps) {
    if (t < ticks) return pose;
    t -= ticks;
  }
  return a.steps[a.steps.length - 1][0];
}

function jump(p) {
  p.mode = 'air';
  p.vz = JUMP_SPEED;
  p.airActionUsed = false;
}

function airTick(p, dir, aEdge, bEdge, events) {
  if (!p.airActionUsed && (aEdge || bEdge)) {
    p.airActionUsed = true;
    p.vz = JUMP_SPEED;
    p.vx /= 2;
    if (aEdge) {
      startAction(p, p.hasBall ? 'jumpKick' : 'volley');
    } else if (dir === -facingSign(p)) {
      p.facing = dir < 0 ? 'left' : 'right';
      startAction(p, 'bicycle');
    } else if (p.hasBall) {
      // Every recorded overhead with the player's own ball turned him to the right (towards goal?).
      p.facing = 'right';
      startAction(p, 'overheadOwnBall');
    } else {
      startAction(p, 'overhead');
    }
  }
  if (dir !== 0 && p.action?.name !== 'bicycle') p.vx += dir * AIR_CONTROL;
  runAction(p, events);

  p.x = clampX(p.x + p.vx);
  p.z += p.vz;
  p.vz -= GRAVITY;
  if (p.z <= 0) {
    p.z = 0;
    p.vz = 0;
    p.mode = 'land';
    p.landTicks = LAND_TICKS;
    p.action = null;
  }
}

function groundTick(p, dir, pressed) {
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

  p.x = clampX(p.x + p.vx);
  if ((p.x === MIN_X || p.x === MAX_X) && p.mode === 'run') {
    p.mode = 'walk';
    p.vx = 0;
  }
}

// Advances one logic tick; returns the ball events of this tick ('lift', 'hit', ...).
export function tickPlayer(p, input) {
  const dir = input.left === input.right ? 0 : input.left ? -1 : 1;
  const pressed = dir !== 0 && dir !== p.prevDir;
  const aEdge = input.a && !p.prevA;
  const bEdge = input.b && !p.prevB;
  if ((aEdge || bEdge) && !p.prevA && !p.prevB) p.abTick = p.tick;
  p.prevDir = dir;
  p.prevA = input.a;
  p.prevB = input.b;
  p.tick += 1;
  if (p.skidHold > 0) p.skidHold -= 1;
  const events = [];

  if (p.mode === 'air') {
    airTick(p, dir, aEdge, bEdge, events);
    return events;
  }

  if (p.mode === 'land') {
    p.vx = approachZero(p.vx, LAND_DECEL);
    p.x = clampX(p.x + p.vx);
    p.landTicks -= 1;
    if (p.landTicks === 0) p.mode = 'walk';
    return events;
  }

  if (p.action) {
    runAction(p, events);
    return events;
  }

  // A+B together (pressed within a couple of ticks of each other, as on a pad).
  const ground = p.mode === 'walk' || p.mode === 'run';
  const abPressed = ground && input.a && input.b && p.tick - p.abTick <= AB_WINDOW_TICKS;
  if (abPressed && p.hasBall && p.vx === 0) {
    startAction(p, 'lift');
    runAction(p, events);
    return events;
  }
  if (abPressed) {
    jump(p);
    airTick(p, 0, false, false, events);
    return events;
  }

  p.readyToKick = p.mode === 'walk' && input.a && !input.b && !p.hasBall;
  if ((p.trapping || p.readyToKick) && p.mode === 'walk') {
    p.vx = 0;
    return events;
  }
  if (p.settleTicks > 0) {
    // After trapping the ball the player stays put a moment; turning is already allowed.
    p.settleTicks -= 1;
    if (p.settleTicks === 0 && dir !== 0) p.facing = dir < 0 ? 'left' : 'right';
    return events;
  }

  groundTick(p, dir, pressed);
  return events;
}

function currentAnimation(p) {
  if (p.action) return `action:${actionPose(p.action)}`;
  if (p.mode === 'air') return `action:${POSE.air}`;
  if (p.mode === 'land') return `action:${POSE.land}`;
  if (p.trapping || p.readyToKick) return `action:${POSE.windUp}`;
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
  if (animation.startsWith('action:')) return Number(animation.slice(7));
  const { poses, frames } = ANIMATIONS[animation];
  const pose = poses[Math.floor(p.animFrame / frames) % poses.length];
  p.animFrame += 1;
  return pose;
}

export function isRunning(p) {
  return p.mode === 'run' && Math.abs(p.vx) === RUN_SPEED;
}
