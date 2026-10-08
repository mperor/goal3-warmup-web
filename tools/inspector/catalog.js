// Poses & actions: a list by situation on the left, the chosen one on the right: played large,
// its steps over time with the events it sends to the ball and its hit window, how it is set off,
// and where the plans of tests/plans.mjs go through it.
import { PLAYER_POSES } from '../../js/art/sprites.js';
import { ACTIONS, ANIMATIONS } from '../../js/game/player.js';
import { FRAMES_PER_TICK, runPlan } from '../../tests/harness.mjs';
import { PLANS } from '../../tests/plans.mjs';
import { BOX, drawPose, escape, FRAME_MS, POSE_NAMES } from './shared.js';

// How each action is set off, by situation (read from js/game/player.js and practice.js).
const GROUPS = [
  ['On the ground, with the ball', {
    pass: 'A. With Up or Down it goes into the depth (Up alone aims at a point far off). Without the ball and nothing to volley, A swings the same kick at the air.',
    shot: 'B, towards the goal whichever way he faced. With Up or Down it curves into the depth.',
    lift: 'A+B standing still: straight up, to keep up with A or trap.',
    flick: 'A+B with the way he faces held, walking or running: a skid, then over his head. Also off a ball he rides.',
    feint: 'Running: Up or Down tapped twice. Into the depth and back out with a dash.',
  }],
  ['On the ground, without the ball', {
    keepUp: 'A at a ball in the air above him: met as it drops to the foot, knocked up again.',
    keepUpBehind: 'The same with the ball behind him, off the heel.',
    groundVolley: 'A at a high ball coming in from the side: a chip, or met high a lob.',
    volleyShot: 'B at a ball still high (30 px and up).',
    groundOverhead: 'B at a lower ball, or none: an overhead kick from the ground.',
  }],
  ['In a jump, with the ball', {
    jumpKick: 'A: kicked off forward.',
    volleyOwnBall: 'B towards the goal: tossed up high, volleyed.',
    overheadOwnBall: 'B with no direction: floated up, an overhead kick.',
    bicycleOwnBall: 'B away from the goal: tossed up the way he turned, a bicycle kick.',
  }],
  ['In a jump, without the ball', {
    volley: 'A: a volley, chipping a ball in reach.',
    volleyShotAir: 'B towards the goal: a volley shot, keeping his drift.',
    overhead: 'B with no direction: an overhead kick, meeting the ball while the leg is up.',
    bicycle: 'B away from the goal: a bicycle kick at a ball to either side.',
  }],
];

const PROPERTIES = {
  decel: (v) => `slows down ${v} px/tick each tick`,
  inputFrom: (v) => `A or B pressed from tick ${v} on is kept for when it is over`,
  abFrom: (v) => `A+B from tick ${v} on jumps right after`,
  steerFrom: (v) => `steers in the air from tick ${v} on`,
  speeds: (v) => `speed per tick ${v.join(', ')}, then the run's`,
  strike: (v) => `meets the ball from tick 1 until it hits (${v} reach)`,
};

const STEP_COLORS = ['#3b5f9a', '#5a7fbf'];

// Where the plans go through each action: the first frame of each time it starts, per plan.
let seen = null;
function seenIn() {
  if (seen) return seen;
  seen = {};
  for (const [plan, [frames, inputs]] of Object.entries(PLANS)) {
    let before = null;
    runPlan(inputs, frames, () => {}, (s, { frame }) => {
      const a = s.player.action;
      // Started on this frame: none before, another one, or the same one again from its start.
      if (a && (!before || before.name !== a.name || before.t > a.t)) (seen[a.name] ??= []).push({ plan, frame });
      before = a && { name: a.name, t: a.t };
    });
  }
  return seen;
}

export function initCatalog({ list, detail, showInTimeline }) {
  let preview = null; // { kind, ticks: [poses], t, playing, speed, mirror, timer }
  const buttons = new Map();

  function select(key) {
    buttons.forEach((button, k) => button.setAttribute('aria-current', String(k === key)));
    stopPreview();
    const [kind, name] = key.split(':');
    if (kind === 'action') showAction(name);
    else if (kind === 'animation') showAnimation(name);
    else showPoses();
  }

  // --- The list ---
  const entry = (key, label, note = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `${escape(label)}${note ? ` <small>${escape(note)}</small>` : ''}`;
    button.addEventListener('click', () => select(key));
    buttons.set(key, button);
    return button;
  };
  const heading = (text) => Object.assign(document.createElement('h3'), { textContent: text });
  for (const [group, actions] of GROUPS) {
    list.append(heading(group), ...Object.keys(actions).map((name) => entry(`action:${name}`, name, `${total(ACTIONS[name])} ticks`)));
  }
  list.append(heading('Animations (frames)'), ...Object.keys(ANIMATIONS).map((name) => entry(`animation:${name}`, name)));
  list.append(heading('Poses'), entry('poses:all', `all ${PLAYER_POSES.length} poses`));

  // --- An action ---
  function showAction(name) {
    const def = ACTIONS[name];
    const [group, how] = GROUPS.map(([g, actions]) => [g, actions[name]]).find(([, h]) => h) ?? ['', ''];
    const ticks = [];
    def.steps.forEach(([pose, n], step) => { for (let i = 0; i < n; i++) ticks.push({ pose, step }); });
    const props = Object.entries(PROPERTIES).filter(([k]) => def[k] !== undefined).map(([k, text]) => `<li><code>${k}</code> ${escape(text(def[k]))}</li>`);
    if (def.hits) props.push(`<li><code>hits</code> '${def.hits.event}' on ticks ${def.hits.from}–${def.hits.to}${def.hits.skip ? ` but ${def.hits.skip.join(', ')}` : ''}, until the ball is hit</li>`);
    const events = Object.entries(def.events).map(([t, e]) => `<li>tick ${t}: <code>${e}</code></li>`);
    const where = (seenIn()[name] ?? []).map(({ plan, frame }) => `<button type="button" data-plan="${escape(plan)}" data-frame="${frame}">${escape(plan)} @ ${frame}</button>`);
    detail.innerHTML = `
      <h2>${escape(name)} <small>${escape(group)}</small></h2>
      <p class="how">${escape(how)}</p>
      ${previewMarkup('ticks')}
      <canvas class="gantt" height="96"></canvas>
      <p class="hint">One column per tick (3 frames). Bars: the poses in turn; pins: what it tells the ball; shaded: where it can hit. Click a tick to see it.</p>
      <div class="facts">
        <div><h4>Sends to the ball</h4><ul>${events.join('') || '<li>nothing at set ticks</li>'}</ul></div>
        <div><h4>Settings</h4><ul>${props.join('') || '<li>none</li>'}</ul></div>
        <div><h4>In the plans</h4><p class="links">${where.join('') || 'none of tests/plans.mjs'}</p></div>
      </div>`;
    detail.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => showInTimeline(b.dataset.plan, Number(b.dataset.frame))));
    const gantt = detail.querySelector('.gantt');
    const drawGantt = (current) => {
      const ctx = setupCanvas(gantt);
      const w = gantt.clientWidth;
      const cw = Math.min(44, (w - 2) / ticks.length);
      ticks.forEach(({ pose, step }, t) => {
        const hit = def.hits && t >= def.hits.from && t <= def.hits.to && !def.hits.skip?.includes(t);
        if (hit || (def.strike && t > 0)) {
          ctx.fillStyle = 'rgba(255, 211, 77, 0.18)';
          ctx.fillRect(t * cw, 0, cw, 96);
        }
        ctx.fillStyle = STEP_COLORS[step % 2];
        ctx.fillRect(t * cw + 1, 18, cw - 2, 26);
        ctx.fillStyle = '#8a909c';
        ctx.font = '10px ui-monospace, Consolas, monospace';
        ctx.fillText(String(t), t * cw + 3, 12);
        if (t === current) {
          ctx.strokeStyle = '#ffd34d';
          ctx.lineWidth = 2;
          ctx.strokeRect(t * cw + 1, 1, cw - 2, 94);
        }
      });
      // Pose names once per step, where they fit.
      let start = 0;
      def.steps.forEach(([pose, n]) => {
        ctx.fillStyle = '#fff';
        ctx.font = '11px ui-monospace, Consolas, monospace';
        const label = n * cw > 60 ? `${POSE_NAMES[pose]} ×${n}` : POSE_NAMES[pose].slice(0, Math.max(1, Math.floor((n * cw) / 7)));
        ctx.fillText(label, start * cw + 4, 35);
        start += n;
      });
      Object.entries(def.events).forEach(([t, e], k) => pin(ctx, Number(t) * cw + cw / 2, 50 + (k % 2) * 20, e));
      if (def.hits) pin(ctx, def.hits.from * cw + cw / 2, 50, def.hits.event);
      if (def.strike) pin(ctx, cw * 1.5, 50, 'strike');
    };
    startPreview({ poses: ticks.map((t) => t.pose), frames: FRAMES_PER_TICK, draw: drawGantt, unit: 'tick' });
    gantt.addEventListener('pointerdown', (event) => {
      const cw = Math.min(44, (gantt.clientWidth - 2) / ticks.length);
      seekPreview(Math.floor((event.offsetX) / cw));
    });
  }

  // --- An animation (by frames) ---
  function showAnimation(name) {
    const { poses, frames } = ANIMATIONS[name];
    detail.innerHTML = `
      <h2>${escape(name)} <small>animation, ${frames} frames per pose</small></h2>
      <p class="how">${escape(ANIMATION_NOTES[name] ?? '')}</p>
      ${previewMarkup('frames')}
      <canvas class="gantt" height="60"></canvas>
      <p class="hint">${poses.length} poses × ${frames} frames, then again.</p>`;
    const gantt = detail.querySelector('.gantt');
    const each = poses.flatMap((pose) => Array(frames).fill(pose));
    const drawGantt = (current) => {
      const ctx = setupCanvas(gantt);
      const cw = Math.min(20, (gantt.clientWidth - 2) / each.length);
      poses.forEach((pose, i) => {
        ctx.fillStyle = STEP_COLORS[i % 2];
        ctx.fillRect(i * frames * cw + 1, 18, frames * cw - 2, 26);
        ctx.fillStyle = '#fff';
        ctx.font = '11px ui-monospace, Consolas, monospace';
        ctx.fillText(POSE_NAMES[pose], i * frames * cw + 4, 35);
      });
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2;
      ctx.strokeRect(current * cw + 1, 14, cw - 2, 34);
    };
    startPreview({ poses: each, frames: 1, draw: drawGantt, unit: 'frame' });
  }

  // --- All poses: a sheet; each with the actions and animations that use it ---
  function showPoses() {
    const users = PLAYER_POSES.map((_, i) => [
      ...Object.entries(ACTIONS).filter(([, d]) => d.steps.some(([p]) => p === i)).map(([n]) => n),
      ...Object.entries(ANIMATIONS).filter(([, d]) => d.poses.includes(i)).map(([n]) => `${n} (animation)`),
      ...(MODE_POSES[POSE_NAMES[i]] ? [MODE_POSES[POSE_NAMES[i]]] : []),
    ]);
    detail.innerHTML = `<h2>Poses <small>as the original's sprites, both ways</small></h2>
      <div class="sheet">${PLAYER_POSES.map((_, i) => `
        <figure><canvas width="${BOX * 2}" height="${BOX}" data-pose="${i}"></canvas>
        <figcaption><b>${i} ${POSE_NAMES[i] ?? ''}</b><br>${users[i].map(escape).join(', ') || 'only between moves'}</figcaption></figure>`).join('')}
      </div>`;
    detail.querySelectorAll('[data-pose]').forEach((canvas) => {
      const ctx = canvas.getContext('2d');
      drawPose(ctx, Number(canvas.dataset.pose), { mirror: false });
      drawPose(ctx, Number(canvas.dataset.pose), { mirror: true, x: BOX });
    });
  }

  // --- The large preview, played or stepped ---
  function previewMarkup(unit) {
    return `<div class="player-preview">
      <canvas class="big" width="${BOX}" height="${BOX}"></canvas>
      <div class="controls">
        <button type="button" data-p="play">⏸</button>
        <button type="button" data-p="-1" title="${unit} back">◀</button>
        <button type="button" data-p="1" title="${unit} on">▶</button>
        <label>Speed <select data-p="speed"><option value="1">1×</option><option value="0.5">½×</option><option value="0.25" selected>¼×</option></select></label>
        <label><input type="checkbox" data-p="left"> facing left</label>
        <span class="position"></span>
      </div></div>`;
  }

  function startPreview({ poses, frames, draw, unit }) {
    const big = detail.querySelector('.big');
    const ctx = big.getContext('2d');
    const mine = { poses, frames, draw, unit, i: 0, playing: true, last: performance.now(), carry: 0 };
    preview = mine;
    const show = () => {
      ctx.clearRect(0, 0, BOX, BOX);
      drawPose(ctx, poses[preview.i], { mirror: !detail.querySelector('[data-p="left"]').checked });
      draw(preview.i);
      detail.querySelector('.position').textContent = `${unit} ${preview.i} of ${poses.length}: ${POSE_NAMES[poses[preview.i]]}`;
    };
    preview.show = show;
    const control = (key) => detail.querySelector(`[data-p="${key}"]`);
    control('play').addEventListener('click', () => {
      preview.playing = !preview.playing;
      control('play').textContent = preview.playing ? '⏸' : '▶';
      preview.last = performance.now();
      if (preview.playing) requestAnimationFrame(loop);
    });
    control('-1').addEventListener('click', () => seekPreview(preview.i - 1));
    control('1').addEventListener('click', () => seekPreview(preview.i + 1));
    control('left').addEventListener('change', show);
    // One loop per preview: a newer one (another action chosen) stops this.
    const loop = (now) => {
      if (preview !== mine || !mine.playing || detail.closest('[hidden]')) return;
      preview.carry += ((now - preview.last) / FRAME_MS) * Number(control('speed').value);
      preview.last = now;
      const steps = Math.floor(preview.carry / frames);
      if (steps) {
        preview.carry -= steps * frames;
        preview.i = (preview.i + steps) % poses.length;
        show();
      }
      requestAnimationFrame(loop);
    };
    show();
    requestAnimationFrame(loop);
  }

  function seekPreview(i) {
    if (!preview) return;
    preview.playing = false;
    detail.querySelector('[data-p="play"]').textContent = '▶';
    preview.i = (i + preview.poses.length) % preview.poses.length;
    preview.show();
  }

  function stopPreview() {
    if (preview) preview.playing = false;
    preview = null;
  }

  return {
    select,
    // Resumes the preview when the tab is shown again.
    shown: () => {
      if (!preview) return;
      preview.show();
      if (preview.playing) {
        preview.playing = false;
        detail.querySelector('[data-p="play"]').click();
      }
    },
  };
}

// Poses the player takes by his mode rather than in an action (currentAnimation in player.js).
const MODE_POSES = {
  air: 'in a jump',
  land: 'landing',
  sprint1: 'a boost, every other tick',
  sprint2: 'a boost, every other tick',
  dive: 'a dive on its way up',
  slide: 'a dive coming down and sliding',
  crawl: 'bracing to push along after a dive',
  lift: 'trapping or juggling it low (foot)',
  windUp: 'trapping or juggling it high (thigh)',
};

const ANIMATION_NOTES = {
  stand: 'Standing still.',
  walk: 'Walking: a step, standing, the other step.',
  tread: 'Treading on the spot with Up or Down, after an action or a run: the walk from half a step on.',
  ride: 'Running on the ball: the walking steps at twice the speed.',
  run: 'Running.',
  skid: 'A skid, held.',
};

const total = (def) => def.steps.reduce((n, [, ticks]) => n + ticks, 0);

function setupCanvas(canvas) {
  const width = canvas.clientWidth;
  if (canvas.width !== width) canvas.width = width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function pin(ctx, x, y, text) {
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x - 4, y);
  ctx.lineTo(x + 4, y);
  ctx.fill();
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillText(text, x + 6, y + 4);
}
