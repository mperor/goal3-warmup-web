// Where the player reaches the ball: every contact as a rule, with its measured limits.
//
// A rule judges where the ball is from the player (`fits`) and says the same as boxes (`shapes`),
// so the inspector can draw what the game decides and tests can check that the two agree
// (tests/reach.test.mjs). What a contact needs besides where the ball is (it is falling, he is
// rising, ...) stays with whoever asks: js/game/practice.js and player.js.
//
// Where the ball is, from the player (rel):
//   dx     ball x - player x
//   ahead  dx along the way he faces (behind him: below 0)
//   dz     ball height - player height
//   z      the ball's own height (some rules go by that)
// A box: { ahead: [min, max], dz: [min, max], z: [min, max] }, each optional (no limit); ends
// included. Rules on |dx| are boxes either side.

// Kicks: the generic reach of a kick at the ball (the chip of the volley in the air, the hits of
// the kicks in the air but the ones below).
const HIT_DX = 16;
const HIT_DZ_MIN = -6;
const HIT_DZ_MAX = 22;
// Overhead kick in the air, from the recorded hits and misses: ahead hit 12.3 px away and 11.2 px
// up, missed 13.6 px away and 11.5 px up; behind hit 13.1 px away 5.9 px up, missed 10.9 px up.
// The reach follows the leg (tools/simulate.py, the airhit-* plans): on its first ticks shorter
// ahead and on tick 4 lower; right overhead and just behind as high as ahead; late in the kick it
// gets a ball well below him too.
const OVERHEAD_AHEAD = 13;
const OVERHEAD_DZ_MAX = 11.25;
const OVERHEAD_BEHIND = 14;
const OVERHEAD_BEHIND_DZ_MAX = 10.5;
const OVERHEAD_NEAR = 11;
const OVERHEAD_NEAR_BEHIND = 8;
const OVERHEAD_FAR_DZ_MAX = 10.5;
const OVERHEAD_AHEAD_EARLY = 10;
const OVERHEAD_T4_DZ_MAX = 7.5;
const OVERHEAD_LOW_FROM = 11;
const OVERHEAD_LOW_DZ_MIN = -12;
// Bicycle kick: hit 22.3 px up, missed 23.5 px up; a ball some way off to either side, not one
// right above him.
const BICYCLE_DZ_MAX = 22.5;
const BICYCLE_DX_MIN = 8;
// Volley in the air (airshots recording): hit 12 px behind and 28 px up, not 32.6 px up.
const AIR_VOLLEY_DX = 13;
const AIR_VOLLEY_DZ_MAX = 30;
// A dive hits the ball like a shot from the ground; reach from three hits and their near misses
// (missed 20.6 px away and 10.2 px below the player).
const DIVE_DX = 17;
const DIVE_DZ_MIN = -10;
const DIVE_DZ_MAX = 17;
// One backward dive recorded: hit 29.2 px ahead 17.3 px up, missed 27.2 px ahead 20.3 px up.
const BACK_DIVE_AHEAD = 30;
const BACK_DIVE_DZ_MAX = 18;
// Kicks from the ground, from the recorded hits and misses. The overhead kick, once the leg is out
// (tick 5 on), also reaches a ball lying ~19 px away.
const STRIKES = {
  volley: { dx: 13, minZ: 0, maxZ: 32 },
  volleyShot: { dx: 16, minZ: 12, maxZ: 32 },
  overheadShot: { dx: 16, minZ: 0, maxZ: 12, farDx: 20, farFrom: 5 },
};
// Keeping the ball up with A: how far to the side, how low it has come.
const KEEP_UP_DX = 14;
const KEEP_UP_Z = 12;
// Juggling it on the run: reach before either moves.
const JUGGLE_MAX_Z = 30;
const JUGGLE_DX = 8;

// Taking the ball: measured with tools/simulate.py (mount-* plans), taken 14.3 px away, not 15.7.
const CAPTURE_DX = 12;
export const CAPTURE_DZ = 1.5;
const GROUND_CAPTURE_DX = 14.5;
// A ball in flight caught by a player in the air: caught up to 13.2 px ahead and 14.0 px below,
// missed at 15.5 px ahead and 14.1 px below.
const AIR_CATCH_DX = 14;
const AIR_CATCH_DZ_MIN = -14;
// Trapping: trapped up to 31.4 px recorded (judged before it moves).
const TRAP_DX = 16;
const TRAP_MAX_Z = 32;
// A ball dropping onto the head: the top of it, how far to the side it reaches.
export const HEAD_Z = 24;
const HEAD_DX = 12.5;
// Dropping onto a ball lying below: 14.8 px away landed on it, 15.6 px missed (tools/simulate.py,
// the mount-* plans); from his height down to the ball's top while standing on it.
const MOUNT_DX = 15;
const RIDE_Z = 13;

const either = (d, dz) => [{ ahead: [-d, d], dz }];
const abs = Math.abs;

export const REACH = {
  hit: {
    note: 'a kick at the ball: the volley in the air, the kicks in the air but those below',
    fits: ({ dx, dz }) => abs(dx) <= HIT_DX && dz >= HIT_DZ_MIN && dz <= HIT_DZ_MAX,
    shapes: () => either(HIT_DX, [HIT_DZ_MIN, HIT_DZ_MAX]),
  },
  // ctx.t: the tick of the kick the hit comes on.
  overhead: {
    note: 'the overhead kick in the air, tick by tick',
    fits: ({ ahead, dz }, { t }) => {
      if (dz < (t >= OVERHEAD_LOW_FROM ? OVERHEAD_LOW_DZ_MIN : HIT_DZ_MIN)) return false;
      if (t === 4 && dz > OVERHEAD_T4_DZ_MAX) return false;
      if (ahead >= 0) {
        return ahead <= (t <= 4 ? OVERHEAD_AHEAD_EARLY : OVERHEAD_AHEAD)
          && dz <= (ahead > OVERHEAD_NEAR ? OVERHEAD_FAR_DZ_MAX : OVERHEAD_DZ_MAX);
      }
      return -ahead <= OVERHEAD_BEHIND && dz <= (-ahead <= OVERHEAD_NEAR_BEHIND ? OVERHEAD_DZ_MAX : OVERHEAD_BEHIND_DZ_MAX);
    },
    shapes: ({ t }) => {
      const low = t >= OVERHEAD_LOW_FROM ? OVERHEAD_LOW_DZ_MIN : HIT_DZ_MIN;
      const cap = (max) => (t === 4 ? Math.min(max, OVERHEAD_T4_DZ_MAX) : max);
      const front = t <= 4 ? OVERHEAD_AHEAD_EARLY : OVERHEAD_AHEAD;
      return [
        { ahead: [0, Math.min(front, OVERHEAD_NEAR)], dz: [low, cap(OVERHEAD_DZ_MAX)] },
        ...(front > OVERHEAD_NEAR ? [{ ahead: [OVERHEAD_NEAR, front], dz: [low, cap(OVERHEAD_FAR_DZ_MAX)] }] : []),
        { ahead: [-OVERHEAD_NEAR_BEHIND, 0], dz: [low, cap(OVERHEAD_DZ_MAX)] },
        { ahead: [-OVERHEAD_BEHIND, -OVERHEAD_NEAR_BEHIND], dz: [low, cap(OVERHEAD_BEHIND_DZ_MAX)] },
      ];
    },
  },
  bicycle: {
    note: 'the bicycle kick: a ball some way off to either side',
    fits: ({ dx, dz }) => abs(dx) >= BICYCLE_DX_MIN && abs(dx) <= HIT_DX && dz >= HIT_DZ_MIN && dz <= BICYCLE_DZ_MAX,
    shapes: () => [
      { ahead: [-HIT_DX, -BICYCLE_DX_MIN], dz: [HIT_DZ_MIN, BICYCLE_DZ_MAX] },
      { ahead: [BICYCLE_DX_MIN, HIT_DX], dz: [HIT_DZ_MIN, BICYCLE_DZ_MAX] },
    ],
  },
  volleyShotAir: {
    note: 'the volley shot in the air: high, and behind him too',
    fits: ({ dx, dz }) => abs(dx) <= AIR_VOLLEY_DX && dz >= HIT_DZ_MIN && dz <= AIR_VOLLEY_DZ_MAX,
    shapes: () => either(AIR_VOLLEY_DX, [HIT_DZ_MIN, AIR_VOLLEY_DZ_MAX]),
  },
  // ctx.backward: diving the other way from the way he faces.
  dive: {
    note: 'a dive; diving backwards it meets a ball well ahead of where he faces',
    fits: ({ dx, ahead, dz }, { backward }) => (backward
      ? ahead >= 0 && ahead <= BACK_DIVE_AHEAD && dz >= DIVE_DZ_MIN && dz <= BACK_DIVE_DZ_MAX
      : abs(dx) <= DIVE_DX && dz >= DIVE_DZ_MIN && dz <= DIVE_DZ_MAX),
    shapes: ({ backward }) => (backward
      ? [{ ahead: [0, BACK_DIVE_AHEAD], dz: [DIVE_DZ_MIN, BACK_DIVE_DZ_MAX] }]
      : either(DIVE_DX, [DIVE_DZ_MIN, DIVE_DZ_MAX])),
  },
  // ctx.kind: the kick (volley, volleyShot, overheadShot); ctx.t: its tick.
  strike: {
    note: 'a kick from the ground, until it meets the ball',
    fits: ({ dx, dz }, { kind, t }) => {
      const reach = STRIKES[kind];
      return abs(dx) <= (t >= reach.farFrom ? reach.farDx : reach.dx) && dz >= reach.minZ && dz <= reach.maxZ;
    },
    shapes: ({ kind, t }) => {
      const reach = STRIKES[kind];
      return either(t >= reach.farFrom ? reach.farDx : reach.dx, [reach.minZ, reach.maxZ]);
    },
  },
  keepUp: {
    note: 'A keeping the ball up, as it comes down low enough (it must be falling)',
    fits: ({ dx, z }) => abs(dx) <= KEEP_UP_DX && z <= KEEP_UP_Z,
    shapes: () => [{ ahead: [-KEEP_UP_DX, KEEP_UP_DX], z: [-Infinity, KEEP_UP_Z] }],
  },
  keepUpChoice: {
    note: 'A goes for keeping it up at a ball in the air above him (unless it is to be volleyed)',
    fits: ({ dx, z }) => z >= 1 && abs(dx) <= KEEP_UP_DX,
    shapes: () => [{ ahead: [-KEEP_UP_DX, KEEP_UP_DX], z: [1, Infinity] }],
  },
  juggle: {
    note: 'running under a falling ball knocks it up again (judged before either moves)',
    fits: ({ dx, z }) => z >= 1 && z <= JUGGLE_MAX_Z && abs(dx) <= JUGGLE_DX,
    shapes: () => [{ ahead: [-JUGGLE_DX, JUGGLE_DX], z: [1, JUGGLE_MAX_Z] }],
  },
  catch: {
    note: 'a ball in flight caught in the air, just ahead (judged before either moves)',
    fits: ({ ahead, dz, z }) => z >= 1 && ahead >= 0 && ahead <= AIR_CATCH_DX && dz >= AIR_CATCH_DZ_MIN && dz <= CAPTURE_DZ,
    shapes: () => [{ ahead: [0, AIR_CATCH_DX], dz: [AIR_CATCH_DZ_MIN, CAPTURE_DZ], z: [1, Infinity] }],
  },
  // ctx.air: in the air (from where he is) or on the ground (from where he was before he moved).
  take: {
    note: 'how far to the side the ball is taken (how high: practice.js, by how it comes)',
    fits: ({ dx }, { air }) => abs(dx) <= (air ? CAPTURE_DX : GROUND_CAPTURE_DX),
    shapes: ({ air }) => [{ ahead: [-(air ? CAPTURE_DX : GROUND_CAPTURE_DX), air ? CAPTURE_DX : GROUND_CAPTURE_DX] }],
  },
  // ctx.trapping: already trapping it (then no height limit).
  trap: {
    note: 'trapping a ball coming down at his feet (judged before either moves)',
    fits: ({ dx, z }, { trapping }) => (trapping || (z >= 1 && z <= TRAP_MAX_Z)) && abs(dx) <= TRAP_DX,
    shapes: ({ trapping }) => [{ ahead: [-TRAP_DX, TRAP_DX], ...(trapping ? {} : { z: [1, TRAP_MAX_Z] }) }],
  },
  head: {
    note: 'a ball dropping onto his head as he rises (it must drop below the top of it next)',
    fits: ({ ahead, dz }) => abs(ahead) <= HEAD_DX && dz >= HEAD_Z,
    shapes: () => [{ ahead: [-HEAD_DX, HEAD_DX], dz: [HEAD_Z, Infinity] }],
  },
  // rel.dz here: the ball's (lying) height from him, minus his height.
  mount: {
    note: 'dropping onto a ball lying below lands on it',
    fits: ({ dx, dz }) => abs(dx) <= MOUNT_DX && dz < 0 && dz >= -RIDE_Z,
    shapes: () => either(MOUNT_DX, [-RIDE_Z, 0]),
  },
};

// Where the ball is from the player, for the rules; the options give other positions (a reach
// judged from where either was before they moved).
export function relation(p, b, { x = p.x, z = p.z, ballX = b.x, ballZ = b.z } = {}) {
  const dx = ballX - x;
  return { dx, ahead: p.facing === 'left' ? -dx : dx, dz: ballZ - z, z: ballZ };
}
