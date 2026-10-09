import { POSE } from './animation.js';
import { REACH } from './reach.js';

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
const BOOST_MIN_RUN_TICKS = 2;
const COAST_TICKS = 15;
const RUN_DECEL = 1;
const DOUBLE_TAP_TICKS = 6;
// Soft side walls: a player past these whole pixels is pushed back 1 px per pixel over, each tick.
const WALL_LEFT = 32;
const WALL_RIGHT = 224;

// Up or Down on this screen (no depth to move in): the player treads on the spot, and they count
// as the facing direction for starting a run or a boost. Held while walking or running they slow it down.
const VERTICAL_FACTOR = 0.7071;

const JUMP_SPEED = 4;
// Kicks in the air go towards the goal, on the right.
const GOAL_DIR = 1;
const GRAVITY = 0.5;
const AIR_CONTROL = 3 / 64;
// Steering with a diagonal (a direction with Up or Down) is weaker.
const AIR_CONTROL_DIAGONAL = 1 / 32;
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
// Measured with tools/simulate.py (the mount-* plans): 14.8 px away landed on it, 15.6 px missed.
const MOUNT_Z = 9;
const RIDE_Z = 13;
const RIDE_RUN_SPEED = 3.25;

// Scripted actions: [pose, ticks] steps, and events emitted at a tick index (0 = the first tick).
// An action is drawn from the end of its first tick, so the first step lasts one tick more.
// A `strike` action emits { type: 'strike', kind, t } on every tick after the first until the ball is hit.
// An action with `hits` emits its event on every tick of that window until the ball is hit.
export const ACTIONS = {
  // A press on its last ticks is kept for when it is over (B there: a volley at the ball coming down).
  lift: { steps: [[POSE.lift, 6]], events: { 1: 'lift' }, inputFrom: 4, abFrom: 5 },
  // A at a ball in the air above him: the same motion, meeting the ball as it drops to the foot.
  keepUp: { steps: [[POSE.lift, 6]], decel: 1, events: {}, hits: { event: 'keepUp', from: 1, to: 5 } },
  keepUpBehind: { steps: [[POSE.volley, 6]], decel: 1, events: {}, hits: { event: 'keepUp', from: 1, to: 5 } },
  jumpKick: { steps: [[POSE.air, 3], [POSE.jumpKick, 8]], events: { 3: 'jumpKick' } },
  volley: { steps: [[POSE.air, 2], [POSE.windUp, 7], [POSE.volley, 4]], events: { 8: 'chip' } },
  // B with the facing direction in the air: the same volley, hit as a shot.
  volleyShotAir: { steps: [[POSE.air, 2], [POSE.windUp, 7], [POSE.volley, 4]], events: {}, hits: { event: 'hit', from: 1, to: 8 } },
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
    events: {}, hits: { event: 'hitBehind', from: 5, to: 8 },
  },
  // A boost by Up or Down with the ball: a feint into the depth of the pitch, a stop, then a dash
  // back out (on this screen only the sideways part shows). `speeds` are px/tick along the run,
  // before the depth factor; the run goes on after it (tools/simulate.py, the feint-* plans).
  feint: {
    steps: [[POSE.stand, 2], [POSE.feint, 1], [POSE.dive, 3], [POSE.air, 1], [POSE.dash, 2]],
    speeds: [4, 4, 4, 0, 0, 0, 16, 16], events: {},
  },
  // With the player's own ball: tossed up the way he turned, met a tick later, the turn starts a tick earlier.
  bicycleOwnBall: {
    steps: [[POSE.air, 2], [POSE.windUp, 4], [POSE.flip1, 1], [POSE.flip2, 2], [POSE.flip3, 2], [POSE.flip4, 1], [POSE.air, 3]],
    events: { 0: 'toss', 8: 'hitBehind' },
  },
};

// Every field the player has, from the start (nothing is added later): the state can be shown,
// saved as JSON and compared whole.
export function createPlayer(x) {
  return {
    x,
    z: 0,
    vx: 0,
    vz: 0,
    facing: 'right',
    mode: 'walk', // walk, run, skid, air, land, dive
    tick: 0,
    action: null, // a scripted move (ACTIONS) under way: { name, t, ... }
    // The buttons: edges, double taps, what is held.
    input: {
      prevDir: 0,
      prevA: false,
      prevB: false,
      prevVertical: false,
      vertical: false, // Up or Down held
      verticalTap: false, // Up or Down pressed alone, standing in for the facing direction
      stepped: false, // moved this tick by a direction held at the end of an action
      queuedDir: 0,
      tapDir: 0, // the last press of a direction, for double taps: which way, which key, when
      tapKey: null,
      tapTick: null,
      abTick: null, // when A or B was last pressed after neither was held
    },
    // A or B alone waiting out the A+B window before it acts.
    press: { button: null, dir: 0, facing: 0, vertical: null, queued: false, released: false },
    // The kick the window let go: the direction and Up or Down held with it.
    kick: { dir: 0, vertical: null },
    run: {
      dir: 0,
      ticks: 0,
      coast: 0, // ticks without the direction held
      boost: 0, // ticks of a boost left
      boostRest: 0,
      boostQueued: false,
      boostKey: null,
      sprinting: false,
      queued: 0, // a double tap while landing: the run starts once up
    },
    skid: { after: false },
    air: { actionUsed: false },
    land: { ticks: 0 },
    dive: { landed: false, fromDive: false, crawlTicks: 0, crawlDir: 0, pushTicks: 0 },
    // With the ball (set by js/game/practice.js, which moves it).
    hasBall: false,
    ballHigh: false, // high enough to volley
    ballBelow: null, // x of a ball lying below, to land on
    onBall: false, // standing on it
    rising: false, // getting up onto it
    trapping: false,
    settleTicks: 0,
    juggleTicks: 0,
    // What the mechanics leave for the pose alone (js/game/animation.js reads it, nothing else does).
    look: {
      touchdown: false, // the landing tick still shows the air pose
      skidPause: false, // the first tick of a skid holds the running pose
      skidHold: 0, // ticks the skid pose stays after the skid
      trapCaught: false, // trapped this tick: the trap pose once more
      trapLow: false, // trapping with the foot rather than the thigh
      juggleLow: false, // juggling it off the foot rather than the thigh
    },
    anim: { name: 'stand', facing: 'right', frame: 0 }, // the animation playing (animation.js)
  };
}

// Ticks since a recorded tick (null: never).
const since = (p, tick) => (tick === null ? Infinity : p.tick - tick);

const facingSign = (p) => (p.facing === 'left' ? -1 : 1);

function wallPush(x) {
  const px = Math.floor(x);
  return px < WALL_LEFT ? WALL_LEFT - px : px > WALL_RIGHT ? WALL_RIGHT - px : 0;
}

// At a wall (a run ends there): on the right from its pixel on, on the left once past it.
function atWall(p) {
  const px = Math.floor(p.x);
  return px < WALL_LEFT || px >= WALL_RIGHT;
}

// Returns the wall push applied.
function moveX(p) {
  const push = wallPush(p.x);
  p.x += p.vx + push;
  return push;
}

export function approachZero(v, step) {
  return v > 0 ? Math.max(0, v - step) : Math.min(0, v + step);
}

export function startAction(p, name) {
  p.action = { ...ACTIONS[name], name, t: 0, struck: false, turned: false, turnBack: null, hitTick: null };
}

function runAction(p, events) {
  const a = p.action;
  if (!a) return;
  if (a.events[a.t]) events.push({ type: a.events[a.t] });
  if (a.strike && a.t > 0 && !a.struck) events.push({ type: 'strike', kind: a.strike, t: a.t });
  const h = a.hits;
  if (h && !a.struck && a.t >= h.from && a.t <= h.to && !h.skip?.includes(a.t)) {
    a.hitTick = a.t;
    events.push({ type: h.event });
  }
  a.t += 1;
  if (a.t >= a.steps.reduce((n, [, ticks]) => n + ticks, 0)) {
    if (a.turnBack) p.facing = a.turnBack;
    // On the ground the player already turns the way a direction is held on the last tick.
    if (p.mode !== 'air' && p.input.prevDir !== 0) p.facing = p.input.prevDir < 0 ? 'left' : 'right';
    p.action = null;
  }
}

export function groundAction(p, events) {
  const { speeds } = p.action;
  if (speeds) {
    const speed = speeds[p.action.t];
    p.vx = (speed ?? RUN_SPEED) * p.run.dir * (speed !== undefined || p.input.vertical ? VERTICAL_FACTOR : 1);
    moveX(p);
  } else if (p.action.decel) {
    p.vx = approachZero(p.vx, p.action.decel);
    moveX(p);
  }
  runAction(p, events);
}

function jump(p) {
  p.mode = 'air';
  p.vz = JUMP_SPEED;
  p.air.actionUsed = false;
}

function airTick(p, dir, aEdge, bEdge, events) {
  if (!p.air.actionUsed && (aEdge || bEdge)) {
    p.air.actionUsed = true;
    p.vz = JUMP_SPEED;
    if (aEdge) {
      p.vx /= 2;
      startAction(p, p.hasBall ? 'jumpKick' : 'volley');
    } else {
      // B in the air always shoots towards the goal on the right (the airshots recording):
      // towards it a volley, away from it a bicycle kick over his head, else an overhead kick.
      const facing = p.facing;
      if (dir === GOAL_DIR) {
        p.facing = 'right';
        if (!p.hasBall) {
          // Keeps its drift, unlike the other kicks in the air.
          startAction(p, 'volleyShotAir');
        } else {
          p.vx /= 2;
          startAction(p, 'volleyOwnBall');
          p.action.turned = facing !== 'right';
        }
      } else if (dir === -GOAL_DIR) {
        p.vx = 0;
        p.facing = 'left';
        startAction(p, p.hasBall ? 'bicycleOwnBall' : 'bicycle');
        // He comes out of it facing the goal.
        p.action.turnBack = 'right';
        p.action.turned = facing !== 'left';
      } else {
        p.vx /= 2;
        p.facing = 'right';
        startAction(p, p.hasBall ? 'overheadOwnBall' : 'overhead');
        p.action.turned = facing !== 'right';
      }
    }
  }
  const steers = !p.action || (!p.action.name.startsWith('bicycle') && p.action.t >= (p.action.steerFrom ?? 0));
  if (p.action?.decel) p.vx = approachZero(p.vx, p.action.decel);
  else if (dir !== 0 && steers) p.vx += dir * (p.input.vertical ? AIR_CONTROL_DIAGONAL : AIR_CONTROL);

  // Coming down onto a ball lying below, from its height down: he lands on it (it rolls under him).
  const top = p.ballBelow;
  if (top !== null && !p.action && p.vz < 0 && REACH.mount.fits({ dx: top - p.x, dz: -p.z })) {
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
    p.land.ticks = LAND_TICKS + 1;
    p.look.touchdown = true;
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
  p.land.ticks = LAND_TICKS;
}

function startRun(p, dir) {
  p.mode = 'run';
  p.run.dir = dir;
  p.facing = dir < 0 ? 'left' : 'right';
  p.run.boost = 0;
  p.run.coast = 0;
  p.run.ticks = 0;
}

// Records a press of a direction key (`key`: 'up' or 'down' standing in for the facing
// direction, null for left or right); returns whether it doubles the last press of that key.
function tap(p, dir, key) {
  const double = dir === p.input.tapDir && key === p.input.tapKey && since(p, p.input.tapTick) <= DOUBLE_TAP_TICKS;
  p.input.tapDir = dir;
  p.input.tapKey = key;
  p.input.tapTick = p.tick;
  return double;
}

function groundTick(p, dir, pressed, verticalKey) {
  p.input.stepped = dir === 0 && p.input.queuedDir !== 0;
  if (p.input.stepped) dir = p.input.queuedDir;
  p.input.queuedDir = 0;
  // A run at a wall ends (once the boost is over), before anything else: on that tick the player
  // slows down as from a walk, whatever is held.
  if (p.mode === 'run' && p.run.boost === 0 && atWall(p)) {
    p.mode = 'walk';
    p.vx = approachZero(p.vx, WALK_DECEL);
    moveX(p);
    return;
  }

  // Up or Down alone stands in for the facing direction when starting a run or a boost.
  let key = null;
  if (verticalKey && !pressed && dir === 0) {
    dir = facingSign(p);
    pressed = true;
    p.input.verticalTap = true;
    key = verticalKey;
  }
  if (p.run.boostRest > 0) p.run.boostRest -= 1;
  if (p.run.boostQueued && p.run.boostRest === 0 && p.mode === 'run') {
    // A boost that had to wait starts with a tick on the spot.
    p.run.boostQueued = false;
    p.run.boost = BOOST_TICKS - 1;
    p.vx = 0;
    p.run.sprinting = true;
    p.run.ticks += 1;
    return;
  }
  // A double tap starts a run, and in a run the way it goes, a boost.
  if (pressed && !(p.juggleTicks > 0) && tap(p, dir, key)) {
    if (p.mode === 'run' && dir === p.run.dir && key && p.hasBall && p.run.boost === 0 && p.run.ticks >= BOOST_MIN_RUN_TICKS) {
      startAction(p, 'feint');
      groundAction(p, []);
      return;
    } else if (p.mode === 'run' && dir === p.run.dir) {
      // Right after a boost the next one has to wait a tick; none while knocking the ball up.
      if (p.run.boostRest > 0) p.run.boostQueued = true;
      else if (p.run.boost === 0 && p.run.ticks >= BOOST_MIN_RUN_TICKS && !(p.juggleTicks > 0)) {
        p.run.boost = BOOST_TICKS;
        p.run.boostKey = key;
      }
    } else if (p.mode === 'walk') {
      startRun(p, dir);
    }
  }

  let skidStart = false;
  if (p.mode === 'run') {
    p.run.ticks += 1;
    if (dir === -p.run.dir) {
      skidStart = true;
    } else if (p.run.boost > 0) {
      // With Up or Down held it goes into the depth, so nowhere sideways; started by the direction,
      // its first tick is still diagonal.
      const diagonal = p.run.boostKey === null && p.run.boost === BOOST_TICKS;
      p.vx = p.input.vertical ? (diagonal ? BOOST_SPEED * VERTICAL_FACTOR * p.run.dir : 0) : BOOST_SPEED * p.run.dir;
      p.run.boost -= 1;
      if (p.run.boost === 0) p.run.boostRest = 2;
      p.run.sprinting = true;
    } else {
      p.vx = (p.onBall ? RIDE_RUN_SPEED : RUN_SPEED) * p.run.dir * (p.input.vertical ? VERTICAL_FACTOR : 1);
      p.run.coast = dir === p.run.dir || p.input.vertical ? 0 : p.run.coast + 1;
      // Without a direction held the run ends in a skid after a while, though not with the ball.
      if (p.run.coast > COAST_TICKS && !p.hasBall) skidStart = true;
    }
  }

  if (skidStart) {
    // The original holds still for the first tick of a skid, still in the running pose.
    p.mode = 'skid';
    p.look.skidPause = true;
    p.vx = RUN_SPEED * p.run.dir;
    return;
  }

  if (p.mode === 'skid') {
    p.look.skidPause = false;
    p.vx = approachZero(p.vx, RUN_DECEL);
    if (p.vx === 0) {
      p.mode = 'walk';
      p.look.skidHold = 1;
      p.skid.after = true;
    }
  } else if (p.mode === 'walk' && p.skid.after) {
    // The tick after a skid the player turns where he is heading, without moving yet.
    p.skid.after = false;
    if (dir !== 0) p.facing = dir < 0 ? 'left' : 'right';
    p.vx = 0;
  } else if (p.mode === 'walk') {
    if (p.input.verticalTap || (p.input.vertical && dir === 0)) {
      // Up or Down instead of a direction stops a walk at once.
      p.vx = 0;
    } else if (dir !== 0) {
      p.vx = WALK_SPEED * dir * (p.input.vertical ? VERTICAL_FACTOR : 1);
      p.facing = dir < 0 ? 'left' : 'right';
    } else {
      p.vx = approachZero(p.vx, WALK_DECEL);
    }
  }

  moveX(p);
}

// Advances one logic tick; returns what it asks of the ball this tick ({ type: 'lift' }, ...).
export function tickPlayer(p, input) {
  const dir = input.left === input.right ? 0 : input.left ? -1 : 1;
  const pressed = dir !== 0 && dir !== p.input.prevDir;
  const lastDir = p.input.prevDir;
  const vertical = Boolean(input.up || input.down);
  const verticalKey = vertical && !p.input.prevVertical ? (input.up ? 'up' : 'down') : null;
  p.input.prevVertical = vertical;
  p.input.vertical = vertical;
  p.input.verticalTap = false;
  p.input.stepped = false;
  p.look.trapCaught = false;
  if (p.juggleTicks > 0) p.juggleTicks -= 1;
  const wasSprinting = p.run.sprinting;
  p.run.sprinting = false;
  const aEdge = input.a && !p.input.prevA;
  const bEdge = input.b && !p.input.prevB;
  if ((aEdge || bEdge) && !p.input.prevA && !p.input.prevB) {
    p.input.abTick = p.tick;
    // On the ball only A+B does something, straight away.
    const from = p.action && (aEdge && bEdge ? p.action.abFrom : p.action.inputFrom);
    if (p.mode !== 'air' && (!p.action || p.action.t >= (from ?? Infinity)) && !p.onBall) {
      p.press.button = aEdge && bEdge ? 'ab' : aEdge ? 'a' : 'b';
      p.press.dir = dir;
      p.press.facing = facingSign(p);
      // Pressed on an action's last ticks: kept until it is over, A+B then jumps straight away.
      p.press.queued = Boolean(p.action);
      p.press.vertical = input.up ? 'up' : input.down ? 'down' : null;
    }
  } else if ((aEdge || bEdge) && p.press.button && p.press.button !== 'ab' && since(p, p.input.abTick) <= AB_WINDOW_TICKS) {
    // The other button within the window: A+B, e.g. pressed while still landing.
    p.press.button = 'ab';
  }
  // A or B let go before the A+B window is over: no A+B coming, the kick goes at once.
  p.press.released = (p.press.button === 'a' && !input.a) || (p.press.button === 'b' && !input.b);
  p.input.prevDir = dir;
  p.input.prevA = input.a;
  p.input.prevB = input.b;
  p.tick += 1;
  if (p.look.skidHold > 0) p.look.skidHold -= 1;
  const events = [];

  if (p.mode === 'air') {
    p.press.button = null;
    airTick(p, dir, aEdge, bEdge, events);
    return events;
  }

  if (p.mode === 'dive') {
    diveTick(p, dir, events);
    return events;
  }

  if (p.mode === 'land') {
    p.look.touchdown = false;
    // B while getting up from a dive dives again, a tick after the A+B window.
    if (p.dive.fromDive && p.press.button === 'b' && since(p, p.input.abTick) > AB_WINDOW_TICKS + 1) {
      p.press.button = null;
      dive(p);
      diveTick(p, 0, events);
      return events;
    }
    // Taps while landing count: a double tap there starts the run once the player is up.
    if (pressed && tap(p, dir, null)) p.run.queued = dir;
    p.vx = approachZero(p.vx, LAND_DECEL);
    moveX(p);
    p.land.ticks -= 1;
    if (p.land.ticks === 0) {
      p.mode = 'walk';
      if (dir !== 0) p.facing = dir < 0 ? 'left' : 'right';
      p.dive.fromDive = false;
      p.rising = p.onBall;
    }
    return kickReady(p) ? startKick(p, events) : events;
  }

  if (p.action) {
    // A direction tapped during a kick still counts towards a double tap; held on its last tick,
    // the player steps that way on the next one.
    if (pressed) tap(p, dir, null);
    groundAction(p, events);
    if (!p.action && dir !== 0) p.input.queuedDir = dir;
    return events;
  }

  if (p.rising) {
    // Standing up on the ball takes the tick, unless a run was queued while landing; a direction
    // held up to it walks him on (a direction pressed then neither moves him nor counts as a tap).
    p.rising = false;
    p.z = RIDE_Z;
    if (!p.run.queued && lastDir === 0) return events;
    if (!p.run.queued && dir === 0) p.input.queuedDir = lastDir;
  }
  if (p.run.queued && p.mode === 'walk') {
    startRun(p, p.run.queued);
    p.run.queued = 0;
  }

  // A+B together (pressed within a couple of ticks of each other, as on a pad).
  const ground = p.mode === 'walk' || p.mode === 'run';
  // On the ball the second button counts however long the first has been held.
  const abPressed = ground && input.a && input.b
    && (since(p, p.input.abTick) <= AB_WINDOW_TICKS || (p.onBall && (aEdge || bEdge)));
  if (abPressed) p.press.button = null;
  if (abPressed && p.onBall && dir !== 0) {
    // With a direction: kick the ball up from under the feet and drop off it.
    p.onBall = false;
    p.mode = 'air';
    p.vz = 0;
    p.air.actionUsed = true;
    startAction(p, 'flick');
    groundAction(p, events);
    return [{ type: 'offBall' }, ...events];
  }
  if (abPressed && p.onBall) {
    // Without one: jump off and let the ball roll on.
    p.onBall = false;
    jump(p);
    airTick(p, 0, false, false, events);
    return [{ type: 'offBall' }, ...events];
  }
  // Standing with the ball (or coming to a stop) A+B lifts it; with a direction, Up or Down held
  // the player jumps with it.
  if (abPressed && p.hasBall && p.mode === 'walk' && dir === 0 && !p.input.vertical) {
    startAction(p, 'lift');
    groundAction(p, events);
    return events;
  }
  // With the ball and the way he faces held (walking or running), A+B skids and flicks it up.
  if (abPressed && p.hasBall && dir !== 0 && dir === facingSign(p) && !p.input.vertical) {
    p.mode = 'walk';
    startAction(p, 'flick');
    groundAction(p, events);
    return events;
  }
  if (abPressed) {
    if (p.mode === 'run' && wasSprinting && p.run.dir < 0 && (dir < 0 || lastDir < 0)) p.vx = BOOST_JUMP_LEFT_SPEED;
    jump(p);
    airTick(p, dir, false, false, events);
    return events;
  }

  if (p.trapping && p.mode === 'walk') {
    // Trapping the ball he brakes to a stop.
    p.vx = approachZero(p.vx, 1);
    moveX(p);
    return events;
  }
  if (p.settleTicks > 0) {
    // After trapping the ball the player stays put a moment; turning is already allowed.
    p.settleTicks -= 1;
    if (p.settleTicks === 0 && dir !== 0) p.facing = dir < 0 ? 'left' : 'right';
    return events;
  }

  if (kickReady(p)) return startKick(p, events);
  // Knocking the ball up on the run he goes on at the same speed.
  if (p.juggleTicks > 0 && p.mode === 'run') {
    p.run.ticks += 1;
    moveX(p);
    return events;
  }
  groundTick(p, dir, pressed, verticalKey);
  // A skid that just ended lets a waiting kick go on the same tick.
  if (kickReady(p)) return startKick(p, events);
  return events;
}

// B with the facing direction and no ball dives; A+B that had to wait jumps; any other kick
// is the caller's to pick.
function startKick(p, events) {
  if (p.press.button === 'ab') {
    p.press.button = null;
    jump(p);
    airTick(p, p.input.prevDir, false, false, events);
    return events;
  }
  // Only the way he already faced when pressing B, and not at a ball high enough to volley.
  if (p.press.button === 'b' && !p.hasBall && !p.ballHigh && p.press.dir !== 0 && p.press.dir === p.press.facing) {
    p.press.button = null;
    dive(p);
    diveTick(p, p.input.prevDir, events);
    return events;
  }
  return [...events, kick(p)];
}

// Facing stays as it is: diving the other way goes backwards.
function dive(p, dir = facingSign(p)) {
  p.mode = 'dive';
  p.vx = DIVE_SPEED * dir;
  p.vz = DIVE_VZ;
  p.dive.landed = false;
  p.dive.fromDive = true;
  p.dive.crawlTicks = 0;
  p.dive.pushTicks = 0;
}

// In the air like a jump (with the same steering), then a slide that ends in getting up.
// While in the air, the landing tick included, the dive can hit the ball ('dive').
// Lying after it, a direction pressed or held (once the slide has slowed down) pushes the player
// along on his front, either way: three ticks bracing (POSE.crawl), one more, then a push.
// B there dives again, the way he was pushing if a direction came with it.
function diveTick(p, dir, events) {
  if (p.dive.landed && p.press.button === 'b' && since(p, p.input.abTick) > AB_WINDOW_TICKS + 1) {
    p.press.button = null;
    dive(p, p.press.dir || facingSign(p));
  }
  if (p.dive.landed && dir !== 0 && p.dive.crawlTicks === 0 && p.dive.pushTicks === 0 && Math.abs(p.vx) <= CRAWL_READY_SPEED) {
    p.dive.crawlTicks = CRAWL_BRACE_TICKS + 1;
    p.dive.crawlDir = dir;
  }
  if (!p.dive.landed) {
    if (dir !== 0) p.vx += dir * AIR_CONTROL;
    moveX(p);
    p.z += p.vz;
    p.vz -= GRAVITY;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
      p.dive.landed = true;
    }
    events.push({ type: 'dive' });
  } else if (p.dive.pushTicks > 0) {
    p.dive.pushTicks -= 1;
    p.vx = CRAWL_SPEED * p.dive.crawlDir;
    moveX(p);
  } else if (p.vx !== 0 || p.dive.crawlTicks > 0) {
    p.vx = approachZero(p.vx, SLIDE_DECEL);
    moveX(p);
    if (p.dive.crawlTicks > 0) {
      p.dive.crawlTicks -= 1;
      if (p.dive.crawlTicks === 0) p.dive.pushTicks = CRAWL_PUSH_TICKS;
    }
  } else {
    p.mode = 'land';
    p.land.ticks = LAND_TICKS;
  }
}

// Kicking out of a run with the ball is not in the recordings; it goes like the others.
const kickReady = (p) => p.press.button && (p.mode === 'walk' || p.mode === 'run')
  && (since(p, p.input.abTick) > AB_WINDOW_TICKS || p.press.released || (p.press.button === 'ab' && p.press.queued));

// The A+B window has passed with one button: the caller picks the action ({ type: 'groundKick', button }).
// The kick faces the direction held with the button, even if a skid came in between; the
// direction and Up or Down held with it stay in kickDir and kickVertical for the caller.
function kick(p) {
  const event = { type: 'groundKick', button: p.press.button === 'a' ? 'a' : 'b' };
  if (p.press.dir !== 0) p.facing = p.press.dir < 0 ? 'left' : 'right';
  p.kick.dir = p.press.dir;
  p.kick.vertical = p.press.vertical;
  p.mode = 'walk';
  p.press.button = null;
  return event;
}

// --- What the world tells the player ---
// The practice (js/game/practice.js) decides what the ball does to him; these carry it out, so the
// player's state is changed in this file only.

// A trap brakes the player to a stop this much per tick.
const TRAP_BRAKE = 1;
// Knocking the ball up on the run shows its pose this long.
const JUGGLE_POSE_TICKS = 3;

// What he sees of the ball before anyone moves this tick: the x of a ball lying below to land on
// (or null), and whether one is high enough to volley.
export function seeBall(p, { below, high }) {
  p.ballBelow = below;
  p.ballHigh = high;
}

// Caught in the air.
export function catchBall(p) {
  p.hasBall = true;
}

// Taken at the feet or in a jump; out of a trap he stands a tick more (and may turn).
export function takeBall(p) {
  p.hasBall = true;
  if (p.trapping) {
    p.settleTicks = 1;
    p.look.trapCaught = true;
  }
  p.trapping = false;
}

// Kicked or lifted off his feet.
export function loseBall(p) {
  p.hasBall = false;
}

// The action under way met the ball: it goes through without stopping it again.
export function struckBall(p) {
  if (p.action) p.action.struck = true;
}

// B on the ground kicks towards the goal on the right, whichever way he faced.
export function faceGoal(p) {
  p.facing = 'right';
}

// A or B alone on the ground, the kick the practice chose for the ball he has or sees.
export function startGroundKick(p, name) {
  startAction(p, name);
  p.trapping = false;
  groundAction(p, []);
}

// Knocked the ball up on the run: he keeps the speed he had (a boost ends there), and taps before
// it do not make a double tap with ones after.
export function juggled(p, { vx, x, low }) {
  p.vx = vx;
  p.x = x;
  p.run.boost = 0;
  p.run.sprinting = false;
  p.juggleTicks = JUGGLE_POSE_TICKS;
  p.input.tapTick = null;
  p.look.juggleLow = low;
}

export function setTrapping(p, on) {
  p.trapping = on;
}

// A trap starting, judged before either moved: he turns to the ball and brakes from the speed he
// had (keeping a push off a wall).
export function startTrap(p, { low, facing, x, vx }) {
  p.look.trapLow = low;
  p.facing = facing;
  const push = p.x - x - p.vx;
  p.vx = approachZero(vx, TRAP_BRAKE);
  p.x = x + p.vx + push;
}

export function faceBall(p, facing) {
  p.facing = facing;
}

// Running, not boosting (Up or Down held slows it down).
export function isRunning(p) {
  return p.mode === 'run' && !p.run.sprinting;
}
