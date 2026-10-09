// Runs input plans through the game logic the way the page does (js/game/game.js and input.js):
// a logic tick every 3rd frame, the pose every frame, a press between two ticks still reaching
// the next one. Plans are as in tools/simulate.py: [from, to, buttons] in frames, buttons from
// LRUDAB.
import { START } from '../js/art/sprites.js';
import { drawnFacing, framePlayer } from '../js/game/player.js';
import { createPractice, tickPractice } from '../js/game/practice.js';

export const FRAMES_PER_TICK = 3;
const BUTTON_KEYS = { L: 'left', R: 'right', U: 'up', D: 'down', A: 'a', B: 'b' };

export const tap = (at, buttons, frames = 2) => [[at, at + frames, buttons]];
export const doubleTap = (at, buttons) => [...tap(at, buttons, 4), ...tap(at + 8, buttons, 4)];

export function heldAt(plan, frame) {
  const held = { left: false, right: false, up: false, down: false, a: false, b: false };
  for (const [from, to, buttons] of plan) {
    if (frame >= from && frame < to) for (const c of buttons) held[BUTTON_KEYS[c]] = true;
  }
  return held;
}

// A run of the game, frame by frame: stepFrame(run, held) with the buttons held on its frame.
export function createRun() {
  return { s: createPractice(START.playerX, START.ballX), tapped: { a: false, b: false }, frame: 0 };
}

// One frame: a logic tick on every 3rd, the pose on each. Returns { frame, input, pose, facing },
// input null between ticks.
export function stepFrame(run, held) {
  const { s } = run;
  const frame = run.frame;
  run.tapped = { a: run.tapped.a || held.a, b: run.tapped.b || held.b };
  let input = null;
  if (frame % FRAMES_PER_TICK === 0) {
    input = { ...held, a: run.tapped.a, b: run.tapped.b };
    tickPractice(s, input);
    run.tapped = { a: false, b: false };
  }
  run.frame += 1;
  const pose = framePlayer(s.player);
  return { frame, input, pose, facing: drawnFacing(s.player, pose) };
}

// Calls onTick(s, info) after every tick and onFrame(s, info) after every frame. Returns the
// practice state at the end.
export function runPlan(plan, frames, onTick = () => {}, onFrame = () => {}) {
  const run = createRun();
  while (run.frame < frames) {
    const info = stepFrame(run, heldAt(plan, run.frame));
    if (info.input) onTick(run.s, info);
    onFrame(run.s, info);
  }
  return run.s;
}

// Back from the buttons held on each frame to a plan of [from, to, buttons].
export function planOf(heldFrames) {
  const plan = [];
  const keys = heldFrames.map((h) => Object.entries(BUTTON_KEYS).filter(([, name]) => h[name]).map(([c]) => c).join(''));
  for (let f = 0; f < keys.length;) {
    let end = f + 1;
    while (end < keys.length && keys[end] === keys[f]) end += 1;
    if (keys[f]) plan.push([f, end, keys[f]]);
    f = end;
  }
  return plan;
}

const n = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(3));

// One line per tick: what a change in the game's behaviour shows up in.
export function traceLine(s, { frame, input, pose, facing }) {
  const { player: p, ball: b } = s;
  const keys = Object.entries(input).filter(([, v]) => v).map(([k]) => k[0].toUpperCase()).join('') || '-';
  return [
    String(frame).padStart(4), keys.padEnd(3),
    `P ${n(p.x)} ${n(p.z)} ${p.mode}${p.action ? `/${p.action.name}` : ''} ${p.facing[0]} pose ${pose}${facing[0]}`,
    `${p.hasBall ? 'ball' : ''}${p.onBall ? 'onball' : ''}${p.trapping ? 'trap' : ''}`,
    `| B ${n(b.x)} ${n(b.z)} v ${n(b.vx)} ${n(b.vz)} f${b.frame}`,
    s.sounds.length ? `| ${s.sounds.join(',')}` : '',
  ].filter(Boolean).join(' ');
}
