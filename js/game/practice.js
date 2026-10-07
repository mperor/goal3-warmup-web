import { createBall, rollBall, tickBall } from './ball.js';
import { createPlayer, groundAction, isRunning, startAction, tickPlayer } from './player.js';

// Player-ball interaction on the ball-practice screen, measured from the recording.
const DRIBBLE_OFFSET = 12;
const LAND_DRIBBLE_OFFSET = 8;
const CAPTURE_DX = 12;
const CAPTURE_DZ = 1.5;
const NO_CAPTURE_TICKS = 10;
const HIT_DX = 16;
const HIT_DZ_MIN = -6;
const HIT_DZ_MAX = 22;
const SHOT_SPEED = 8;
const SHOT_HANG_TICKS = 13;
const TRAP_DX = 16;
const TRAP_MAX_Z = 24;
const TRAP_PULL = 0.5;
// Ground volleys: met at ~27 px or lower a chip, at ~31 px a much higher lob. Threshold guessed.
const VOLLEY_HIGH_Z = 29;
const CHIP_VX = 3;
const CHIP_VZ = 7;
const PASS_VZ = 8;
const FLOAT_LEAD = 0.25;
// B without the ball: a ball still this high when the kick starts is volleyed, a lower one is
// met with an overhead kick (recorded: ~31 px and up volleyed, 29 px and below overhead).
const VOLLEY_SHOT_MIN_Z = 30;
// Reach of the kicks from the ground, from the recorded hits and misses.
const STRIKES = {
  volley: { dx: 13, minZ: 0, maxZ: 32 },
  volleyShot: { dx: 16, minZ: 12, maxZ: 32 },
  // Once the leg is out (tick 5 on) it also reaches a ball lying ~19 px away.
  overheadShot: { dx: 16, minZ: 0, maxZ: 12, farDx: 20, farFrom: 5 },
};
// A shot from the ground lifts a low ball to this height.
const GROUND_SHOT_Z = 8;
// Kicked up from under the player's feet when he flicks it off a ride.
const RIDE_RELEASE_Z = 7;
// A player rising in a jump takes a ball lying under him (recorded at 15 px up).
const AIR_CAPTURE_DZ = 16;
const AIR_CAPTURE_LAG = 0.5;
// A ball in flight caught by a player in the air: caught up to 13.2 px ahead and 14.0 px below,
// missed at 15.5 px ahead and 14.1 px below.
const AIR_CATCH_DX = 14;
const AIR_CATCH_DZ_MIN = -14;
const HIGH_VOLLEY_VX = 4.734375;
const HIGH_VOLLEY_VZ = 10.25;
const FLICK_BEHIND = 12;
const FLICK_Z = 10;
const FLICK_VX = 2.25;
const FLICK_VZ = 9;
// B with a direction in the air with the ball: tossed up high the way the player faces (after
// turning, for the bicycle kick). One recording of each; whether vx depends on the speed is not known.
const TOSS_VX = { volleyOwnBall: 0x166 / 256, bicycleOwnBall: 2.5 };
const TOSS_VZ = 6.5;
const MOUNT_MAX_VX = 2;
// A dive hits the ball like a shot from the ground; reach from three hits and their near misses
// (missed 20.6 px away and 10.2 px below the player).
const DIVE_DX = 17;
const DIVE_DZ_MIN = -10;
const DIVE_DZ_MAX = 17;
// One backward dive recorded: hit 29.2 px ahead 17.3 px up, missed 27.2 px ahead 20.3 px up.
const BACK_DIVE_AHEAD = 30;
const BACK_DIVE_DZ_MAX = 18;
// Overhead kick in the air, from the recorded hits and misses: ahead hit 12.3 px away and 11.2 px
// up, missed 13.6 px away and 11.5 px up; behind hit 13.1 px away 5.9 px up, missed 10.9 px up.
const OVERHEAD_AHEAD = 13;
const OVERHEAD_DZ_MAX = 11.25;
const OVERHEAD_BEHIND = 14;
const OVERHEAD_BEHIND_DZ_MAX = 8;
// Bicycle kick: hit 22.3 px up, missed 23.5 px up.
const BICYCLE_DZ_MAX = 23;

export function createPractice(playerX, ballX) {
  return { player: createPlayer(playerX), ball: createBall(ballX), noCapture: 0, ballSteps: 1, rideFrac: 0, sounds: [] };
}

const sign = (p) => (p.facing === 'left' ? -1 : 1);

function release(s) {
  s.player.hasBall = false;
  s.noCapture = NO_CAPTURE_TICKS;
}

function inReach(p, b) {
  const dz = b.z - p.z;
  return Math.abs(b.x - p.x) <= HIT_DX && dz >= HIT_DZ_MIN && dz <= HIT_DZ_MAX;
}

// The overhead kick in the air reaches less high, and behind the player only low; the bicycle
// kick reaches a little higher.
function inKickReach(p, b) {
  const dz = b.z - p.z;
  if (p.action?.name === 'overhead') {
    const ahead = (b.x - p.x) * sign(p);
    if (dz < HIT_DZ_MIN) return false;
    return ahead >= 0 ? ahead <= OVERHEAD_AHEAD && dz <= OVERHEAD_DZ_MAX
      : -ahead <= OVERHEAD_BEHIND && dz <= OVERHEAD_BEHIND_DZ_MAX;
  }
  if (p.action?.name === 'bicycle') return Math.abs(b.x - p.x) <= HIT_DX && dz >= HIT_DZ_MIN && dz <= BICYCLE_DZ_MAX;
  return inReach(p, b);
}

// Diving backwards (facing the other way) the player meets a ball well ahead of where he faces.
function inDiveReach(p, b) {
  const dz = b.z - p.z;
  if (Math.sign(p.vx) === -sign(p)) {
    const ahead = (b.x - p.x) * sign(p);
    return ahead >= 0 && ahead <= BACK_DIVE_AHEAD && dz >= DIVE_DZ_MIN && dz <= BACK_DIVE_DZ_MAX;
  }
  return Math.abs(b.x - p.x) <= DIVE_DX && dz >= DIVE_DZ_MIN && dz <= DIVE_DZ_MAX;
}

function struck(s) {
  if (s.player.action) s.player.action.struck = true;
}

function shoot(s, dir) {
  const b = s.ball;
  release(s);
  // The shot leaves the foot with a head start: +24 px on the hit tick, 8 of them from the move.
  b.x += (3 * SHOT_SPEED - SHOT_SPEED) * dir;
  b.vx = SHOT_SPEED * dir;
  b.vz = 0;
  b.hang = SHOT_HANG_TICKS + 1; // counted down on the shot tick already
  s.sounds.push('shot');
}

function chip(s) {
  const { player: p, ball: b } = s;
  release(s);
  b.vx = CHIP_VX * sign(p);
  b.vz = CHIP_VZ;
  b.hang = 0;
  s.sounds.push('kick');
}

function groundShot(s) {
  shoot(s, sign(s.player));
  if (s.ball.z < GROUND_SHOT_Z) s.ball.z = GROUND_SHOT_Z;
}

// A or B alone on the ground: pass or shoot with the ball, otherwise get ready to kick it.
function startKick(s, button) {
  const { player: p, ball: b } = s;
  let name;
  const high = Math.max(0, b.z + b.vz) >= VOLLEY_SHOT_MIN_Z;
  if (p.hasBall) name = button === 'a' ? 'pass' : 'shot';
  // A without the ball and nothing high to volley swings the pass kick at the air.
  else if (button === 'a') name = high ? 'groundVolley' : 'pass';
  else name = high ? 'volleyShot' : 'groundOverhead';
  startAction(p, name);
  p.trapping = false;
  groundAction(p, []);
}

// A kick from the ground meets the ball once it comes into the action's reach.
// The action may end on this very tick, so the kind and the action tick come with the event.
function strike(s, kind, t) {
  const { player: p, ball: b } = s;
  const reach = STRIKES[kind];
  const dx = t >= reach.farFrom ? reach.farDx : reach.dx;
  const dz = b.z - p.z;
  if (Math.abs(b.x - p.x) > dx || dz < reach.minZ || dz > reach.maxZ) return;
  if (p.action) p.action.struck = true;
  if (kind !== 'volley') {
    groundShot(s);
  } else if (dz > VOLLEY_HIGH_Z) {
    release(s);
    b.vx = HIGH_VOLLEY_VX * sign(p);
    b.vz = HIGH_VOLLEY_VZ;
    b.hang = 0;
    s.ballSteps = 0;
    s.sounds.push('kick');
  } else {
    chip(s);
  }
}

function applyEvent(s, event) {
  const { player: p, ball: b } = s;
  if (event === 'lift' && p.hasBall) {
    release(s);
    b.vx = 0;
    b.vz = 8;
  } else if (event === 'jumpKick' && p.hasBall) {
    release(s);
    b.vx = CHIP_VX * sign(p);
    b.vz = CHIP_VZ;
    // The original leaves the ball in place on the kick tick and moves it twice on the next.
    s.ballSteps = 0;
    s.sounds.push('kick');
  } else if (event === 'flickUp' && s.flickFromRide) {
    s.flickFromRide = false;
    s.noCapture = NO_CAPTURE_TICKS;
    Object.assign(b, {
      x: Math.floor(p.x) - FLICK_BEHIND * sign(p) + s.rideFrac, z: Math.floor(p.z) + FLICK_Z, vx: 0, vz: 0, hang: 1,
    });
  } else if (event === 'flickUp' && p.hasBall) {
    release(s);
    Object.assign(b, { x: Math.floor(p.x) - FLICK_BEHIND * sign(p), z: FLICK_Z, vx: 0, vz: 0, hang: 1 });
  } else if (event === 'flick' && !p.hasBall) {
    b.vx = FLICK_VX * sign(p);
    b.vz = FLICK_VZ;
  } else if (event === 'float' && p.hasBall) {
    // Tossed up ahead of the player, just faster; turning round for the kick leaves it nearly still.
    release(s);
    b.vx = p.action.turned ? p.vx / 8 : p.vx + FLOAT_LEAD * sign(p);
    b.vz = 3.5;
  } else if (event === 'toss' && p.hasBall) {
    release(s);
    b.vx = TOSS_VX[p.action.name] * sign(p);
    b.vz = TOSS_VZ;
  } else if (event === 'pass' && p.hasBall) {
    release(s);
    b.vx = CHIP_VX * sign(p);
    b.vz = PASS_VZ;
    b.hang = 0;
    s.sounds.push('kick');
  } else if (event === 'shot' && p.hasBall) {
    groundShot(s);
  } else if (event.startsWith('strike:') && !p.hasBall) {
    const [, kind, t] = event.split(':');
    strike(s, kind, Number(t));
  } else if (event === 'dive' && !p.hasBall && inDiveReach(p, b)) {
    groundShot(s);
  } else if (event === 'chip' && !p.hasBall && inReach(p, b)) {
    chip(s);
  } else if (event === 'hit' && !p.hasBall && inKickReach(p, b)) {
    struck(s);
    shoot(s, sign(p));
  } else if (event === 'hitBehind' && !p.hasBall && inKickReach(p, b)) {
    struck(s);
    shoot(s, -sign(p));
  }
}

// Advances one logic tick. s.sounds lists the sound effects of the tick ('kick', 'shot', 'bounce',
// 'jump', 'land', 'pickup').
export function tickPractice(s, input) {
  const p = s.player;
  const before = { mode: p.mode, landed: p.landed, hasBall: p.hasBall };
  s.sounds = [];
  step(s, input);
  if (p.mode === 'air' && before.mode !== 'air' && p.vz > 0) s.sounds.push('jump');
  if ((before.mode === 'air' && p.mode === 'land') || (p.mode === 'dive' && p.landed && !before.landed)) s.sounds.push('land');
  if (p.hasBall && !before.hasBall) s.sounds.push('pickup');
}

function step(s, input) {
  const { player: p, ball: b } = s;
  // A ball on the ground is something to land on, also rolling (recorded at ~1.1 px/tick towards
  // the player; the speed limit is a guess).
  p.ballBelow = !p.hasBall && b.z < 1 && b.vz === 0 && Math.abs(b.vx) < MOUNT_MAX_VX ? b.x : null;
  // A ball in flight just ahead of a player in the air is caught; the original judges it before
  // either of them moves.
  const ahead = (b.x - p.x) * sign(p);
  const catchable = p.mode === 'air' && !p.action && b.z >= 1 && ahead >= 0 && ahead <= AIR_CATCH_DX
    && b.z - p.z >= AIR_CATCH_DZ_MIN && b.z - p.z <= CAPTURE_DZ;
  const ballX = b.x;
  const wasOnBall = p.onBall;
  const events = tickPlayer(p, input);
  if (p.onBall && !wasOnBall) s.rideFrac = b.x - Math.floor(b.x);
  if (events[0] === 'offBall') {
    s.noCapture = NO_CAPTURE_TICKS;
    if (p.action?.name === 'flick') {
      s.flickFromRide = true;
      Object.assign(b, { z: RIDE_RELEASE_Z, vx: 0, vz: 0, hang: 0 });
    } else {
      // Jumping off: the ball still rolls under the feet this tick, then goes on by itself.
      rollBall(b, p.vx);
      Object.assign(b, { x: Math.floor(p.x) + s.rideFrac, z: 0, vx: p.vx, vz: 0, hang: 0 });
      return;
    }
  }
  if (s.noCapture > 0) s.noCapture -= 1;
  const kick = events.find((e) => e === 'kickA' || e === 'kickB');
  if (kick) startKick(s, kick === 'kickA' ? 'a' : 'b');
  events.forEach((e) => applyEvent(s, e));

  if (p.onBall) {
    // Rolling under the rider's feet; the ball keeps its own sub-pixel position.
    rollBall(b, p.vx);
    Object.assign(b, { x: Math.floor(p.x) + s.rideFrac, z: 0, vx: p.vx, vz: 0, hang: 0 });
    return;
  }

  if (p.hasBall) {
    // Landing with the ball keeps it closer, until the last tick of the landing.
    const landing = p.mode === 'land' && p.landTicks > 1;
    const offset = landing ? LAND_DRIBBLE_OFFSET : DRIBBLE_OFFSET + (isRunning(p) ? (p.tick >> 1) & 3 : 0);
    const x = Math.floor(p.x) + offset * sign(p);
    rollBall(b, p.vx);
    Object.assign(b, { x, z: p.z, vx: p.vx, vz: 0, hang: 0 });
    p.trapping = false;
    return;
  }

  for (let i = 0; i < s.ballSteps; i++) if (tickBall(b)) s.sounds.push('bounce');
  s.ballSteps = s.ballSteps === 0 ? 2 : 1;

  // A kick goes through with it rather than stopping the ball.
  const kicking = (p.action?.strike || p.action?.hits) && !p.action.struck;
  const reached = Math.abs(b.z - p.z) <= CAPTURE_DZ
    || (p.mode === 'air' && p.vz > 0 && b.z < 1 && p.z - b.z <= AIR_CAPTURE_DZ);
  const caught = catchable && p.mode === 'air' && !p.action;
  if (s.noCapture === 0 && caught) {
    // On this tick it moves with the player, at his height.
    Object.assign(b, { x: ballX + p.vx, z: p.z, vx: p.vx, vz: 0 });
    p.hasBall = true;
    return;
  }
  if (s.noCapture === 0 && !kicking && Math.abs(b.x - p.x) <= CAPTURE_DX && reached) {
    if (p.mode === 'air' && b.z < 1) {
      // Taken up from the ground: on this tick it goes with the player, a little behind.
      Object.assign(b, { x: b.x + p.vx - AIR_CAPTURE_LAG * sign(p), z: p.z, vx: p.vx, vz: p.vz });
    }
    p.hasBall = true;
    if (p.trapping) p.settleTicks = 2;
    p.trapping = false;
    return;
  }

  const dx = b.x - p.x;
  const onFoot = p.mode === 'walk' && p.z === 0 && !p.action && !p.pending;
  const wasTrapping = p.trapping;
  p.trapping = onFoot && !input.a && b.z > 0 && b.z <= TRAP_MAX_Z && Math.abs(dx) <= TRAP_DX
    && (wasTrapping || b.vz < 0);
  if (p.trapping && !wasTrapping) {
    // Cushioned: the ball stops in the air for a moment, then drops towards the feet.
    b.vx = 0;
    b.vz = TRAP_PULL;
  } else if (p.trapping) {
    b.vx = -TRAP_PULL * Math.sign(dx);
  }
}
