// Speeds are px per logic tick (3 frames), measured from a RAM dump of the original.
const WALK_SPEED = 2.3125;
const WALK_DECEL = 0.75;
const RUN_SPEED = 3.5;
const BOOST_SPEED = 5;
// Jumping out of a boost to the left while holding left (this tick or the last) goes faster.
// Recorded twice to the left; to the right the same jump keeps the boost speed (three times).
const BOOST_JUMP_LEFT_SPEED = -6;
// The original's boost rule depends on state not visible in the recording; approximated.
const BOOST_TICKS = 7;
const BOOST_MIN_RUN_TICKS = 3;
const COAST_TICKS = 15;
const RUN_DECEL = 1;
const DOUBLE_TAP_TICKS = 8;
// Soft side walls: a player past these whole pixels is pushed back 1 px per pixel over, each tick.
const WALL_LEFT = 32;
const WALL_RIGHT = 224;

// Up or Down on this screen (no depth to move in): the player treads on the spot, and they count
// as the facing direction for starting a run or a boost. Held during a run they slow it down.
const VERTICAL_RUN_FACTOR = 0.7071;

const JUMP_SPEED = 4;
const GRAVITY = 0.5;
const AIR_CONTROL = 3 / 64;
const LAND_TICKS = 5;
const LAND_DECEL = 1;
// A or B alone on the ground waits this long for the other button (A+B) before it acts.
const AB_WINDOW_TICKS = 2;
// B with the facing direction, without the ball: a dive, a slide on landing, then getting up.
const DIVE_SPEED = 4;
const DIVE_VZ = 3;
const SLIDE_DECEL = 0.625;
// Pushing along on the ground after a dive (13 pushes recorded, all alike).
const CRAWL_READY_SPEED = 2.75;
const CRAWL_BRACE_TICKS = 3;
const CRAWL_PUSH_TICKS = 3;
const CRAWL_SPEED = 4;
// Riding the ball: dropping onto a ball lying still lands on it (crouched at MOUNT_Z), then the
// player stands on top at RIDE_Z and the ball rolls under him; runs are a little slower there.
const MOUNT_DX = 6;
const MOUNT_Z = 9;
const RIDE_Z = 13;
const RIDE_RUN_SPEED = 3.25;

export const POSE = {
  stand: 0, walk1: 1, walk2: 2, run1: 3, sprint1: 4, sprint2: 5, skid: 6, air: 7, jumpKick: 8, land: 9,
  windUp: 10, overhead1: 11, overhead2: 12, overheadOwnBall: 13, overhead: 14,
  flip1: 15, flip2: 16, flip3: 17, flip4: 18, lift: 19, volley: 20, pass: 21, dive: 22, slide: 23,
  crawl: 24,
};

// Poses the original draws mirrored against the way the player faces: the bicycle kick's turn
// and the slide after a dive.
const MIRRORED_POSES = new Set([POSE.flip2, POSE.flip3, POSE.flip4, POSE.slide]);

export function drawnFacing(p, pose) {
  if (!MIRRORED_POSES.has(pose)) return p.facing;
  return p.facing === 'left' ? 'right' : 'left';
}

const ANIMATIONS = {
  stand: { poses: [POSE.stand], frames: 1 },
  walk: { poses: [POSE.walk1, POSE.stand, POSE.walk2, POSE.stand], frames: 6 },
  // Running on the ball: the walking steps, twice as fast.
  ride: { poses: [POSE.walk1, POSE.stand, POSE.walk2, POSE.stand], frames: 3 },
  run: { poses: [POSE.run1, POSE.stand], frames: 6 },
  skid: { poses: [POSE.skid], frames: 1 },
};

// Scripted actions: [pose, ticks] steps, and events emitted at a tick index (0 = the first tick).
// An action is drawn from the end of its first tick, so the first step lasts one tick more.
// A `strike` action emits 'strike:<kind>:<tick>' on every tick after the first until the ball is hit.
// An action with `hits` emits its event on every tick of that window until the ball is hit.
const ACTIONS = {
  lift: { steps: [[POSE.lift, 5]], events: { 1: 'lift' } },
  jumpKick: { steps: [[POSE.air, 3], [POSE.jumpKick, 8]], events: { 3: 'jumpKick' } },
  volley: { steps: [[POSE.air, 2], [POSE.windUp, 7], [POSE.volley, 4]], events: { 8: 'chip' } },
  // B with the facing direction in the air: the same volley, hit as a shot.
  volleyShotAir: { steps: [[POSE.air, 2], [POSE.windUp, 7], [POSE.volley, 4]], events: { 8: 'hit' } },
  // The same with the player's own ball: tossed up high first. No steering on the toss tick.
  volleyOwnBall: { steps: [[POSE.air, 5], [POSE.windUp, 4], [POSE.volley, 3]], steerFrom: 1, events: { 0: 'toss', 8: 'hit' } },
  // On the ground, A or B alone once the A+B window has passed.
  pass: { steps: [[POSE.pass, 5], [POSE.jumpKick, 5]], decel: 1, events: { 4: 'pass' } },
  shot: { steps: [[POSE.overhead1, 5], [POSE.overhead2, 2], [POSE.overheadOwnBall, 5]], decel: 1, events: { 6: 'shot' } },
  groundVolley: { steps: [[POSE.windUp, 4], [POSE.volley, 6]], decel: 1, events: {}, strike: 'volley' },
  volleyShot: { steps: [[POSE.windUp, 4], [POSE.volley, 6]], decel: 1, events: {}, strike: 'volleyShot' },
  groundOverhead: {
    steps: [[POSE.overhead1, 4], [POSE.overhead2, 1], [POSE.overhead, 7]], decel: 1, events: {}, strike: 'overheadShot',
  },
  // A+B with a direction while running with the ball: skid, then flick it up over the head.
  flick: { steps: [[POSE.skid, 2], [POSE.jumpKick, 2], [POSE.volley, 4]], decel: 1, events: { 3: 'flickUp', 4: 'flick' } },
  overheadOwnBall: {
    steps: [[POSE.air, 5], [POSE.overhead1, 3], [POSE.overhead2, 1], [POSE.overheadOwnBall, 7]],
    events: { 0: 'float', 8: 'hit' },
  },
  // Meets the ball whenever it comes into reach while the leg is up (not on the overhead2 tick).
  overhead: {
    steps: [[POSE.air, 3], [POSE.overhead1, 3], [POSE.overhead2, 1], [POSE.overhead, 7]],
    events: {}, hits: { event: 'hit', from: 3, to: 12, skip: [5] },
  },
  bicycle: {
    // Turned towards the kick, then back the way the player faced before it.
    steps: [[POSE.air, 3], [POSE.windUp, 4], [POSE.flip1, 1], [POSE.flip2, 2], [POSE.flip3, 2], [POSE.flip4, 1], [POSE.air, 3]],
    events: {}, hits: { event: 'hitBehind', from: 7, to: 8 },
  },
  // With the player's own ball: tossed up the way he turned, met a tick later, the turn starts a tick earlier.
  bicycleOwnBall: {
    steps: [[POSE.air, 2], [POSE.windUp, 4], [POSE.flip1, 1], [POSE.flip2, 2], [POSE.flip3, 2], [POSE.flip4, 1], [POSE.air, 3]],
    events: { 0: 'toss', 8: 'hitBehind' },
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
    boostRest: 0,
    boostQueued: false,
    afterSkid: false,
    runQueued: 0,
    coast: 0,
    runTicks: 0,
    prevDir: 0,
    prevA: false,
    prevB: false,
    abTick: -Infinity,
    pending: null,
    pendingDir: 0,
    prevVertical: false,
    vertical: false,
    verticalTap: false,
    sprinting: false,
    landed: false,
    fromDive: false,
    crawlTicks: 0,
    crawlDir: 0,
    pushTicks: 0,
    onBall: false,
    rising: false,
    ballBelow: null,
    tapDir: 0,
    tapTick: -Infinity,
    skidPause: false,
    skidHold: 0,
    landTicks: 0,
    airActionUsed: false,
    settleTicks: 0,
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

function wallPush(x) {
  const px = Math.floor(x);
  return px < WALL_LEFT ? WALL_LEFT - px : px > WALL_RIGHT ? WALL_RIGHT - px : 0;
}

// Returns the wall push applied.
function moveX(p) {
  const push = wallPush(p.x);
  p.x += p.vx + push;
  return push;
}

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
  if (a.strike && a.t > 0 && !a.struck) events.push(`strike:${a.strike}:${a.t}`);
  const h = a.hits;
  if (h && !a.struck && a.t >= h.from && a.t <= h.to && !h.skip?.includes(a.t)) events.push(h.event);
  a.t += 1;
  if (a.t >= a.steps.reduce((n, [, ticks]) => n + ticks, 0)) {
    if (a.turnBack) p.facing = a.turnBack;
    p.action = null;
  }
}

function actionPose(a) {
  let t = a.t;
  for (const [pose, ticks] of a.steps) {
    if (t < ticks) return pose;
    t -= ticks;
  }
  return a.steps[a.steps.length - 1][0];
}

export function groundAction(p, events) {
  if (p.action.decel) {
    p.vx = approachZero(p.vx, p.action.decel);
    moveX(p);
  }
  runAction(p, events);
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
    if (aEdge) {
      p.vx /= 2;
      startAction(p, p.hasBall ? 'jumpKick' : 'volley');
    } else if (dir !== 0 && dir === facingSign(p) && !p.hasBall) {
      // Keeps its drift, unlike the other kicks in the air.
      startAction(p, 'volleyShotAir');
    } else if (dir !== 0 && dir === facingSign(p)) {
      p.vx /= 2;
      startAction(p, 'volleyOwnBall');
    } else if (dir === -facingSign(p)) {
      const facing = p.facing;
      p.vx = 0;
      p.facing = dir < 0 ? 'left' : 'right';
      startAction(p, p.hasBall ? 'bicycleOwnBall' : 'bicycle');
      p.action.turnBack = facing;
    } else if (p.hasBall) {
      p.vx /= 2;
      // Every recorded overhead with the player's own ball faced right (towards goal?).
      const turned = p.facing !== 'right';
      p.facing = 'right';
      startAction(p, 'overheadOwnBall');
      p.action.turned = turned;
    } else {
      p.vx /= 2;
      startAction(p, 'overhead');
    }
  }
  const steers = !p.action || (!p.action.name.startsWith('bicycle') && p.action.t >= (p.action.steerFrom ?? 0));
  if (p.action?.decel) p.vx = approachZero(p.vx, p.action.decel);
  else if (dir !== 0 && steers) p.vx += dir * AIR_CONTROL;

  // Dropping past the top of a ball lying close below: land on it.
  const top = p.ballBelow;
  if (top !== null && !p.action && p.vz < 0 && p.z >= RIDE_Z && p.z + p.vz < RIDE_Z
    && Math.abs(top - p.x) <= MOUNT_DX) {
    mount(p);
    return;
  }

  runAction(p, events);
  moveX(p);
  p.z += p.vz;
  p.vz -= GRAVITY;
  if (p.z <= 0) {
    p.z = 0;
    p.vz = 0;
    p.mode = 'land';
    p.landTicks = LAND_TICKS + 1;
    p.touchdown = true;
    if (p.action?.turnBack) p.facing = p.action.turnBack;
    p.action = null;
  }
}

function mount(p) {
  p.onBall = true;
  p.vz = 0;
  p.z = MOUNT_Z;
  p.vx = approachZero(p.vx, LAND_DECEL);
  moveX(p);
  p.mode = 'land';
  p.landTicks = LAND_TICKS;
}

function startRun(p, dir) {
  p.mode = 'run';
  p.runDir = dir;
  p.facing = dir < 0 ? 'left' : 'right';
  p.boost = 0;
  p.coast = 0;
  p.runTicks = 0;
  p.tapTick = -Infinity;
}

function groundTick(p, dir, pressed, verticalPressed) {
  // Up or Down alone stands in for the facing direction when starting a run or a boost.
  if (verticalPressed && !pressed && dir === 0) {
    dir = facingSign(p);
    pressed = true;
    p.verticalTap = true;
  }
  if (p.boostRest > 0) p.boostRest -= 1;
  if (p.boostQueued && p.boostRest === 0 && p.mode === 'run') {
    // A boost that had to wait starts with a tick on the spot.
    p.boostQueued = false;
    p.boost = BOOST_TICKS - 1;
    p.vx = 0;
    p.sprinting = true;
    p.runTicks += 1;
    return;
  }
  if (pressed) {
    if (p.mode === 'run' && dir === p.runDir) {
      // Right after a boost the next one has to wait a tick.
      if (p.boostRest > 0) p.boostQueued = true;
      else if (p.boost === 0 && p.runTicks >= BOOST_MIN_RUN_TICKS) p.boost = BOOST_TICKS;
    } else if (p.mode === 'walk' && dir === p.tapDir && p.tick - p.tapTick <= DOUBLE_TAP_TICKS) {
      startRun(p, dir);
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
      // Up or Down held stops a boost from getting anywhere sideways.
      p.vx = p.vertical ? 0 : BOOST_SPEED * p.runDir;
      p.boost -= 1;
      if (p.boost === 0) p.boostRest = 2;
      p.sprinting = true;
    } else {
      p.vx = (p.onBall ? RIDE_RUN_SPEED : RUN_SPEED) * p.runDir * (p.vertical ? VERTICAL_RUN_FACTOR : 1);
      p.coast = dir === p.runDir || p.vertical ? 0 : p.coast + 1;
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
      p.afterSkid = true;
    }
  } else if (p.mode === 'walk' && p.afterSkid) {
    // The tick after a skid the player turns where he is heading, without moving yet.
    p.afterSkid = false;
    if (dir !== 0) p.facing = dir < 0 ? 'left' : 'right';
    p.vx = 0;
  } else if (p.mode === 'walk') {
    if (p.verticalTap) {
      p.vx = approachZero(p.vx, WALK_DECEL);
    } else if (dir !== 0) {
      p.vx = WALK_SPEED * dir;
      p.facing = dir < 0 ? 'left' : 'right';
    } else {
      p.vx = approachZero(p.vx, WALK_DECEL);
    }
  }

  // A run into a wall ends once the boost is over.
  if (moveX(p) !== 0 && p.mode === 'run' && p.boost === 0) p.mode = 'walk';
}

// Advances one logic tick; returns the ball events of this tick ('lift', 'hit', ...).
export function tickPlayer(p, input) {
  const dir = input.left === input.right ? 0 : input.left ? -1 : 1;
  const pressed = dir !== 0 && dir !== p.prevDir;
  const lastDir = p.prevDir;
  const vertical = Boolean(input.up || input.down);
  const verticalPressed = vertical && !p.prevVertical;
  p.prevVertical = vertical;
  p.vertical = vertical;
  p.verticalTap = false;
  const wasSprinting = p.sprinting;
  p.sprinting = false;
  const aEdge = input.a && !p.prevA;
  const bEdge = input.b && !p.prevB;
  if ((aEdge || bEdge) && !p.prevA && !p.prevB) {
    p.abTick = p.tick;
    // On the ball only A+B does something, straight away.
    if (p.mode !== 'air' && !p.action && !p.onBall) {
      p.pending = aEdge && bEdge ? 'ab' : aEdge ? 'a' : 'b';
      p.pendingDir = dir;
    }
  } else if ((aEdge || bEdge) && p.pending && p.pending !== 'ab' && p.tick - p.abTick <= AB_WINDOW_TICKS) {
    // The other button within the window: A+B, e.g. pressed while still landing.
    p.pending = 'ab';
  }
  p.prevDir = dir;
  p.prevA = input.a;
  p.prevB = input.b;
  p.tick += 1;
  if (p.skidHold > 0) p.skidHold -= 1;
  const events = [];

  if (p.mode === 'air') {
    p.pending = null;
    airTick(p, dir, aEdge, bEdge, events);
    return events;
  }

  if (p.mode === 'dive') {
    diveTick(p, dir, events);
    return events;
  }

  if (p.mode === 'land') {
    p.touchdown = false;
    // B while getting up from a dive dives again, a tick after the A+B window.
    if (p.fromDive && p.pending === 'b' && p.tick - p.abTick > AB_WINDOW_TICKS + 1) {
      p.pending = null;
      dive(p);
      diveTick(p, 0, events);
      return events;
    }
    // Taps while landing count: a double tap there starts the run once the player is up.
    if (pressed && dir === p.tapDir && p.tick - p.tapTick <= DOUBLE_TAP_TICKS) {
      p.runQueued = dir;
    } else if (pressed) {
      p.tapDir = dir;
      p.tapTick = p.tick;
    }
    p.vx = approachZero(p.vx, LAND_DECEL);
    moveX(p);
    p.landTicks -= 1;
    if (p.landTicks === 0) {
      p.mode = 'walk';
      p.fromDive = false;
      p.rising = p.onBall;
    }
    return kickReady(p) ? startKick(p, events) : events;
  }

  if (p.action) {
    groundAction(p, events);
    return events;
  }

  if (p.rising) {
    // Standing up on the ball takes the tick, unless a run was queued while landing: a direction
    // pressed then neither moves him nor counts as a tap.
    p.rising = false;
    p.z = RIDE_Z;
    if (!p.runQueued) return events;
  }
  if (p.runQueued && p.mode === 'walk') {
    startRun(p, p.runQueued);
    p.runQueued = 0;
  }

  // A+B together (pressed within a couple of ticks of each other, as on a pad).
  const ground = p.mode === 'walk' || p.mode === 'run';
  // On the ball the second button counts however long the first has been held.
  const abPressed = ground && input.a && input.b
    && (p.tick - p.abTick <= AB_WINDOW_TICKS || (p.onBall && (aEdge || bEdge)));
  if (abPressed) p.pending = null;
  if (abPressed && p.onBall && dir !== 0) {
    // With a direction: kick the ball up from under the feet and drop off it.
    p.onBall = false;
    p.mode = 'air';
    p.vz = 0;
    p.airActionUsed = true;
    startAction(p, 'flick');
    groundAction(p, events);
    return ['offBall', ...events];
  }
  if (abPressed && p.onBall) {
    // Without one: jump off and let the ball roll on.
    p.onBall = false;
    jump(p);
    airTick(p, 0, false, false, events);
    return ['offBall', ...events];
  }
  if (abPressed && p.hasBall && p.vx === 0) {
    startAction(p, 'lift');
    groundAction(p, events);
    return events;
  }
  if (abPressed && p.hasBall && p.mode === 'run' && dir === p.runDir) {
    p.mode = 'walk';
    startAction(p, 'flick');
    groundAction(p, events);
    return events;
  }
  if (abPressed) {
    if (p.mode === 'run' && wasSprinting && p.runDir < 0 && (dir < 0 || lastDir < 0)) p.vx = BOOST_JUMP_LEFT_SPEED;
    jump(p);
    airTick(p, 0, false, false, events);
    return events;
  }

  if (p.trapping && p.mode === 'walk') {
    p.vx = 0;
    return events;
  }
  if (p.settleTicks > 0) {
    // After trapping the ball the player stays put a moment; turning is already allowed.
    p.settleTicks -= 1;
    if (p.settleTicks === 0 && dir !== 0) p.facing = dir < 0 ? 'left' : 'right';
    return events;
  }

  // Without the ball, A or B ends a run (a skid still goes first); with it the run goes on.
  if (p.pending && !p.hasBall && p.mode === 'run' && dir !== -p.runDir) p.mode = 'walk';
  if (kickReady(p)) return startKick(p, events);
  groundTick(p, dir, pressed, verticalPressed);
  // A skid that just ended lets a waiting kick go on the same tick.
  if (kickReady(p)) return startKick(p, events);
  return events;
}

// B with the facing direction and no ball dives; A+B that had to wait jumps; any other kick
// is the caller's to pick.
function startKick(p, events) {
  if (p.pending === 'ab') {
    p.pending = null;
    jump(p);
    airTick(p, 0, false, false, events);
    return events;
  }
  if (p.pending === 'b' && !p.hasBall && p.pendingDir !== 0 && p.pendingDir === facingSign(p)) {
    p.pending = null;
    dive(p);
    diveTick(p, p.prevDir, events);
    return events;
  }
  return [...events, kick(p)];
}

// Facing stays as it is: diving the other way goes backwards.
function dive(p, dir = facingSign(p)) {
  p.mode = 'dive';
  p.vx = DIVE_SPEED * dir;
  p.vz = DIVE_VZ;
  p.landed = false;
  p.fromDive = true;
  p.crawlTicks = 0;
  p.pushTicks = 0;
}

// In the air like a jump (with the same steering), then a slide that ends in getting up.
// While in the air, the landing tick included, the dive can hit the ball ('dive').
// Lying after it, a direction pressed or held (once the slide has slowed down) pushes the player
// along on his front, either way: three ticks bracing (POSE.crawl), one more, then a push.
// B there dives again, the way he was pushing if a direction came with it.
function diveTick(p, dir, events) {
  if (p.landed && p.pending === 'b' && p.tick - p.abTick > AB_WINDOW_TICKS + 1) {
    p.pending = null;
    dive(p, p.pendingDir || facingSign(p));
  }
  if (p.landed && dir !== 0 && p.crawlTicks === 0 && p.pushTicks === 0 && Math.abs(p.vx) <= CRAWL_READY_SPEED) {
    p.crawlTicks = CRAWL_BRACE_TICKS + 1;
    p.crawlDir = dir;
  }
  if (!p.landed) {
    if (dir !== 0) p.vx += dir * AIR_CONTROL;
    moveX(p);
    p.z += p.vz;
    p.vz -= GRAVITY;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
      p.landed = true;
    }
    events.push('dive');
  } else if (p.pushTicks > 0) {
    p.pushTicks -= 1;
    p.vx = CRAWL_SPEED * p.crawlDir;
    moveX(p);
  } else if (p.vx !== 0 || p.crawlTicks > 0) {
    p.vx = approachZero(p.vx, SLIDE_DECEL);
    moveX(p);
    if (p.crawlTicks > 0) {
      p.crawlTicks -= 1;
      if (p.crawlTicks === 0) p.pushTicks = CRAWL_PUSH_TICKS;
    }
  } else {
    p.mode = 'land';
    p.landTicks = LAND_TICKS;
  }
}

// Kicking out of a run with the ball is not in the recordings; it goes like the others.
const kickReady = (p) => p.pending && (p.mode === 'walk' || p.mode === 'run') && p.tick - p.abTick > AB_WINDOW_TICKS;

// The A+B window has passed with one button: the caller picks the action ('kickA' / 'kickB').
// The kick faces the direction held with the button, even if a skid came in between.
function kick(p) {
  const event = p.pending === 'a' ? 'kickA' : 'kickB';
  if (p.pendingDir !== 0) p.facing = p.pendingDir < 0 ? 'left' : 'right';
  p.mode = 'walk';
  p.pending = null;
  return event;
}

function currentAnimation(p) {
  if (p.action) return `action:${actionPose(p.action)}`;
  if (p.mode === 'air') return `action:${POSE.air}`;
  if (p.mode === 'land') return `action:${p.touchdown ? POSE.air : POSE.land}`;
  if (p.mode === 'dive' && p.crawlTicks > 0) return `action:${POSE.crawl}`;
  if (p.mode === 'dive') return `action:${p.vz >= 0 && !p.landed ? POSE.dive : POSE.slide}`;
  if (p.trapping) return `action:${POSE.windUp}`;
  if (p.mode === 'skid') return p.skidPause ? p.animation : 'skid';
  if (p.skidHold > 0) return 'skid';
  // Sprint poses alternate each tick of a boost, the last tick repeating the second one.
  if (p.mode === 'run' && p.sprinting) return `action:${p.boost > 0 && p.boost % 2 === 0 ? POSE.sprint1 : POSE.sprint2}`;
  if (p.mode === 'run') return p.onBall ? 'ride' : 'run';
  if (p.vertical) return 'walk';
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
