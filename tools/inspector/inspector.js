// The inspector: a plan (from tests/plans.mjs, edited, or recorded from the keyboard) played
// through the game logic frame by frame, with the whole state, the poses, actions and sounds.
// Serve the repository and open /tools/inspector/ (it is not published with the page).
import { PALETTES, PLAYER_POSES } from '../../js/art/sprites.js';
import { createSound } from '../../js/audio/sound.js';
import { SOUND_DATA } from '../../js/audio/sound-data.js';
import { ACTIONS, ANIMATIONS, POSE } from '../../js/game/player.js';
import { createRenderer, paintParts } from '../../js/game/render.js';
import { createRun, FRAMES_PER_TICK, planOf, runPlan, stepFrame } from '../../tests/harness.mjs';
import { PLANS } from '../../tests/plans.mjs';

const $ = (selector) => document.querySelector(selector);
const SCALE = 3;
const FRAME_MS = 1000 / 60;
const MAX_RECORD_FRAMES = 60 * 60;
const POSE_NAMES = Object.fromEntries(Object.entries(POSE).map(([name, i]) => [i, name]));
const KEYS = { ArrowLeft: ['left'], ArrowRight: ['right'], ArrowUp: ['up'], ArrowDown: ['down'], KeyX: ['a'], KeyZ: ['b'], Space: ['a', 'b'] };
const MODE_COLORS = { walk: '#3f8f5a', run: '#7cc35a', skid: '#c8873f', air: '#4f8fff', land: '#2fb3b3', dive: '#b05cc8' };
const SOUND_COLORS = { kick: '#ffd34d', shot: '#ff5a5a', bounce: '#9aa0aa', jump: '#8fd3ff', land: '#2fb3b3', pickup: '#6fdc6f' };
const SOUND_NOTES = {
  kick: 'a pass, a chip, keeping the ball up, a volley from the ground, juggling it on the run',
  shot: 'a shot: B on the ground, a dive, the kicks in the air at the goal',
  bounce: 'the ball off the ground',
  jump: 'leaving the ground (A+B)',
  land: 'back on the ground, a dive too',
  pickup: 'taking the ball: at the feet, trapped, caught in the air',
};

const sound = createSound({ music: false });
document.addEventListener('pointerdown', () => sound.start(), { once: true, capture: true });

// --- Tabs ---

document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  document.querySelectorAll('.tab').forEach((section) => (section.hidden = section.id !== tab.dataset.tab));
  if (tab.dataset.tab !== 'timeline') pause();
}));

// --- The scene ---

const scene = $('#scene');
const render = createRenderer(scene);
const overlay = $('#overlay').getContext('2d');

function draw(s, pose, facing) {
  const { player: p, ball: b } = s;
  render.clear();
  render.player(p.x, p.z, pose, facing);
  render.ball(b.x, b.z, b.frame);
  overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
  if (!$('#marks').checked) return;
  // Where the logic has them: the player's feet and the middle of the ball (screen rows as drawn).
  const px = Math.floor(p.x) * SCALE;
  const py = (166 - Math.floor(p.z)) * SCALE;
  const bx = Math.floor(b.x) * SCALE;
  const by = (158 - Math.floor(b.z)) * SCALE;
  overlay.lineWidth = 2;
  overlay.strokeStyle = '#ffd34d';
  overlay.beginPath();
  overlay.moveTo(px - 10, py);
  overlay.lineTo(px + 10, py);
  overlay.moveTo(px, py - 10);
  overlay.lineTo(px, py + 4);
  overlay.stroke();
  overlay.strokeStyle = '#ff5a5a';
  overlay.beginPath();
  overlay.arc(bx, by, 6, 0, Math.PI * 2);
  overlay.stroke();
  overlay.font = '13px ui-monospace, Consolas, monospace';
  overlay.fillStyle = '#fff';
  overlay.shadowColor = '#000';
  overlay.shadowBlur = 3;
  const action = p.action ? ` ${p.action.name} ${p.action.t}` : '';
  overlay.fillText(`${p.mode}${action}`, px - 30, py - 120);
  overlay.fillText(`dx ${(b.x - p.x).toFixed(1)}  dz ${(b.z - p.z).toFixed(1)}`, bx + 10, by - 10);
  overlay.shadowBlur = 0;
}

// --- The timeline: one entry per frame ---

let timeline = []; // { s, pose, facing, input, sounds }
let current = 0;
let plans = { ...Object.fromEntries(Object.entries(PLANS).map(([name, [frames, plan]]) => [name, { frames, plan }])) };

function load(name) {
  const { frames, plan } = plans[name];
  timeline = [];
  runPlan(plan, frames, () => {}, (s, info) => {
    timeline.push({ s: structuredClone(s), pose: info.pose, facing: info.facing, input: info.input, sounds: info.input ? [...s.sounds] : [] });
  });
  $('#plan-text').value = JSON.stringify({ frames, plan });
  $('#frame').max = String(timeline.length - 1);
  drawStrip();
  seek(0);
}

function fillPlans(selected) {
  $('#plan').replaceChildren(...Object.keys(plans).map((name) => new Option(name, name, false, name === selected)));
}

$('#plan').addEventListener('change', () => load($('#plan').value));
$('#plan-run').addEventListener('click', () => {
  try {
    const { frames, plan } = JSON.parse($('#plan-text').value);
    const name = `edited ${new Date().toLocaleTimeString()}`;
    plans[name] = { frames, plan };
    fillPlans(name);
    load(name);
  } catch (error) {
    alert(`Not a plan: ${error.message}`);
  }
});

function seek(frame, { sounds = false } = {}) {
  const to = Math.max(0, Math.min(timeline.length - 1, frame));
  if (sounds && $('#sound').checked) {
    for (let f = current + 1; f <= to; f++) timeline[f].sounds.forEach((name) => sound.play(name));
  }
  current = to;
  const entry = timeline[current];
  draw(entry.s, entry.pose, entry.facing);
  $('#frame').value = String(current);
  const tick = Math.floor(current / FRAMES_PER_TICK);
  $('#position').textContent = `frame ${current} · tick ${tick} · ${(current / 60).toFixed(2)} s`;
  showState(entry, timeline[current - 1]);
  drawStrip();
}

// --- Playing ---

let playing = false;
let last = 0;
let carry = 0;

function play() {
  if (current >= timeline.length - 1) seek(0);
  playing = true;
  $('#play').textContent = '⏸';
  last = performance.now();
  carry = 0;
  requestAnimationFrame(frameLoop);
}

function pause() {
  playing = false;
  $('#play').textContent = '▶';
}

function frameLoop(now) {
  if (!playing) return;
  carry += ((now - last) / FRAME_MS) * Number($('#speed').value);
  last = now;
  const steps = Math.floor(carry);
  carry -= steps;
  if (steps) seek(current + steps, { sounds: true });
  if (current >= timeline.length - 1) pause();
  else requestAnimationFrame(frameLoop);
}

$('#play').addEventListener('click', () => (playing ? pause() : play()));
document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
  pause();
  const step = button.dataset.step;
  if (step === 'start') seek(0);
  else if (step === 'end') seek(timeline.length - 1);
  else seek(current + Number(step), { sounds: Number(step) > 0 });
}));
$('#frame').addEventListener('input', () => {
  pause();
  seek(Number($('#frame').value));
});

document.addEventListener('keydown', (event) => {
  if (recording || $('#timeline').hidden || event.target.closest('textarea, select, input[type="text"]')) return;
  const keys = {
    Space: () => (playing ? pause() : play()),
    ArrowLeft: () => seek(current - (event.shiftKey ? FRAMES_PER_TICK : 1)),
    ArrowRight: () => seek(current + (event.shiftKey ? FRAMES_PER_TICK : 1), { sounds: true }),
    Home: () => seek(0),
    End: () => seek(timeline.length - 1),
  };
  if (!keys[event.code]) return;
  event.preventDefault();
  if (event.code !== 'Space') pause();
  keys[event.code]();
});
$('#marks').addEventListener('change', () => seek(current));

// --- The strip: a column per tick (mode below, action above), sounds as marks on top ---

const strip = $('#strip');

function drawStrip() {
  const width = strip.clientWidth || 768;
  if (strip.width !== width) strip.width = width;
  const ctx = strip.getContext('2d');
  ctx.clearRect(0, 0, strip.width, strip.height);
  const ticks = timeline.filter((e) => e.input);
  const w = strip.width / Math.max(1, ticks.length);
  ticks.forEach((entry, i) => {
    const p = entry.s.player;
    ctx.fillStyle = MODE_COLORS[p.mode] ?? '#666';
    ctx.fillRect(i * w, 30, Math.ceil(w), 24);
    if (p.action) {
      ctx.fillStyle = `hsl(${hash(p.action.name) % 360} 60% 55%)`;
      ctx.fillRect(i * w, 16, Math.ceil(w), 12);
    }
    entry.sounds.forEach((name, k) => {
      ctx.fillStyle = SOUND_COLORS[name] ?? '#fff';
      ctx.fillRect(i * w, 2 + k * 5, Math.max(2, Math.ceil(w)), 4);
    });
  });
  const x = (current / Math.max(1, timeline.length - 1)) * strip.width;
  ctx.fillStyle = '#fff';
  ctx.fillRect(Math.round(x) - 1, 0, 2, strip.height);
}

const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function seekStrip(event) {
  const box = strip.getBoundingClientRect();
  pause();
  seek(Math.round(((event.clientX - box.left) / box.width) * (timeline.length - 1)));
}
strip.addEventListener('pointerdown', (event) => {
  seekStrip(event);
  strip.setPointerCapture(event.pointerId);
});
strip.addEventListener('pointermove', (event) => {
  if (event.buttons) seekStrip(event);
});
window.addEventListener('resize', drawStrip);

$('#legend').innerHTML = [
  ...Object.entries(MODE_COLORS).map(([mode, color]) => `<span><i style="background:${color}"></i>${mode}</span>`),
  '<span>above: the action</span>',
  ...Object.entries(SOUND_COLORS).map(([name, color]) => `<span><i style="background:${color}"></i>${name}</span>`),
].join('');

// --- The state: everything the logic keeps, what changed since the last frame marked ---

const escape = (text) => String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function value(v) {
  if (v === null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return escape(v);
}

function fields(obj, prev, skip = []) {
  return Object.entries(obj).filter(([key]) => !skip.includes(key)).map(([key, v]) => {
    const before = prev?.[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return `<div class="group"><dt>${key}</dt><dl>${fields(v, before && typeof before === 'object' ? before : null)}</dl></div>`;
    }
    const changed = prev && JSON.stringify(v) !== JSON.stringify(before);
    return `<dt${changed ? ' class="changed"' : ''}>${key}</dt><dd${changed ? ' class="changed"' : ''}>${value(v)}</dd>`;
  }).join('');
}

function actionText(a) {
  if (!a) return '—';
  const total = a.steps.reduce((n, [, ticks]) => n + ticks, 0);
  const flags = ['struck', 'turned'].filter((k) => a[k]);
  return `${a.name} ${a.t}/${total}${a.hitTick !== null ? ` hit@${a.hitTick}` : ''}${flags.length ? ` (${flags.join(', ')})` : ''}`;
}

function showState(entry, prevEntry) {
  const { s, pose, facing, input, sounds } = entry;
  const prev = prevEntry?.s;
  const { player, ball, ...practice } = s;
  const pressed = input ? Object.entries(input).filter(([, v]) => v).map(([k]) => k) : null;
  $('#state').innerHTML = `
    <h3>This frame</h3>
    <dl>
      <dt>tick</dt><dd>${input ? 'yes' : 'no (between ticks)'}</dd>
      <dt>input</dt><dd class="tags">${pressed ? pressed.map((k) => `<span>${k}</span>`).join('') || '—' : '—'}</dd>
      <dt>sounds</dt><dd class="tags">${sounds.map((k) => `<span>${k}</span>`).join('') || '—'}</dd>
      <dt>pose</dt><dd>${pose} ${POSE_NAMES[pose] ?? ''} (${facing})</dd>
      <dt>action</dt><dd>${escape(actionText(player.action))}</dd>
    </dl>
    <h3>Player</h3><dl>${fields(player, prev?.player, ['action'])}</dl>
    <h3>Ball</h3><dl>${fields(ball, prev?.ball)}</dl>
    <h3>Practice</h3><dl>${fields(practice, prev ? (({ player: _p, ball: _b, ...rest }) => rest)(prev) : null, ['sounds'])}</dl>`;
}

// --- Recording from the keyboard ---

let recording = null;

// As js/game/input.js reads them: the keys down, and A or B pressed since the last frame even if
// already let go (a press shorter than a frame still reaches the next tick there too).
function heldNow(r) {
  const held = { left: false, right: false, up: false, down: false, a: false, b: false };
  r.down.forEach((code) => KEYS[code].forEach((button) => (held[button] = true)));
  r.pressed.forEach((code) => KEYS[code].filter((b) => b === 'a' || b === 'b').forEach((button) => (held[button] = true)));
  r.pressed.clear();
  return held;
}

function startRecording() {
  pause();
  recording = { run: createRun(), held: [], down: new Set(), pressed: new Set(), last: performance.now(), carry: 0 };
  $('#record').textContent = '■ Stop';
  $('#recording').hidden = false;
  overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
  // Space is A+B here: on the focused button it would stop the recording.
  document.activeElement?.blur();
  requestAnimationFrame(recordLoop);
}

function recordLoop(now) {
  if (!recording) return;
  const r = recording;
  r.carry = Math.min(r.carry + (now - r.last) / FRAME_MS, 6);
  r.last = now;
  let info = null;
  while (r.carry >= 1) {
    const held = heldNow(r);
    r.held.push(held);
    info = stepFrame(r.run, held);
    if (info.input && $('#sound').checked) r.run.s.sounds.forEach((name) => sound.play(name));
    r.carry -= 1;
  }
  if (info) {
    render.clear();
    render.player(r.run.s.player.x, r.run.s.player.z, info.pose, info.facing);
    render.ball(r.run.s.ball.x, r.run.s.ball.z, r.run.s.ball.frame);
  }
  if (r.held.length >= MAX_RECORD_FRAMES) stopRecording();
  else requestAnimationFrame(recordLoop);
}

function stopRecording() {
  const r = recording;
  recording = null;
  $('#record').textContent = '● Record';
  $('#recording').hidden = true;
  if (!r || !r.held.length) return;
  const name = `recorded ${new Date().toLocaleTimeString()}`;
  plans[name] = { frames: r.held.length, plan: planOf(r.held) };
  fillPlans(name);
  load(name);
}

$('#record').addEventListener('click', () => (recording ? stopRecording() : startRecording()));
window.addEventListener('keydown', (event) => {
  if (!recording) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    stopRecording();
  } else if (KEYS[event.code]) {
    event.preventDefault();
    recording.down.add(event.code);
    recording.pressed.add(event.code);
  }
});
window.addEventListener('keyup', (event) => recording?.down.delete(event.code));
window.addEventListener('blur', () => recording?.down.clear());

// --- Poses, animations and actions ---

const poseCanvas = (() => {
  const cache = new Map();
  return (index, mirror) => {
    const key = `${index}${mirror}`;
    if (!cache.has(key)) {
      const { parts, width, height } = PLAYER_POSES[index];
      cache.set(key, paintParts(parts, width, height, PALETTES.player, mirror));
    }
    return cache.get(key);
  };
})();
const BOX = Math.max(...PLAYER_POSES.map((p) => Math.max(p.width, p.height)));

function drawPose(canvas, index, mirror = false) {
  const ctx = canvas.getContext('2d');
  canvas.width = BOX;
  canvas.height = BOX;
  ctx.clearRect(0, 0, BOX, BOX);
  const sprite = poseCanvas(index, mirror);
  ctx.drawImage(sprite, Math.floor((BOX - sprite.width) / 2), BOX - sprite.height);
}

$('#poses').append(...PLAYER_POSES.map((_, i) => {
  const card = document.createElement('div');
  card.className = 'pose';
  const left = document.createElement('canvas');
  const right = document.createElement('canvas');
  drawPose(left, i, false);
  drawPose(right, i, true);
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.append(left, right);
  card.append(row, `${i} ${POSE_NAMES[i] ?? ''}`);
  return card;
}));

$('#animations').innerHTML = Object.entries(ANIMATIONS).map(([name, { poses, frames }]) => (
  `<p><b>${name}</b>: ${poses.map((i) => `${POSE_NAMES[i]}`).join(' → ')}, ${frames} frames each</p>`
)).join('');

function actionTicks(name) {
  const def = ACTIONS[name];
  const out = [];
  for (const [pose, ticks] of def.steps) for (let i = 0; i < ticks; i++) out.push(pose);
  return out.map((pose, t) => {
    const labels = [];
    if (def.events[t]) labels.push(def.events[t]);
    if (def.strike && t > 0) labels.push(`strike`);
    const hit = def.hits && t >= def.hits.from && t <= def.hits.to && !def.hits.skip?.includes(t);
    if (hit) labels.push(def.hits.event);
    return { pose, t, labels, hit };
  });
}

let preview = null;

$('#actions').append(...Object.keys(ACTIONS).map((name) => {
  const row = document.createElement('div');
  row.className = 'action';
  const def = ACTIONS[name];
  const extra = ['decel', 'inputFrom', 'abFrom', 'steerFrom'].filter((k) => def[k] !== undefined).map((k) => `${k} ${def[k]}`);
  if (def.speeds) extra.push(`speeds ${def.speeds.join(' ')}`);
  const title = document.createElement('b');
  title.innerHTML = `${name}<br><small>${actionTicks(name).length} ticks${extra.length ? `<br>${extra.join('<br>')}` : ''}</small>`;
  const cells = document.createElement('div');
  cells.className = 'cells';
  cells.append(...actionTicks(name).map(({ pose, t, labels, hit }) => {
    const cell = document.createElement('div');
    cell.className = `cell${hit ? ' hit' : ''}`;
    const canvas = document.createElement('canvas');
    drawPose(canvas, pose, true);
    cell.append(canvas, `${t} ${POSE_NAMES[pose]}`);
    if (labels.length) {
      const event = document.createElement('div');
      event.className = 'event';
      event.textContent = labels.join(' ');
      cell.append(event);
    }
    return cell;
  }));
  row.append(title, cells);
  row.addEventListener('click', () => {
    document.querySelectorAll('.action.selected').forEach((r) => r.classList.remove('selected'));
    row.classList.add('selected');
    preview = { ticks: actionTicks(name), start: performance.now() };
    $('#action-name').textContent = name;
    requestAnimationFrame(previewLoop);
  });
  return row;
}));

function previewLoop(now) {
  if (!preview || $('#gallery').hidden) return;
  // A tick is 3 frames; a pause of a few ticks between the loops.
  const tick = Math.floor((now - preview.start) / (FRAME_MS * FRAMES_PER_TICK)) % (preview.ticks.length + 6);
  const canvas = $('#action-preview');
  if (tick < preview.ticks.length) drawPose(canvas, preview.ticks[tick].pose, true);
  requestAnimationFrame(previewLoop);
}

// --- Sounds ---

$('#sfx').append(...Object.keys(SOUND_DATA.sfx).flatMap((name) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `▶ ${name}`;
  button.addEventListener('click', () => {
    sound.start();
    sound.play(name);
  });
  const note = document.createElement('span');
  note.textContent = SOUND_NOTES[name] ?? '';
  return [button, note];
}));

let musicOn = false;
$('#music').addEventListener('click', () => {
  sound.start();
  musicOn = !musicOn;
  sound.setMusic(musicOn);
  $('#music').textContent = musicOn ? '■ Stop the song' : '▶ Play the song';
});

// --- Start ---

fillPlans('juggle');
load('juggle');
