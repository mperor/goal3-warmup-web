import { createBall, rollBall, tickBall } from './ball.js';
import {
  catchBall, createPlayer, faceBall, faceGoal, isRunning, juggled, loseBall, seeBall, setTrapping, startGroundKick, startTrap,
  struckBall, takeBall, tickPlayer,
} from './player.js';
import { CAPTURE_DZ, HEAD_Z, REACH, relation } from './reach.js';

// Player-ball interaction on the ball-practice screen, measured from the recording.
const DRIBBLE_OFFSET = 12;
const LAND_DRIBBLE_OFFSET = 8;
const NO_CAPTURE_TICKS = 10;
const SHOT_SPEED = 8;
const SHOT_HANG_TICKS = 13;
const TRAP_PULL = 0.5;
// Keeping the ball up with A: the knock up (the reach: reach.js).
const KEEP_UP_VZ = 8;
const TRAP_CARRY_DX = 9;
// Juggling it on the run: the knock up, the lead it keeps (the reach: reach.js).
const JUGGLE_VZ = 3;
const JUGGLE_LEAD = 0.1875;
const JUGGLE_CARRY_DX = 16;
// The next knock up no sooner than this (recorded twice exactly so).
const JUGGLE_EVERY_TICKS = 15;
const TRAP_FOOT_Z = 16;
const FALL_CAPTURE_VZ = 2;
// Ground volleys: met at ~27 px or lower a chip, at ~31 px a much higher lob. Threshold guessed.
const VOLLEY_HIGH_Z = 29;
const CHIP_VX = 3;
const CHIP_VZ = 7;
const PASS_VZ = 8;
const FLOAT_LEAD = 0.25;
// Turning round for it (towards the goal) he tosses it forward the less, the faster he was going
// the other way (fitted to 7 tosses: -0.375 at -3 px/tick, 1.125 at -1.75).
const FLOAT_TURNED_VX = 3.225;
const FLOAT_TURNED_K = 1.2;
// B without the ball: a ball still this high when the kick starts is volleyed, a lower one is
// met with an overhead kick (recorded: ~31 px and up volleyed, 29 px and below overhead).
const VOLLEY_SHOT_MIN_Z = 30;
// A shot from the ground lifts a low ball to this height.
const GROUND_SHOT_Z = 8;
// Kicked up from under the player's feet when he flicks it off a ride.
const RIDE_RELEASE_Z = 7;
// A player rising in a jump takes a ball lying under him, up to 15 px up (at 16.5 he does not;
// tools/simulate.py, the take-* plans).
const AIR_CAPTURE_DZ = 15;
const AIR_CAPTURE_LAG = 0.5;
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
const TOSS_TURNED_VX = 0.5;
const MOUNT_MAX_VX = 2;
// A with the ball and Up or Down held passes into the depth of the pitch (tools/simulate.py, the
// ball-*-a and lob-* plans). Up, alone or with Left, aims at a point at the far side (a team-mate
// off screen, it seems) when it lies about within 45° of that way: a lob at 6 px/tick, never
// flatter than 45°, high enough to fly as many ticks as it takes to get there, off the foot a tick
// later. Otherwise the pass goes low at 45°, ahead and into the depth. The target is fitted to 12
// passes: directions within 10/256 px/tick (the original's are an approximation), heights within
// 1/4 (10 of 12 exact).
const PASS_TARGET = { x: 2.4, depth: 160, reach: 172 };
const AIMED_PASS_SPEED = 6;
const GRAVITY = 0.5;
const DIAGONAL_PASS = { v: 0x2cc / 256, vz: 5.75 };
// B with the ball and Up or Down: the shot curves into the depth, 0.5 px/tick more on each of its
// first ticks (vy before the first; measured once each way, the ball-*-b plans).
const SHOT_CURVE = {
  up: { vx: 8, vy: 0, step: -0.5, ticks: 7 },
  down: { vx: 0x7f8 / 256, vy: 0x78 / 256, step: 0.5, ticks: 8 },
  downAhead: { vx: 8, vy: 0, step: 0.5, ticks: 8 },
};
const OVERHEAD_T4_DZ_MAX = 7.5;
// Bouncing off the head: the roll off it (the reach: reach.js).
const HEAD_FAR = 12;
const HEAD_DRIFT = 0.5;
const HEAD_ROLL_VX = 0.125;
const HEAD_ROLL_PER_PX = 0.11;
const HEAD_ROLL_VZ = -0.375;

// Every field from the start, as for the player.
export function createPractice(playerX, ballX) {
  return {
    player: createPlayer(playerX),
    ball: createBall(ballX),
    events: [], // what happened in the last tick, each with what did it (see note)
    sounds: [], // the sound effects of the last tick, from its events
    ballSteps: 1, // moves of the ball this tick (0 or 2 where the original holds it back a tick)
    // The ball and the player, one way at a time (see relate):
    //   free     on its own; from: 'ride' (flicked off a ride: frac, its fraction of a pixel there)
    //            or 'trap' (lifted out of a trap: the lift takes it where it is)
    //   feet     at his feet (the player's hasBall)
    //   ridden   under his feet as he rides it (onBall); frac: its fraction of a pixel
    //   trapped  being trapped (trapping); carry: carried along the way he goes (else pulled in to
    //            him), dir: that way
    //   head     riding on his head as he rises; dz, ahead: where it sits
    //   juggled  knocked up on the run and carried along in the air
    contact: { kind: 'free' },
    // What the world remembers of the ball whatever the relation:
    noCapture: 0, // ticks after a kick before the ball can be taken again
    lifted: false, // lifted by him: let drop before it can be trapped
    juggleWait: 0, // ticks before he can knock it up on the run again
  };
}

// Sets the ball's relation to the player (createPractice lists them). The player's own view of it
// (hasBall, onBall, trapping) is set alongside, through what player.js offers.
function relate(s, kind, data = {}) {
  s.contact = { kind, ...data };
}

const sign = (p) => (p.facing === 'left' ? -1 : 1);

// The sound effect of each kind of event; the others make none.
const SOUNDS = { kick: 'kick', shot: 'shot', bounce: 'bounce', jump: 'jump', land: 'land', pickup: 'pickup' };

const round = (v) => Math.round(v * 100) / 100;

// Writes down what happened in the record of the tick: what did it (`by`: the action, the kind of
// kick) and where the ball was from the player then.
function note(s, type, by = null) {
  const { player: p, ball: b } = s;
  s.events.push({ type, by, dx: round(b.x - p.x), dz: round(b.z - p.z) });
}

// Every kick sets the ball's speed into the depth afresh (none unless it says so).
function release(s) {
  loseBall(s.player);
  relate(s, 'free');
  s.noCapture = NO_CAPTURE_TICKS;
  s.ball.vy = 0;
  s.ball.curve = null;
}

// Whether the kick in the air under way reaches the ball (reach.js).
function kickReaches(p, b) {
  const rel = relation(p, b);
  const name = p.action?.name;
  if (name === 'overhead') return REACH.overhead.fits(rel, { t: p.action.hitTick });
  if (name === 'bicycle') return REACH.bicycle.fits(rel);
  if (name === 'volleyShotAir') return REACH.volleyShotAir.fits(rel);
  return REACH.hit.fits(rel);
}

function struck(s) {
  struckBall(s.player);
}

function shoot(s, dir, by) {
  const b = s.ball;
  note(s, 'shot', by);
  release(s);
  // The shot leaves the foot with a head start: +24 px on the hit tick, 8 of them from the move.
  b.x += (3 * SHOT_SPEED - SHOT_SPEED) * dir;
  b.vx = SHOT_SPEED * dir;
  b.vz = 0;
  b.hang = SHOT_HANG_TICKS + 1; // counted down on the shot tick already
}

function chip(s, by) {
  const { player: p, ball: b } = s;
  note(s, 'kick', by);
  release(s);
  b.vx = CHIP_VX * sign(p);
  b.vz = CHIP_VZ;
  b.hang = 0;
}

function groundShot(s, by) {
  shoot(s, sign(s.player), by);
  if (s.ball.z < GROUND_SHOT_Z) s.ball.z = GROUND_SHOT_Z;
}

// A or B alone on the ground: pass or shoot with the ball, otherwise get ready to kick it.
function chooseKick(s, button) {
  const { player: p, ball: b } = s;
  let name;
  const high = Math.max(0, b.z + b.vz) >= VOLLEY_SHOT_MIN_Z;
  if (button === 'b') faceGoal(p);
  if (p.hasBall) name = button === 'a' ? 'pass' : 'shot';
  // A without the ball and nothing high to volley swings the pass kick at the air.
  // At a ball in the air above him (and not to be volleyed as it comes down) A goes through the
  // lift: keeping it up, it knocks the ball up again as it drops to his foot (tools/data, the
  // juggle recording); behind him with the heel. A high ball coming in from the side is volleyed.
  else if (button === 'a' && REACH.keepUpChoice.fits(relation(p, b)) && (!high || b.vz > 0 || b.vx === 0)) {
    name = (b.x - p.x) * sign(p) < 0 ? 'keepUpBehind' : 'keepUp';
  } else if (button === 'a') name = high ? 'groundVolley' : 'pass';
  else name = high ? 'volleyShot' : 'groundOverhead';
  startGroundKick(p, name);
  if (s.contact.kind === 'trapped') relate(s, 'free');
}

// A kick from the ground meets the ball once it comes into the action's reach.
// The action may end on this very tick, so the kind and the action tick come with the event.
function strike(s, kind, t) {
  const { player: p, ball: b } = s;
  const dz = b.z - p.z;
  if (!REACH.strike.fits(relation(p, b), { kind, t })) return;
  struckBall(p);
  if (kind !== 'volley') {
    groundShot(s, kind);
  } else if (dz > VOLLEY_HIGH_Z) {
    note(s, 'kick', 'high volley');
    release(s);
    b.vx = HIGH_VOLLEY_VX * sign(p);
    b.vz = HIGH_VOLLEY_VZ;
    b.hang = 0;
    s.ballSteps = 0;
  } else {
    chip(s, 'volley');
  }
}

// What the player asks of the ball this tick ({ type, ... } from tickPlayer).
function applyEvent(s, e) {
  const { player: p, ball: b } = s;
  const event = e.type;
  if (event === 'lift' && (p.hasBall || s.contact.from === 'trap')) {
    release(s);
    s.lifted = true;
    b.vx = 0;
    b.vz = 8;
  } else if (event === 'jumpKick' && p.hasBall) {
    note(s, 'kick', 'jumpKick');
    release(s);
    b.vx = CHIP_VX * sign(p);
    b.vz = CHIP_VZ;
    // The original leaves the ball in place on the kick tick and moves it twice on the next.
    s.ballSteps = 0;
  } else if (event === 'flickUp' && s.contact.from === 'ride') {
    const { frac } = s.contact;
    relate(s, 'free');
    s.noCapture = NO_CAPTURE_TICKS;
    Object.assign(b, {
      x: Math.floor(p.x) - FLICK_BEHIND * sign(p) + frac, z: Math.floor(p.z) + FLICK_Z, vx: 0, vz: 0, hang: 1,
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
    b.vx = p.action.turned ? (FLOAT_TURNED_VX + FLOAT_TURNED_K * p.vx * sign(p)) * sign(p) : p.vx + FLOAT_LEAD * sign(p);
    b.vz = 3.5;
  } else if (event === 'toss' && p.hasBall) {
    release(s);
    // Turned round for the volley, or already facing away for the bicycle kick, he tosses it up
    // nearly straight, a little towards the goal; turning away for the bicycle kick, back the way
    // he turned.
    const plain = p.action.name === 'bicycleOwnBall' ? p.action.turned : !p.action.turned;
    b.vx = plain ? TOSS_VX[p.action.name] * sign(p) : TOSS_TURNED_VX;
    b.vz = TOSS_VZ;
  } else if (event === 'pass' && p.hasBall) {
    note(s, 'kick', p.kick.vertical ? `pass ${p.kick.vertical}` : 'pass');
    release(s);
    const v = p.kick.vertical;
    const dx = PASS_TARGET.x - b.x;
    const aimed = v === 'up' && (p.kick.dir === 0 ? Math.abs(dx) <= PASS_TARGET.reach : p.kick.dir < 0 && dx <= 0);
    if (aimed) {
      // Never flatter than 45°.
      const ax = Math.max(-PASS_TARGET.depth, Math.min(PASS_TARGET.depth, dx));
      const d = Math.hypot(ax, PASS_TARGET.depth);
      b.vx = (AIMED_PASS_SPEED * ax) / d;
      b.vy = (-AIMED_PASS_SPEED * PASS_TARGET.depth) / d;
      b.vz = (Math.ceil(Math.hypot(dx, PASS_TARGET.depth) / AIMED_PASS_SPEED) * GRAVITY) / 2;
      s.ballSteps = 0;
    } else if (v) {
      b.vx = DIAGONAL_PASS.v * sign(p);
      b.vy = DIAGONAL_PASS.v * (v === 'up' ? -1 : 1);
      b.vz = DIAGONAL_PASS.vz;
    } else {
      b.vx = CHIP_VX * sign(p);
      b.vz = PASS_VZ;
    }
    b.hang = 0;
  } else if (event === 'keepUp' && !p.hasBall && b.vz < 0 && REACH.keepUp.fits(relation(p, b))) {
    struck(s);
    note(s, 'kick', p.action?.name ?? 'keepUp');
    s.lifted = true;
    b.vx = 0;
    b.vy = 0;
    b.vz = KEEP_UP_VZ;
    b.hang = 0;
  } else if (event === 'shot' && p.hasBall) {
    groundShot(s, 'shot');
    const curve = p.kick.vertical && SHOT_CURVE[p.kick.vertical === 'up' ? 'up' : p.kick.dir > 0 ? 'downAhead' : 'down'];
    if (curve) {
      b.vx = curve.vx;
      b.vy = curve.vy;
      b.curve = { step: curve.step, ticks: curve.ticks };
    }
  } else if (event === 'strike' && !p.hasBall) {
    strike(s, e.kind, e.t);
  } else if (event === 'dive' && !p.hasBall && REACH.dive.fits(relation(p, b), { backward: Math.sign(p.vx) === -sign(p) })) {
    groundShot(s, 'dive');
  } else if (event === 'chip' && !p.hasBall && REACH.hit.fits(relation(p, b))) {
    chip(s, p.action?.name ?? 'chip');
  } else if (event === 'hit' && !p.hasBall && kickReaches(p, b)) {
    struck(s);
    shoot(s, sign(p), p.action?.name ?? 'hit');
  } else if (event === 'hitBehind' && !p.hasBall && kickReaches(p, b)) {
    struck(s);
    shoot(s, -sign(p), p.action?.name ?? 'hitBehind');
  }
}

// A ball dropping onto the head of a player going up in a jump rides on it, a little to one side,
// until he kicks or stops rising; then it rolls off ahead, the faster the further back it sat
// (tools/simulate.py, the airhit-* plans). Returns whether it took the ball this tick.
function headBall(s, playerZ) {
  const { player: p, ball: b } = s;
  const ride = s.contact.kind === 'head' ? s.contact : null;
  if (ride && (p.mode !== 'air' || p.action || p.vz <= 0)) {
    relate(s, 'free');
    b.vx = (HEAD_ROLL_VX + (HEAD_FAR - ride.ahead) * HEAD_ROLL_PER_PX) * sign(p);
    b.vz = HEAD_ROLL_VZ;
    return false;
  }
  if (ride) {
    b.x += b.vx;
    b.z = p.z + ride.dz;
    b.vz = p.vz;
    return true;
  }
  const dz = b.z - playerZ;
  const ahead = (b.x - p.x) * sign(p);
  if (p.mode !== 'air' || p.action || p.vz <= 0 || b.vz >= 0 || !REACH.head.fits({ ahead, dz })
    || b.z + b.vz - p.z >= HEAD_Z) return false;
  relate(s, 'head', { dz, ahead });
  b.vx = (ahead > HEAD_FAR - 3 ? -HEAD_DRIFT : HEAD_DRIFT) * sign(p);
  b.x += b.vx;
  b.z = p.z + dz;
  b.vz = p.vz;
  return true;
}

// Running under a ball coming down, the player knocks it up again off the thigh (or low, the foot)
// and runs on with it in the air: while he runs it goes along at his speed and a little more
// (tools/simulate.py and the juggle recording). Returns whether it took the ball this tick.
function juggle(s, { playerX, playerVx, ballX, ballZ, ballVz, wasRunning }) {
  const { player: p, ball: b } = s;
  const running = p.mode === 'run' && !p.action;
  const along = () => p.vx + JUGGLE_LEAD * Math.sign(p.vx);
  if (s.juggleWait > 0) s.juggleWait -= 1;
  if (running && wasRunning && !s.juggleWait && ballVz < 0 && REACH.juggle.fits({ dx: ballX - playerX, z: ballZ })) {
    note(s, 'kick', 'juggle');
    relate(s, 'juggled');
    s.juggleWait = JUGGLE_EVERY_TICKS;
    // He keeps the speed he had for this tick and the next two (a boost ends there).
    juggled(p, { vx: playerVx, x: playerX + playerVx, low: ballZ < TRAP_FOOT_Z });
    b.vx = along();
    b.x = ballX + b.vx;
    b.z = ballZ + JUGGLE_VZ;
    b.vz = JUGGLE_VZ - GRAVITY;
    b.grounded = false;
    return true;
  }
  if (s.contact.kind !== 'juggled') return false;
  // Off the run it flies on by itself (still counted as carried until it lands or is trapped).
  if (b.grounded || Math.abs(b.x - p.x) > JUGGLE_CARRY_DX) {
    relate(s, 'free');
    return false;
  }
  if (!running) return false;
  for (let i = 0; i < s.ballSteps; i++) if (tickBall(b)) note(s, 'bounce');
  s.ballSteps = 1;
  const vx = along();
  b.x += vx - b.vx;
  b.vx = vx;
  return true;
}

// Advances one logic tick. s.events is what happened in it ({ type, by, dx, dz }: 'kick', 'shot',
// 'bounce', 'jump', 'land', 'pickup'), s.sounds the sound effects that go with them.
export function tickPractice(s, input) {
  const p = s.player;
  const before = { mode: p.mode, landed: p.dive.landed, hasBall: p.hasBall };
  s.events = [];
  step(s, input);
  if (p.mode === 'air' && before.mode !== 'air' && p.vz > 0) note(s, 'jump');
  if (before.mode === 'air' && p.mode === 'land') note(s, 'land', 'jump');
  else if (p.mode === 'dive' && p.dive.landed && !before.landed) note(s, 'land', 'dive');
  if (p.hasBall && !before.hasBall) note(s, 'pickup');
  s.sounds = s.events.map((e) => SOUNDS[e.type]).filter(Boolean);
}

// One tick, phase by phase, in the order the original works in. What the reach checks need from
// before anyone moves is noted first (the original judges them so).
function step(s, input) {
  const before = look(s);
  const requests = tickPlayer(s.player, input);
  if (offTheRide(s, requests, before)) return;
  kickBall(s, requests);
  if (withPlayer(s, before)) return;
  byItself(s);
  takeOrTrap(s, before, input);
}

// What the world sees before anyone moves; the player is told what concerns him.
function look(s) {
  const { player: p, ball: b } = s;
  seeBall(p, {
    // A ball on the ground is something to land on, also rolling (recorded at ~1.1 px/tick
    // towards the player; the speed limit is a guess).
    below: !p.hasBall && b.z < 1 && b.vz === 0 && Math.abs(b.vx) < MOUNT_MAX_VX ? b.x : null,
    high: Math.max(0, b.z + b.vz) >= VOLLEY_SHOT_MIN_Z,
  });
  return {
    // A ball in flight just ahead of a player in the air is caught.
    catchable: p.mode === 'air' && !p.action && REACH.catch.fits(relation(p, b)),
    playerX: p.x, playerZ: p.z, playerVx: p.vx, wasRunning: p.mode === 'run', wasOnBall: p.onBall,
    ballX: b.x, ballZ: b.z, ballVx: b.vx, ballVz: b.vz, ballGrounded: b.grounded,
  };
}

// Landed on the ball, or getting off it: by a flick (it is kicked up from under his feet) or a
// jump (it rolls on by itself, and nothing else happens to it this tick).
function offTheRide(s, requests, before) {
  const { player: p, ball: b } = s;
  if (p.onBall && !before.wasOnBall) relate(s, 'ridden', { frac: b.x - Math.floor(b.x) });
  if (requests[0]?.type !== 'offBall') return false;
  const { frac } = s.contact;
  s.noCapture = NO_CAPTURE_TICKS;
  if (p.action?.name === 'flick') {
    relate(s, 'free', { from: 'ride', frac });
    Object.assign(b, { z: RIDE_RELEASE_Z, vx: 0, vz: 0, hang: 0 });
    return false;
  }
  // Jumping off: the ball still rolls under the feet this tick, then goes on by itself.
  relate(s, 'free');
  rollBall(b, p.vx);
  Object.assign(b, { x: Math.floor(p.x) + frac, z: 0, vx: p.vx, vy: 0, vz: 0, hang: 0, grounded: true });
  return true;
}

// What the player asked of the ball: a kick chosen after the A+B window, and his action's events.
function kickBall(s, requests) {
  // A+B while trapping: the ball is his from now (at his feet below), or, lifting it, goes on by
  // itself this tick and is lifted from where it is on the next (not taken in between).
  if (requests.some((e) => e.type === 'takeTrapped')) {
    setTrapping(s.player, false);
    catchBall(s.player);
    relate(s, 'feet');
  }
  const liftTrapped = requests.some((e) => e.type === 'liftTrapped');
  if (liftTrapped) {
    setTrapping(s.player, false);
    relate(s, 'free', { from: 'trap' });
  }
  if (s.noCapture > 0) s.noCapture -= 1;
  if (liftTrapped) s.noCapture = 1;
  const kick = requests.find((e) => e.type === 'groundKick');
  if (kick) chooseKick(s, kick.button);
  requests.forEach((e) => applyEvent(s, e));
}

// The ball going with the player: ridden, at his feet, on his head, juggled on the run.
function withPlayer(s, before) {
  const { player: p, ball: b } = s;
  if (p.onBall) {
    // Rolling under the rider's feet; the ball keeps its own sub-pixel position.
    rollBall(b, p.vx);
    Object.assign(b, { x: Math.floor(p.x) + s.contact.frac, z: 0, vx: p.vx, vy: 0, vz: 0, hang: 0, grounded: true });
    return true;
  }
  if (p.hasBall) {
    // Landing with the ball keeps it closer, until the last tick of the landing.
    const landing = p.mode === 'land' && p.land.ticks > 1;
    const offset = landing ? LAND_DRIBBLE_OFFSET : DRIBBLE_OFFSET + (isRunning(p) ? (p.tick >> 1) & 3 : 0);
    // The ball keeps its own fractions of a pixel (lying, a fraction up from the ground).
    const x = Math.floor(p.x) + offset * sign(p) + (b.x - Math.floor(b.x));
    const z = p.z === 0 && b.z < 1 ? b.z : p.z;
    rollBall(b, p.vx);
    Object.assign(b, { x, z, vx: p.vx, vy: 0, vz: 0, hang: 0, grounded: p.z === 0 });
    setTrapping(p, false);
    return true;
  }
  return headBall(s, before.playerZ) || juggle(s, before);
}

// The ball on its own: flying, bouncing, rolling.
function byItself(s) {
  const b = s.ball;
  for (let i = 0; i < s.ballSteps; i++) if (tickBall(b)) note(s, 'bounce');
  // A lifted ball is let drop to the ground before it can be trapped.
  if (s.lifted && b.grounded) s.lifted = false;
  s.ballSteps = s.ballSteps === 0 ? 2 : 1;
}

// The ball coming to the player: caught in the air, taken at the feet or in a jump, or trapped.
function takeOrTrap(s, before, input) {
  const { player: p, ball: b } = s;
  const { ballX, playerX, playerVx, ballZ, ballVz, ballVx, ballGrounded, wasRunning, catchable } = before;
  // A kick goes through with it rather than stopping the ball.
  const kicking = (p.action?.strike || p.action?.hits) && !p.action.struck;
  // A ball coming down fast to the ground bounces first; a trapped one is taken as it would.
  const reached = (p.trapping ? ballGrounded && ballVz < 0
    : Math.abs(b.z - p.z) <= CAPTURE_DZ && !(b.z < 1 && b.vz < -FALL_CAPTURE_VZ))
    || (p.mode === 'air' && p.vz > 0 && b.z < 1 && p.z - b.z <= AIR_CAPTURE_DZ);
  const caught = catchable && p.mode === 'air' && !p.action;
  if (s.noCapture === 0 && caught) {
    // On this tick it moves with the player, at his height.
    Object.assign(b, { x: ballX + p.vx, z: p.z, vx: p.vx, vz: 0 });
    catchBall(p);
    relate(s, 'feet');
    return;
  }
  // On the ground the reach is judged from where the player was before he moved.
  const air = p.mode === 'air';
  const near = REACH.take.fits({ dx: b.x - (air ? p.x : playerX) }, { air });
  if (s.noCapture === 0 && !kicking && near && reached) {
    if (p.mode === 'air' && b.z < 1) {
      // Taken up from the ground: on this tick it goes with the player, a little behind.
      Object.assign(b, { x: b.x + p.vx - AIR_CAPTURE_LAG * sign(p), z: p.z, vx: p.vx, vz: p.vz });
    }
    takeBall(p);
    relate(s, 'feet');
    if (p.mode !== 'air') {
      // Taken on the ground: at the feet at once, keeping its fractions of a pixel.
      const landing = p.mode === 'land' && p.land.ticks > 1;
      const offset = landing ? LAND_DRIBBLE_OFFSET : DRIBBLE_OFFSET;
      const z = ballZ < 1 ? ballZ : b.z < 1 ? b.z : 0;
      Object.assign(b, { x: Math.floor(p.x) + offset * sign(p) + (b.x - Math.floor(b.x)), z, vx: p.vx, vy: 0, vz: 0 });
    }
    return;
  }

  const dx = b.x - p.x;
  const onFoot = p.mode === 'walk' && !wasRunning && p.z === 0 && !p.action && !p.press.button;
  const wasTrapping = p.trapping;
  // A ball he lifted himself is let drop while he stands still.
  const standing = playerVx === 0;
  // Judged before either moved this tick (once trapping, as it is now).
  const tz = wasTrapping ? b.z : ballZ;
  const tdx = wasTrapping ? dx : ballX - playerX;
  const trapping = onFoot && !input.a && !(s.lifted && standing && !wasTrapping)
    && REACH.trap.fits({ dx: tdx, z: tz }, { trapping: wasTrapping }) && (wasTrapping || ballVz < 0 || tz < TRAP_FOOT_Z);
  setTrapping(p, trapping);
  if (!trapping && s.contact.kind === 'trapped') relate(s, 'free');
  if (trapping && !wasTrapping) {
    // Low it is stopped with the foot, higher with the thigh. Taken before either moves this tick:
    // the player turns to the ball and brakes, the ball stops falling and rises a little, then is
    // carried along the way he was going (or towards him from standing).
    startTrap(p, { low: tz < TRAP_FOOT_Z, facing: tdx < 0 ? 'left' : 'right', x: playerX, vx: playerVx });
    // A ball coming in from the side is pulled in to him instead.
    const carry = ballVx === 0 || s.contact.kind === 'juggled';
    relate(s, 'trapped', { carry, dir: Math.sign(playerVx) || -Math.sign(tdx) });
    b.vx = carry ? p.vx + TRAP_PULL * s.contact.dir : 0;
    b.x = ballX + b.vx;
    b.z = ballZ + TRAP_PULL;
    b.vz = 0;
  } else if (trapping) {
    // The new speed already moves it this tick; he keeps facing the ball.
    // Carried along while he still moves or it is near; out past his reach it just drops.
    const { carry, dir } = s.contact;
    const far = carry && p.vx === 0 && Math.abs(dx) > TRAP_CARRY_DX;
    const vx = far ? 0 : carry ? p.vx + TRAP_PULL * dir : -TRAP_PULL * Math.sign(dx);
    if (carry) b.x += vx - b.vx;
    b.vx = vx;
    if (Math.abs(b.x - p.x) > 1) faceBall(p, b.x < p.x ? 'left' : 'right');
  }
}
