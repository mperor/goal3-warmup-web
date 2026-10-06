import { createBall, rollBall, tickBall } from './ball.js';
import { createPlayer, groundAction, isRunning, startAction, tickPlayer } from './player.js';

// Player-ball interaction on the ball-practice screen, measured from the recording.
const DRIBBLE_OFFSET = 12;
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
// B without the ball: a ball still this high when the kick starts is volleyed, a lower one is
// met with an overhead kick (recorded: ~31 px and up volleyed, 29 px and below overhead).
const VOLLEY_SHOT_MIN_Z = 30;
// Reach of the kicks from the ground, from the recorded hits and misses.
const STRIKES = {
  volley: { dx: 13, minZ: 0, maxZ: 32 },
  volleyShot: { dx: 16, minZ: 12, maxZ: 32 },
  overheadShot: { dx: 16, minZ: 0, maxZ: 12 },
};
// A shot from the ground lifts a low ball to this height.
const GROUND_SHOT_Z = 8;
const HIGH_VOLLEY_VX = 4.734375;
const HIGH_VOLLEY_VZ = 10.25;
const FLICK_BEHIND = 12;
const FLICK_Z = 10;
const FLICK_VX = 2.25;
const FLICK_VZ = 9;

export function createPractice(playerX, ballX) {
  return { player: createPlayer(playerX), ball: createBall(ballX), noCapture: 0, ballSteps: 1 };
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

function shoot(s, dir) {
  const b = s.ball;
  release(s);
  // The shot leaves the foot with a head start: +24 px on the hit tick, 8 of them from the move.
  b.x += (3 * SHOT_SPEED - SHOT_SPEED) * dir;
  b.vx = SHOT_SPEED * dir;
  b.vz = 0;
  b.hang = SHOT_HANG_TICKS;
}

function chip(s) {
  const { player: p, ball: b } = s;
  release(s);
  b.vx = CHIP_VX * sign(p);
  b.vz = CHIP_VZ;
  b.hang = 0;
}

function groundShot(s) {
  shoot(s, sign(s.player));
  if (s.ball.z < GROUND_SHOT_Z) s.ball.z = GROUND_SHOT_Z;
}

// A or B alone on the ground: pass or shoot with the ball, otherwise get ready to kick it.
function startKick(s, button) {
  const { player: p, ball: b } = s;
  let name;
  if (p.hasBall) name = button === 'a' ? 'pass' : 'shot';
  else if (button === 'a') name = 'groundVolley';
  else name = Math.max(0, b.z + b.vz) >= VOLLEY_SHOT_MIN_Z ? 'volleyShot' : 'groundOverhead';
  startAction(p, name);
  p.trapping = false;
  groundAction(p, []);
}

// A kick from the ground meets the ball once it comes into the action's reach.
// The action may end on this very tick, so the kind comes with the event.
function strike(s, kind) {
  const { player: p, ball: b } = s;
  const reach = STRIKES[kind];
  const dz = b.z - p.z;
  if (Math.abs(b.x - p.x) > reach.dx || dz < reach.minZ || dz > reach.maxZ) return;
  if (p.action) p.action.struck = true;
  if (kind !== 'volley') {
    groundShot(s);
  } else if (dz > VOLLEY_HIGH_Z) {
    release(s);
    b.vx = HIGH_VOLLEY_VX * sign(p);
    b.vz = HIGH_VOLLEY_VZ;
    b.hang = 0;
    s.ballSteps = 0;
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
  } else if (event === 'flickUp' && p.hasBall) {
    release(s);
    Object.assign(b, { x: Math.floor(p.x) - FLICK_BEHIND * sign(p), z: FLICK_Z, vx: 0, vz: 0, hang: 1 });
  } else if (event === 'flick' && !p.hasBall) {
    b.vx = FLICK_VX * sign(p);
    b.vz = FLICK_VZ;
  } else if (event === 'float' && p.hasBall) {
    release(s);
    b.vx = p.vx / 8;
    b.vz = 3.5;
  } else if (event === 'pass' && p.hasBall) {
    release(s);
    b.vx = CHIP_VX * sign(p);
    b.vz = PASS_VZ;
    b.hang = 0;
  } else if (event === 'shot' && p.hasBall) {
    groundShot(s);
  } else if (event.startsWith('strike:') && !p.hasBall) {
    strike(s, event.slice(7));
  } else if (event === 'chip' && !p.hasBall && inReach(p, b)) {
    chip(s);
  } else if (event === 'hit' && !p.hasBall && inReach(p, b)) {
    shoot(s, sign(p));
  } else if (event === 'hitBehind' && !p.hasBall && inReach(p, b)) {
    shoot(s, -sign(p));
  }
}

export function tickPractice(s, input) {
  const { player: p, ball: b } = s;
  const events = tickPlayer(p, input);
  if (s.noCapture > 0) s.noCapture -= 1;
  const kick = events.find((e) => e === 'kickA' || e === 'kickB');
  if (kick) startKick(s, kick === 'kickA' ? 'a' : 'b');
  events.forEach((e) => applyEvent(s, e));

  if (p.hasBall) {
    const offset = DRIBBLE_OFFSET + (isRunning(p) ? (p.tick >> 1) & 3 : 0);
    const x = Math.floor(p.x) + offset * sign(p);
    rollBall(b, p.vx);
    Object.assign(b, { x, z: p.z, vx: p.vx, vz: 0, hang: 0 });
    p.trapping = false;
    return;
  }

  for (let i = 0; i < s.ballSteps; i++) tickBall(b);
  s.ballSteps = s.ballSteps === 0 ? 2 : 1;

  // A kick from the ground goes through with it rather than stopping the ball.
  const kicking = p.action?.strike && !p.action.struck;
  if (s.noCapture === 0 && !kicking && Math.abs(b.x - p.x) <= CAPTURE_DX && Math.abs(b.z - p.z) <= CAPTURE_DZ) {
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
