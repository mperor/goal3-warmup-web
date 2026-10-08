// The inspector: a plan (from tests/plans.mjs, edited, or recorded from the keyboard) played
// through the game logic frame by frame, with the whole state, marks on the moments that look
// wrong, the poses, actions and sounds. Serve the repository and open /tools/inspector/ (it is
// not published with the page).
import { createSound } from '../../js/audio/sound.js';
import { SOUND_DATA } from '../../js/audio/sound-data.js';
import { createRenderer } from '../../js/game/render.js';
import { createRun, FRAMES_PER_TICK, heldAt, planOf, runPlan, stepFrame } from '../../tests/harness.mjs';
import { PLANS } from '../../tests/plans.mjs';
import { initCatalog } from './catalog.js';
import { drawPose, escape, FRAME_MS, POSE_NAMES } from './shared.js';

const $ = (selector) => document.querySelector(selector);
const SCALE = 3;
const MAX_RECORD_FRAMES = 60 * 60;
const STORAGE_KEY = 'goal3-inspector:plans';
const KEYS = { ArrowLeft: ['left'], ArrowRight: ['right'], ArrowUp: ['up'], ArrowDown: ['down'], KeyX: ['a'], KeyZ: ['b'], Space: ['a', 'b'] };
const BUTTONS = [['L', 'left', '#9ad'], ['R', 'right', '#9ad'], ['U', 'up', '#b9e'], ['D', 'down', '#b9e'], ['A', 'a', '#ffd34d'], ['B', 'b', '#ff8a5a']];
const MODE_COLORS = { walk: '#3f8f5a', run: '#7cc35a', skid: '#c8873f', air: '#4f8fff', land: '#2fb3b3', dive: '#b05cc8' };
const SOUND_COLORS = { kick: '#ffd34d', shot: '#ff5a5a', bounce: '#9aa0aa', jump: '#8fd3ff', land: '#2fb3b3', pickup: '#6fdc6f' };
const MARK_COLOR = '#ff4d6d';
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

// --- Plans: the built-in ones, and those recorded or edited here (kept in this browser) ---

// name -> { frames, plan, marks: [{ frame, note }], own }
const plans = {};
for (const [name, [frames, plan]] of Object.entries(PLANS)) plans[name] = { frames, plan, marks: [], own: false };

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    for (const [name, p] of Object.entries(saved)) {
      if (p.own) plans[name] = p;
      else if (plans[name]) plans[name].marks = p.marks ?? [];
    }
  } catch {
    // Nothing kept then.
  }
}

function save() {
  try {
    const kept = Object.fromEntries(Object.entries(plans).filter(([, p]) => p.own || p.marks.length)
      .map(([name, p]) => [name, p.own ? p : { marks: p.marks }]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Not kept then.
  }
}

function fillPlans(selected) {
  const option = (name) => new Option(`${name}${plans[name].marks.length ? ` ⚑${plans[name].marks.length}` : ''}`, name, false, name === selected);
  const own = Object.keys(plans).filter((n) => plans[n].own);
  const groups = [['Recorded and edited here', own], ['tests/plans.mjs', Object.keys(plans).filter((n) => !plans[n].own)]];
  $('#plan').replaceChildren(...groups.filter(([, names]) => names.length).map(([label, names]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    group.append(...names.map(option));
    return group;
  }));
  $('#delete').disabled = !plans[selected]?.own;
}

function addPlan(prefix, frames, plan, marks = []) {
  const name = `${prefix} ${new Date().toLocaleString()}`;
  plans[name] = { frames, plan, marks, own: true };
  save();
  fillPlans(name);
  load(name);
}

// --- Tabs ---

let catalog = null;
document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

function showTab(id) {
  document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  document.querySelectorAll('.tab').forEach((section) => (section.hidden = section.id !== id));
  if (id !== 'timeline') pause();
  if (id === 'gallery') catalog.shown();
  if (id === 'timeline') redraw();
}

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

let name = null;
let timeline = []; // { s, pose, facing, held, input, sounds }
let current = 0;

function load(planName) {
  name = planName;
  const { frames, plan } = plans[name];
  timeline = [];
  runPlan(plan, frames, () => {}, (s, info) => {
    timeline.push({
      s: structuredClone(s), pose: info.pose, facing: info.facing, held: heldAt(plan, info.frame),
      input: info.input, sounds: info.input ? [...s.sounds] : [],
    });
  });
  $('#plan-text').value = JSON.stringify({ frames, plan });
  $('#frame').max = String(timeline.length - 1);
  $('#delete').disabled = !plans[name].own;
  showMarks();
  seek(0);
}

$('#plan').addEventListener('change', () => load($('#plan').value));
$('#plan-run').addEventListener('click', () => {
  try {
    const { frames, plan } = JSON.parse($('#plan-text').value);
    $('#plan-error').textContent = '';
    addPlan('edited', frames, plan);
  } catch (error) {
    $('#plan-error').textContent = `Not a plan: ${error.message}`;
  }
});
$('#delete').addEventListener('click', () => {
  if (!plans[name]?.own) return;
  delete plans[name];
  save();
  const first = Object.keys(plans)[0];
  fillPlans(first);
  load(first);
});

function seek(frame, { sounds = false } = {}) {
  const to = Math.max(0, Math.min(timeline.length - 1, frame));
  if (sounds && $('#sound').checked) {
    for (let f = current + 1; f <= to; f++) timeline[f].sounds.forEach((n) => sound.play(n));
  }
  current = to;
  redraw();
}

function redraw() {
  const entry = timeline[current];
  if (!entry || $('#timeline').hidden) return;
  draw(entry.s, entry.pose, entry.facing);
  $('#frame').value = String(current);
  const tick = Math.floor(current / FRAMES_PER_TICK);
  $('#position').textContent = `frame ${current} · tick ${tick} · ${(current / 60).toFixed(2)} s`;
  showState(entry, timeline[current - 1]);
  drawStrip();
  drawDetail();
  document.querySelectorAll('.mark-item').forEach((item) => item.classList.toggle('here', Number(item.dataset.frame) === current));
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
  if (recording || $('#timeline').hidden || event.target.closest('textarea, select, input')) return;
  const keys = {
    Space: () => (playing ? pause() : play()),
    ArrowLeft: () => seek(current - (event.shiftKey ? FRAMES_PER_TICK : 1)),
    ArrowRight: () => seek(current + (event.shiftKey ? FRAMES_PER_TICK : 1), { sounds: true }),
    Home: () => seek(0),
    End: () => seek(timeline.length - 1),
    KeyM: () => addMark(current),
    BracketLeft: () => jumpMark(-1),
    BracketRight: () => jumpMark(1),
  };
  if (!keys[event.code]) return;
  event.preventDefault();
  if (event.code !== 'Space') pause();
  keys[event.code]();
});
$('#marks').addEventListener('change', redraw);
$('#zoom').addEventListener('change', redraw);

// --- The overview: the whole plan ---

const strip = $('#strip');
const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function fitCanvas(canvas) {
  const width = canvas.clientWidth || 768;
  if (canvas.width !== width) canvas.width = width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawStrip() {
  const ctx = fitCanvas(strip);
  const n = timeline.length;
  const fw = strip.width / Math.max(1, n);
  const x = (f) => f * fw;
  // Presses, at least 2 px wide however short (on top), then sounds, action, mode.
  timeline.forEach((entry, f) => {
    const before = timeline[f - 1]?.held;
    BUTTONS.forEach(([, key, color]) => {
      if (entry.held[key] && !before?.[key]) {
        ctx.fillStyle = color;
        ctx.fillRect(x(f), 0, Math.max(2, fw), 6);
      }
    });
    if (!entry.input) return;
    const p = entry.s.player;
    entry.sounds.forEach((s, k) => {
      ctx.fillStyle = SOUND_COLORS[s] ?? '#fff';
      ctx.fillRect(x(f), 8 + k * 4, Math.max(2, fw * 3), 3);
    });
    if (p.action) {
      ctx.fillStyle = `hsl(${hash(p.action.name) % 360} 60% 55%)`;
      ctx.fillRect(x(f), 18, Math.ceil(fw * 3), 10);
    }
    ctx.fillStyle = MODE_COLORS[p.mode] ?? '#666';
    ctx.fillRect(x(f), 30, Math.ceil(fw * 3), 18);
  });
  // The marks, and the window the detail below shows.
  plans[name].marks.forEach(({ frame }) => flag(ctx, x(frame), 0, strip.height));
  const [from, to] = detailWindow();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.strokeRect(x(from) + 0.5, 0.5, Math.max(2, x(to) - x(from)), strip.height - 1);
  ctx.fillStyle = '#fff';
  ctx.fillRect(Math.round(x(current)) - 1, 0, 2, strip.height);
}

function flag(ctx, x, top, height) {
  ctx.fillStyle = MARK_COLOR;
  ctx.fillRect(Math.round(x), top, 2, height);
  ctx.beginPath();
  ctx.moveTo(x + 2, top);
  ctx.lineTo(x + 9, top + 4);
  ctx.lineTo(x + 2, top + 8);
  ctx.fill();
}

function scrubbing(canvas, frameAt) {
  const go = (event) => {
    pause();
    seek(frameAt(event.clientX - canvas.getBoundingClientRect().left));
  };
  canvas.addEventListener('pointerdown', (event) => {
    go(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.buttons) go(event);
  });
}
scrubbing(strip, (x) => Math.round((x / strip.clientWidth) * (timeline.length - 1)));

// --- The detail: a window of frames around the current one, one column per frame ---

const detail = $('#detail');
const GUTTER = 30;
const ROWS = { buttons: 16, mode: 86, action: 98, sounds: 116, marks: 142, poses: 156 };

function detailWindow() {
  const size = Math.min(Number($('#zoom').value), timeline.length);
  const from = Math.max(0, Math.min(timeline.length - size, current - Math.floor(size / 2)));
  return [from, from + size];
}

function drawDetail() {
  const ctx = fitCanvas(detail);
  const [from, to] = detailWindow();
  const cw = (detail.width - GUTTER) / (to - from);
  const x = (f) => GUTTER + (f - from) * cw;
  ctx.font = '10px ui-monospace, Consolas, monospace';
  // Rows' names.
  ctx.fillStyle = '#8a909c';
  BUTTONS.forEach(([label], i) => ctx.fillText(label, 8, ROWS.buttons + i * 11 + 9));
  [['mode', ROWS.mode + 8], ['act', ROWS.action + 10], ['snd', ROWS.sounds + 9], ['mark', ROWS.marks + 8], ['pose', ROWS.poses + 12]].forEach(([t, y]) => ctx.fillText(t, 0, y));
  // The current frame; the ticks (every 3rd frame) as faint lines; a ruler every 30 frames.
  ctx.fillStyle = 'rgba(255, 211, 77, 0.15)';
  ctx.fillRect(x(current), 0, cw, detail.height);
  const labels = []; // the actions' names, written over their bars once all are drawn
  for (let f = from; f < to; f++) {
    const entry = timeline[f];
    if (entry.input) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(x(f), ROWS.buttons, 1, ROWS.poses - ROWS.buttons);
    }
    if (f % 30 === 0) {
      ctx.fillStyle = '#8a909c';
      ctx.fillText(String(f), x(f) + 2, 10);
      ctx.fillRect(x(f), 12, 1, 4);
    }
    // What is held on the frame; a press of A or B the tick took after it was let go, outlined.
    BUTTONS.forEach(([, key, color], i) => {
      const y = ROWS.buttons + i * 11;
      if (entry.held[key]) {
        ctx.fillStyle = color;
        ctx.fillRect(x(f), y, Math.max(1, cw - 0.5), 9);
      } else if (entry.input?.[key]) {
        ctx.strokeStyle = color;
        ctx.strokeRect(x(f) + 0.5, y + 0.5, Math.max(1, cw - 1.5), 8);
      }
    });
    const p = entry.s.player;
    ctx.fillStyle = MODE_COLORS[p.mode] ?? '#666';
    ctx.fillRect(x(f), ROWS.mode, Math.ceil(cw), 8);
    if (p.action) {
      ctx.fillStyle = `hsl(${hash(p.action.name) % 360} 60% 40%)`;
      ctx.fillRect(x(f), ROWS.action, Math.ceil(cw), 14);
      const before = timeline[f - 1]?.s.player.action;
      if (f === from || !before || before.name !== p.action.name || before.t > p.action.t) labels.push([p.action.name, x(f)]);
    }
    entry.sounds.forEach((s, k) => {
      ctx.fillStyle = SOUND_COLORS[s] ?? '#fff';
      ctx.fillRect(x(f), ROWS.sounds + 1 + k * 12, Math.max(2, cw), 9);
      ctx.fillText(s, x(f) + Math.max(3, cw + 2), ROWS.sounds + 9 + k * 12);
    });
  }
  ctx.fillStyle = '#fff';
  labels.forEach(([text, at]) => ctx.fillText(text, at + 2, ROWS.action + 10));
  plans[name].marks.filter(({ frame }) => frame >= from && frame < to).forEach(({ frame }) => flag(ctx, x(frame), ROWS.marks, 10));
  // The pose on each tick, as drawn then (the current one framed).
  const size = Math.max(12, Math.min(40, cw * FRAMES_PER_TICK - 2));
  const currentTick = Math.floor(current / FRAMES_PER_TICK) * FRAMES_PER_TICK;
  for (let f = from; f < to; f++) {
    const entry = timeline[f];
    if (!entry.input) continue;
    if (f === currentTick) {
      ctx.strokeStyle = '#ffd34d';
      ctx.strokeRect(x(f) + 0.5, ROWS.poses + 0.5, size, size);
    }
    drawPose(ctx, entry.pose, { mirror: entry.facing === 'right', x: x(f), y: ROWS.poses, size });
  }
}

scrubbing(detail, (px) => {
  const [from, to] = detailWindow();
  return from + Math.floor(((px - GUTTER) / (detail.clientWidth - GUTTER)) * (to - from));
});
window.addEventListener('resize', redraw);

$('#legend').innerHTML = [
  ...Object.entries(MODE_COLORS).map(([mode, color]) => `<span><i style="background:${color}"></i>${mode}</span>`),
  ...Object.entries(SOUND_COLORS).map(([s, color]) => `<span><i style="background:${color}"></i>${s}</span>`),
  `<span><i style="background:${MARK_COLOR}"></i>mark</span>`,
  '<span><i class="outlined"></i>A/B outlined: let go before the tick, still taken by it</span>',
].join('');

// --- Marks: moments that look wrong, with a note ---

function addMark(frame) {
  const marks = plans[name].marks;
  if (!marks.some((m) => m.frame === frame)) marks.push({ frame, note: '' });
  marks.sort((a, b) => a.frame - b.frame);
  save();
  fillPlans(name);
  showMarks(frame);
  redraw();
}

function jumpMark(dir) {
  const marks = plans[name].marks;
  const next = dir > 0 ? marks.find((m) => m.frame > current) : [...marks].reverse().find((m) => m.frame < current);
  if (next) seek(next.frame);
}

function showMarks(focus) {
  const marks = plans[name].marks;
  $('#mark-list').replaceChildren(...marks.map((m) => {
    const item = document.createElement('li');
    item.className = 'mark-item';
    item.dataset.frame = String(m.frame);
    const go = Object.assign(document.createElement('button'), { type: 'button', textContent: `⚑ ${m.frame}` });
    go.title = `frame ${m.frame}, tick ${Math.floor(m.frame / FRAMES_PER_TICK)}`;
    go.addEventListener('click', () => {
      pause();
      seek(m.frame);
    });
    const note = Object.assign(document.createElement('input'), { type: 'text', value: m.note, placeholder: 'what looks wrong here' });
    note.addEventListener('input', () => {
      m.note = note.value;
      save();
    });
    const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Remove the mark' });
    remove.addEventListener('click', () => {
      marks.splice(marks.indexOf(m), 1);
      save();
      fillPlans(name);
      showMarks();
      redraw();
    });
    item.append(go, note, remove);
    if (m.frame === focus) queueMicrotask(() => note.focus());
    return item;
  }));
  $('#marks-empty').hidden = marks.length > 0;
}

$('#mark').addEventListener('click', () => addMark(current));
$('#mark-prev').addEventListener('click', () => jumpMark(-1));
$('#mark-next').addEventListener('click', () => jumpMark(1));

// --- Reports: the plan and its marks, to paste into an issue or a chat, or as a test plan ---

function report() {
  const { frames, plan, marks } = plans[name];
  return {
    plan: name, frames, inputs: plan,
    marks: marks.map(({ frame, note }) => {
      const { s, pose } = timeline[frame];
      const { player: p, ball: b } = s;
      return {
        frame, tick: Math.floor(frame / FRAMES_PER_TICK), note, pose: POSE_NAMES[pose],
        player: {
          x: p.x, z: p.z, vx: p.vx, vz: p.vz, facing: p.facing, mode: p.mode,
          action: p.action && `${p.action.name} ${p.action.t}`, hasBall: p.hasBall, onBall: p.onBall, trapping: p.trapping,
        },
        ball: { x: b.x, z: b.z, vx: b.vx, vz: b.vz },
      };
    }),
  };
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    $('#copied').textContent = `${what} copied`;
  } catch {
    $('#plan-text').value = text;
    $('#plan-text').closest('details').open = true;
    $('#copied').textContent = `${what} is in the box under Edit plan (copying was not allowed)`;
  }
  setTimeout(() => ($('#copied').textContent = ''), 5000);
}

$('#copy-report').addEventListener('click', () => copy(JSON.stringify(report(), null, 1), 'Report'));
$('#copy-test').addEventListener('click', () => {
  const { frames, plan, marks } = plans[name];
  const notes = marks.filter((m) => m.note).map((m) => `  // frame ${m.frame}: ${m.note}\n`).join('');
  const key = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const inputs = plan.map(([a, b, keys]) => `[${a}, ${b}, '${keys}']`).join(', ');
  copy(`${notes}  '${key}': [${frames}, [${inputs}]],\n`, 'Plan for tests/plans.mjs');
});

// --- The state: everything the logic keeps, what changed since the last frame marked ---

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
  const { s, pose, facing, held, input, sounds } = entry;
  const prev = prevEntry?.s;
  const { player, ball, ...practice } = s;
  const tags = (list) => list.map((k) => `<span>${k}</span>`).join('') || '—';
  const heldList = BUTTONS.filter(([, key]) => held[key]).map(([label]) => label);
  const tickList = input ? BUTTONS.filter(([, key]) => input[key]).map(([label]) => label) : null;
  $('#state').innerHTML = `
    <h3>This frame</h3>
    <dl>
      <dt>held</dt><dd class="tags">${tags(heldList)}</dd>
      <dt>tick</dt><dd class="tags">${tickList ? tags(tickList) : 'between ticks'}</dd>
      <dt>sounds</dt><dd class="tags">${tags(sounds)}</dd>
      <dt>pose</dt><dd>${pose} ${POSE_NAMES[pose] ?? ''} (${facing})</dd>
      <dt>action</dt><dd>${escape(actionText(player.action))}</dd>
    </dl>
    <h3>Player</h3><dl>${fields(player, prev?.player, ['action'])}</dl>
    <h3>Ball</h3><dl>${fields(ball, prev?.ball)}</dl>
    <h3>Practice</h3><dl>${fields(practice, prev ? (({ player: _p, ball: _b, ...rest }) => rest)(prev) : null, ['sounds'])}</dl>`;
}

// --- Recording from the keyboard; M marks the moment ---

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
  recording = { run: createRun(), held: [], marks: [], down: new Set(), pressed: new Set(), last: performance.now(), carry: 0 };
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
    if (info.input && $('#sound').checked) r.run.s.sounds.forEach((n) => sound.play(n));
    r.carry -= 1;
  }
  if (info) {
    render.clear();
    render.player(r.run.s.player.x, r.run.s.player.z, info.pose, info.facing);
    render.ball(r.run.s.ball.x, r.run.s.ball.z, r.run.s.ball.frame);
    $('#recording').textContent = `● REC ${(r.held.length / 60).toFixed(1)} s${r.marks.length ? ` ⚑${r.marks.length}` : ''}`;
  }
  if (r.held.length >= MAX_RECORD_FRAMES) stopRecording();
  else requestAnimationFrame(recordLoop);
}

function stopRecording() {
  const r = recording;
  recording = null;
  $('#record').textContent = '● Record';
  $('#recording').hidden = true;
  if (r?.held.length) addPlan('recorded', r.held.length, planOf(r.held), r.marks);
}

$('#record').addEventListener('click', () => (recording ? stopRecording() : startRecording()));
window.addEventListener('keydown', (event) => {
  if (!recording) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    stopRecording();
  } else if (event.code === 'KeyM') {
    // Half a second back: what made one press M is a moment gone already.
    if (!event.repeat) recording.marks.push({ frame: Math.max(0, recording.held.length - 30), note: '' });
  } else if (KEYS[event.code]) {
    event.preventDefault();
    recording.down.add(event.code);
    recording.pressed.add(event.code);
  }
});
window.addEventListener('keyup', (event) => recording?.down.delete(event.code));
window.addEventListener('blur', () => recording?.down.clear());

// --- Sounds ---

$('#sfx').append(...Object.keys(SOUND_DATA.sfx).flatMap((n) => {
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: `▶ ${n}` });
  button.addEventListener('click', () => {
    sound.start();
    sound.play(n);
  });
  const note = Object.assign(document.createElement('span'), { textContent: SOUND_NOTES[n] ?? '' });
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

catalog = initCatalog({
  list: $('#catalog-list'),
  detail: $('#catalog-detail'),
  showInTimeline: (planName, frame) => {
    showTab('timeline');
    fillPlans(planName);
    load(planName);
    seek(frame);
  },
});
restore();
fillPlans('juggle');
load('juggle');
catalog.select('action:lift');
