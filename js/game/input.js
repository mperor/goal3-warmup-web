const KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyX: 'a',
  KeyZ: 'b',
  Space: 'ab',
};

export function createInput(target = window) {
  const held = { left: false, right: false, a: false, b: false, ab: false };

  function set(event, value) {
    const button = KEYS[event.code];
    if (!button) return;
    event.preventDefault();
    held[button] = value;
  }

  target.addEventListener('keydown', (e) => set(e, true));
  target.addEventListener('keyup', (e) => set(e, false));
  target.addEventListener('blur', () => Object.keys(held).forEach((k) => (held[k] = false)));

  return {
    snapshot: () => ({ left: held.left, right: held.right, a: held.a || held.ab, b: held.b || held.ab }),
  };
}
