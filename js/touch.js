// The controls on a touch screen: a d-pad (the thumb slides round it, diagonals too), B, A, A+B
// and START. A finger that starts on the d-pad steers it until lifted, even off it; one that starts
// on the buttons presses whichever it is over, so it can slide from B onto A.
const DPAD_DEAD = 0.35; // of the d-pad's half width: around the middle nothing is pressed

export function setupTouch(root, { input, onStart }) {
  const dpad = root.querySelector('[data-dpad]');
  const buttons = [...root.querySelectorAll('[data-button]')];
  const pointers = new Map(); // pointer id -> { onDpad, pressed: Set of buttons }

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

// Full screen where the browser allows it (not on iPhones), turning a phone sideways if it can.
export function setupFullscreen(toggles) {
  const el = document.documentElement;
  if (!document.fullscreenEnabled) {
    toggles.forEach((toggle) => ((toggle.closest('li') ?? toggle).hidden = true));
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
