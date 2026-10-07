// Ball physics per logic tick: bounce, friction and gravity as in the original's code,
// walls and rotation measured from the ball-practice recording.
//
// The ball also has a speed into the depth of the pitch (vy), though on this screen it never moves
// that way: kicks into the depth give it one, and friction works on both speeds together.
const GRAVITY = 0.5;
const BOUNCE_LOSS = 1 + 1 / 256;
const LEFT_WALL = 8; // off it below x 8: at 8.0 the ball flies on, at 7.48 it turns (tools/simulate.py)
const RIGHT_WALL = 256;
const WALL_SPEED = 2;
const ROTATE_EVERY_PX = 5;
const SPIN = { left: [0, 3, 2, 1], right: [3, 4, 1, 5] };
const SPIN_ENTRY = { left: 2, right: 4 };

export function createBall(x) {
  return { x, z: 0, vx: 0, vy: 0, vz: 0, hang: 0, curve: null, grounded: true, frame: 0, spin: 0 };
}

// On the original's 8.8 speeds: from 1 px/tick up, 3/32 of the speed off (shifted, so a negative
// speed loses a little more); below that 1/8, or 1/16 while the other speed is still 1 or more.
function friction(v, other) {
  const raw = Math.round(v * 256);
  if (Math.abs(raw) >= 256) return (raw - (raw >> 4) - (raw >> 5)) / 256;
  const slow = Math.abs(Math.round(other * 256)) >= 256 ? 16 : 32;
  return (raw > 0 ? Math.max(0, raw - slow) : Math.min(0, raw + slow)) / 256;
}

function rub(b) {
  const { vx, vy } = b;
  b.vx = friction(vx, vy);
  b.vy = friction(vy, vx);
}

const wallLift = (vz) => WALL_SPEED + ((Math.round(vz * 256) & 0xff) / 256);

// Returns whether the ball bounced off the ground (and goes up again) on this tick.
// Landing (dropping below the ground) the original zeroes only the whole-pixel byte of the height,
// so the ball lies a fraction of a pixel up; it bounces on the next tick. Coming down exactly to 0
// is not landing yet.
export function tickBall(b) {
  let bounced = false;
  let settled = false;
  if (b.z >= 1) b.grounded = false;
  if (b.grounded && b.vz < 0) {
    const vz = -b.vz / 2 - BOUNCE_LOSS;
    b.vz = vz > 0 ? vz : 0;
    rub(b);
    bounced = vz > 0;
    // Too low to bounce again: it settles, and does not move on that tick.
    settled = !bounced;
  } else if (b.grounded && b.vz === 0) {
    rub(b);
  }

  // Off a wall the ball goes up at 2 px/tick plus the fraction it had: the original sets only the
  // whole-pixel byte of its 8.8 speed (-1.5 gives 2.5, 5 gives 2). It does so again on every tick
  // it is still past the right wall on the way back.
  if ((b.x >= RIGHT_WALL && b.vx > 0) || (b.x < LEFT_WALL && b.vx < 0)) {
    b.vx = b.vx > 0 ? -WALL_SPEED : WALL_SPEED;
    b.vz = wallLift(b.vz);
  } else if (b.x >= RIGHT_WALL) {
    b.vz = wallLift(b.vz);
  }

  // A shot into the depth curves for its first few ticks.
  if (b.curve && b.curve.ticks > 0) {
    b.vy += b.curve.step;
    b.curve.ticks -= 1;
  }

  const airborne = !b.grounded || b.vz > 0;
  if (!settled) b.x += b.vx;
  const z = Math.round((b.z + b.vz) * 256);
  if (z < 0) {
    b.z = (z & 0xff) / 256;
    b.grounded = true;
  } else {
    b.z = z / 256;
    b.grounded = b.grounded && z < 256 && b.vz <= 0;
  }
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
