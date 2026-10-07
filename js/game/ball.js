// Ball physics per logic tick: bounce, friction and gravity as in the original's code,
// walls and rotation measured from the ball-practice recording.
const GRAVITY = 0.5;
const FRICTION_K = 24 / 256;
const SLOW_FRICTION = 1 / 16;
const BOUNCE_LOSS = 1 + 1 / 256;
const LEFT_WALL = 4.5;
const RIGHT_WALL = 256;
const WALL_SPEED = 2;
const ROTATE_EVERY_PX = 5;
const SPIN = { left: [0, 3, 2, 1], right: [3, 4, 1, 5] };
const SPIN_ENTRY = { left: 2, right: 4 };

export function createBall(x) {
  return { x, z: 0, vx: 0, vz: 0, hang: 0, frame: 0, spin: 0 };
}

function friction(v) {
  if (Math.abs(v) < 1) return v > 0 ? Math.max(0, v - SLOW_FRICTION) : Math.min(0, v + SLOW_FRICTION);
  return v - v * FRICTION_K;
}

// Returns whether the ball bounced off the ground (and goes up again) on this tick.
export function tickBall(b) {
  let bounced = false;
  if (b.z === 0 && b.vz < 0) {
    const vz = -b.vz / 2 - BOUNCE_LOSS;
    b.vz = vz > 0 ? vz : 0;
    b.vx = friction(b.vx);
    bounced = vz > 0;
  } else if (b.z === 0 && b.vz === 0) {
    b.vx = friction(b.vx);
  }

  if ((b.x >= RIGHT_WALL && b.vx > 0) || (b.x <= LEFT_WALL && b.vx < 0)) {
    b.vx = b.vx > 0 ? -WALL_SPEED : WALL_SPEED;
    b.vz = Math.max(b.vz, WALL_SPEED);
  } else if (b.x >= RIGHT_WALL && b.vz < WALL_SPEED) {
    // Still past the right wall on the way back: lifted once more (recorded four times).
    b.vz += 1;
  }

  const airborne = b.z > 0 || b.vz > 0;
  b.x += b.vx;
  b.z = Math.max(0, b.z + b.vz);
  if (b.hang > 0) b.hang -= 1;
  else if (airborne) b.vz -= GRAVITY;

  rollBall(b, b.vx);
  return bounced;
}

export function rollBall(b, dx) {
  if (dx === 0) return;
  b.spin += Math.abs(dx);
  if (b.spin < ROTATE_EVERY_PX) return;
  b.spin = 0;
  const cycle = dx < 0 ? SPIN.left : SPIN.right;
  const i = cycle.indexOf(b.frame);
  b.frame = i === -1 ? SPIN_ENTRY[dx < 0 ? 'left' : 'right'] : cycle[(i + 1) % cycle.length];
}
