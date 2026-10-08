const KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyX: 'a',
  KeyZ: 'b',
  Space: 'ab',
};

// Gamepads in the standard mapping, laid out like the NES pad: A on the right face button, B below.
const PAD_BUTTONS = { 1: 'a', 3: 'a', 0: 'b', 2: 'b', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const PAD_START = 9;
const STICK = 0.5;

// The buttons held on the keyboard, the touch screen and gamepads, read like one NES pad.
// onStart: the START button of a gamepad was pressed.
export function createInput({ target = window, onStart = () => {} } = {}) {
  const sources = { keys: {}, touch: {}, pad: {} };
  // Like the NES pad, read every frame: a tap shorter than a logic tick still reaches the next one.
  const tapped = { a: false, b: false, ab: false };
  let padStart = false;

  const held = (button) => Object.values(sources).some((source) => source[button]);

  function set(source, button, value) {
    if (value && !held(button) && button in tapped) tapped[button] = true;
    sources[source][button] = value;
  }

  function key(event, value) {
    const button = KEYS[event.code];
    if (!button) return;
    // While the window (Esc) is open the keys are its own: Space presses its buttons, the arrows
    // scroll it. A key let go there still counts, or it would stay held.
    if (event.target.closest?.('dialog[open]')) {
      if (!value) set('keys', button, false);
      return;
    }
    event.preventDefault();
    set('keys', button, value);
  }

  function take(button) {
    const down = held(button) || tapped[button];
    tapped[button] = false;
    return down;
  }

  target.addEventListener('keydown', (e) => key(e, true));
  target.addEventListener('keyup', (e) => key(e, false));
  target.addEventListener('blur', () => Object.values(sources).forEach((source) => {
    for (const button of Object.keys(source)) source[button] = false;
  }));

  return {
    // For the touch controls: which buttons they hold now.
    setTouch(buttons) {
      for (const button of ['left', 'right', 'up', 'down', 'a', 'b', 'ab']) set('touch', button, buttons.has(button));
    },
    // Reads the gamepads; called every frame.
    poll() {
      const now = { left: false, right: false, up: false, down: false, a: false, b: false };
      let start = false;
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad || pad.mapping !== 'standard') continue;
        for (const [index, button] of Object.entries(PAD_BUTTONS)) if (pad.buttons[index]?.pressed) now[button] = true;
        const [x = 0, y = 0] = pad.axes;
        if (x < -STICK) now.left = true;
        if (x > STICK) now.right = true;
        if (y < -STICK) now.up = true;
        if (y > STICK) now.down = true;
        start ||= pad.buttons[PAD_START]?.pressed;
      }
      for (const [button, value] of Object.entries(now)) set('pad', button, value);
      if (start && !padStart) onStart();
      padStart = start;
    },
    snapshot: () => {
      const ab = take('ab');
      return { left: held('left'), right: held('right'), up: held('up'), down: held('down'), a: take('a') || ab, b: take('b') || ab };
    },
  };
}
