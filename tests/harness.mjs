// Runs input plans through the game logic the way the page does (js/game/game.js and input.js):
// a logic tick every 3rd frame, the pose every frame, a press between two ticks still reaching
// the next one. Plans are as in tools/simulate.py: [from, to, buttons] in frames, buttons from
// LRUDAB.
import { START } from '../js/art/sprites.js';
import { drawnFacing, framePlayer } from '../js/game/player.js';
import { createPractice, tickPractice } from '../js/game/practice.js';

export const FRAMES_PER_TICK = 3;
const BUTTONS = { L: 'left', R: 'right', U: 'up', D: 'down', A: 'a', B: 'b' };

export const tap = (at, buttons, frames = 2) => [[at, at + frames, buttons]];
export const doubleTap = (at, buttons) => [...tap(at, buttons, 4), ...tap(at + 8, buttons, 4)];

function heldAt(plan, frame) {
  const held = { left: false, right: false, up: false, down: false, a: false, b: false };
  for (const [from, to, buttons] of plan) {
    if (frame >= from && frame < to) for (const c of buttons) held[BUTTONS[c]] = true;
  }
  return held;
}

// Calls onTick(s, { frame, input, pose, facing }) after every tick, with the pose drawn on that
// frame. Returns the practice state at the end.
export function runPlan(plan, frames, onTick = () => {}) {
  const s = createPractice(START.playerX, START.ballX);
  let tapped = { a: false, b: false };
  for (let frame = 0; frame < frames; frame++) {
    const held = heldAt(plan, frame);
    tapped = { a: tapped.a || held.a, b: tapped.b || held.b };
    let input = null;
    if (frame % FRAMES_PER_TICK === 0) {
      input = { ...held, a: tapped.a, b: tapped.b };
      tickPractice(s, input);
      tapped = { a: false, b: false };
    }
    const pose = framePlayer(s.player);
    if (input) onTick(s, { frame, input, pose, facing: drawnFacing(s.player, pose) });
  }
  return s;
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
