import { createBall, rollBall, tickBall } from './ball.js';
import { createPlayer, isRunning, startAction, tickPlayer } from './player.js';

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
const BRACE_MAX_Z = 43;
const VOLLEY_MAX_Z = 32;
// Two recorded ground volleys: met at ~27 px a chip, at ~31 px a much higher lob. Threshold guessed.
const VOLLEY_HIGH_Z = 29;
const CHIP_VX = 3;
const CHIP_VZ = 7;
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

// On the ground, holding A volleys a dropping ball as soon as it comes into reach.
function groundVolley(s, input) {
  const { player: p, ball: b } = s;
  const ready = input.a && !p.hasBall && !p.action && p.mode === 'walk' && p.z === 0;
  if (!ready || b.vz >= 0 || b.z <= 0 || b.z > VOLLEY_MAX_Z || Math.abs(b.x - p.x) > HIT_DX) return;
  p.trapping = false;
  p.bracing = false;
  if (b.z > VOLLEY_HIGH_Z) {
    startAction(p, 'groundVolleyHigh');
    release(s);
    b.vx = HIGH_VOLLEY_VX * sign(p);
    b.vz = HIGH_VOLLEY_VZ;
    b.hang = 0;
    s.ballSteps = 0;
  } else {
    startAction(p, 'groundVolley');
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
  events.forEach((e) => applyEvent(s, e));
  groundVolley(s, input);

  if (p.hasBall) {
    const offset = DRIBBLE_OFFSET + (isRunning(p) ? (p.tick >> 1) & 3 : 0);
    const x = Math.floor(p.x) + offset * sign(p);
    rollBall(b, p.vx);
    Object.assign(b, { x, z: p.z, vx: p.vx, vz: 0, hang: 0 });
    p.trapping = false;
    p.bracing = false;
    return;
  }

  for (let i = 0; i < s.ballSteps; i++) tickBall(b);
  s.ballSteps = s.ballSteps === 0 ? 2 : 1;

  if (s.noCapture === 0 && Math.abs(b.x - p.x) <= CAPTURE_DX && Math.abs(b.z - p.z) <= CAPTURE_DZ) {
    p.hasBall = true;
    if (p.trapping) p.settleTicks = 2;
    p.trapping = false;
    return;
  }

  const dx = b.x - p.x;
  const onFoot = p.mode === 'walk' && p.z === 0 && !p.action;
  // Holding A near a dropping ball: brake and get ready to volley it.
  p.bracing = onFoot && input.a && !input.b && b.vz < 0 && b.z > 0 && b.z < BRACE_MAX_Z && Math.abs(dx) <= HIT_DX;
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
