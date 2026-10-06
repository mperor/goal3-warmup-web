const KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyX: 'a',
  KeyZ: 'b',
  Space: 'ab',
};

export function createInput(target = window) {
  const held = { left: false, right: false, up: false, down: false, a: false, b: false, ab: false };
  // Like the NES pad, read every frame: a tap shorter than a logic tick still reaches the next one.
  const tapped = { a: false, b: false, ab: false };

  function set(event, value) {
    const button = KEYS[event.code];
    if (!button) return;
    event.preventDefault();
    held[button] = value;
    if (value && button in tapped) tapped[button] = true;
  }

  function take(button) {
    const down = held[button] || tapped[button];
    tapped[button] = false;
    return down;
  }

  target.addEventListener('keydown', (e) => set(e, true));
  target.addEventListener('keyup', (e) => set(e, false));
  target.addEventListener('blur', () => Object.keys(held).forEach((k) => (held[k] = false)));

  return {
    snapshot: () => {
      const ab = take('ab');
      return { left: held.left, right: held.right, up: held.up, down: held.down, a: take('a') || ab, b: take('b') || ab };
    },
  };
}
