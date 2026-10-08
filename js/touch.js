// The controls on a touch screen: a d-pad (the thumb slides round it, diagonals too), B, A, A+B
// and START. A finger that starts on the d-pad steers it until lifted, even off it; one that starts
// on the buttons presses whichever it is over, so it can slide from B onto A.
const DPAD_DEAD = 0.35; // of the d-pad's half width: around the middle nothing is pressed
// Long enough for the motors of most Android phones to start (12 ms was not felt on some).
const BUZZ_MS = 35;
const CONFIRM_MS = 80; // when the switch is turned on
const BUZZ_BUTTONS = ['a', 'b', 'ab'];
const VIBRATION_KEY = 'goal3-warmup:vibration';

// vibrate(): whether pressing A, B or A+B gives a short buzz.
export function setupTouch(root, { input, onStart, vibrate = () => false }) {
  const dpad = root.querySelector('[data-dpad]');
  const buttons = [...root.querySelectorAll('[data-button]')];
  const pointers = new Map(); // pointer id -> { onDpad, pressed: Set of buttons }
  let last = new Set();

  function dpadButtons(x, y) {
    const box = dpad.getBoundingClientRect();
    const nx = (x - box.left - box.width / 2) / (box.width / 2);
    const ny = (y - box.top - box.height / 2) / (box.height / 2);
    const pressed = new Set();
    if (nx < -DPAD_DEAD) pressed.add('left');
    if (nx > DPAD_DEAD) pressed.add('right');
    if (ny < -DPAD_DEAD) pressed.add('up');
    if (ny > DPAD_DEAD) pressed.add('down');
    return pressed;
  }

  function buttonAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('[data-button]');
    return new Set(el && root.contains(el) ? [el.dataset.button] : []);
  }

  function update() {
    const held = new Set();
    for (const { pressed } of pointers.values()) pressed.forEach((button) => held.add(button));
    input.setTouch(held);
    if (vibrate() && BUZZ_BUTTONS.some((b) => held.has(b) && !last.has(b))) buzz(BUZZ_MS);
    last = held;
    buttons.forEach((el) => el.classList.toggle('is-pressed', held.has(el.dataset.button)));
    dpad.dataset.pressed = [...held].filter((b) => ['left', 'right', 'up', 'down'].includes(b)).join(' ');
  }

  function move(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.pressed = pointer.onDpad ? dpadButtons(event.clientX, event.clientY) : buttonAt(event.clientX, event.clientY);
    update();
  }

  function end(event) {
    if (pointers.delete(event.pointerId)) update();
  }

  root.addEventListener('pointerdown', (event) => {
    const onDpad = dpad.contains(event.target);
    if (!onDpad && !event.target.closest('[data-button]')) return;
    event.preventDefault();
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // Not a live pointer (a synthetic event): it is followed without capture.
    }
    pointers.set(event.pointerId, { onDpad, pressed: new Set() });
    move(event);
  });
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  root.querySelector('[data-start]').addEventListener('click', onStart);

  // A touch anywhere shows the controls, also where the browser does not report a touch screen.
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') document.documentElement.classList.add('touch-ui');
  }, { capture: true, passive: true });
}

// The browser refuses (returns false) before the first tap on the page, or where the phone has
// vibration turned off; said once in the console.
let refusedSaid = false;
function buzz(ms) {
  if (navigator.vibrate(ms) || refusedSaid) return;
  refusedSaid = true;
  console.warn('The browser did not vibrate (no tap on the page yet, or vibration off on the phone).');
}

// The vibration switch in the window, where the device can vibrate (not iPhones) and has a touch
// screen; on by default, remembered. Returns whether it is on.
export function setupVibration(toggle) {
  const item = toggle.closest('li') ?? toggle;
  let on = true;
  try {
    on = localStorage.getItem(VIBRATION_KEY) !== '0';
  } catch {
    // Not remembered then.
  }
  const show = () => {
    toggle.querySelector('.window__value').textContent = on ? 'ON' : 'OFF';
    toggle.setAttribute('aria-pressed', String(on));
  };
  const touch = matchMedia('(pointer: coarse)');
  const available = () => 'vibrate' in navigator && (touch.matches || document.documentElement.classList.contains('touch-ui'));
  const showItem = () => (item.hidden = !available());

  show();
  showItem();
  touch.addEventListener('change', showItem);
  window.addEventListener('pointerdown', showItem, { passive: true });
  toggle.addEventListener('click', () => {
    on = !on;
    try {
      localStorage.setItem(VIBRATION_KEY, on ? '1' : '0');
    } catch {
      // Not remembered then.
    }
    show();
    // Turned on, it buzzes once: whether the phone vibrates at all shows at once.
    if (on) buzz(CONFIRM_MS);
  });
  return () => on && available();
}

// Full screen where the browser allows it (not on iPhones), turning a phone sideways if it can.
// Where it does not, a hint says the page added to the home screen opens without the browser's bars
// (manifest.webmanifest), unless it already runs that way.
export function setupFullscreen(toggles, homeScreenHint) {
  const el = document.documentElement;
  if (!document.fullscreenEnabled) {
    toggles.forEach((toggle) => ((toggle.closest('li') ?? toggle).hidden = true));
    const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
    if (homeScreenHint) homeScreenHint.hidden = Boolean(installed);
    return;
  }

  async function enter() {
    await el.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape')?.catch(() => {});
  }

  const show = () => toggles.forEach((toggle) => {
    const value = toggle.querySelector('.window__value');
    if (value) value.textContent = document.fullscreenElement ? 'ON' : 'OFF';
    toggle.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  });
  show();
  document.addEventListener('fullscreenchange', show);
  toggles.forEach((toggle) => toggle.addEventListener('click', () => {
    (document.fullscreenElement ? document.exitFullscreen() : enter()).catch(() => {});
  }));
}
