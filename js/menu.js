// One window around the game: how to play, the options and where the game and its makers live
// on. It is open first (closing it lets the sound start) and again with Esc, a click on the scene,
// the START button on the screen or a gamepad's START. While it is open the game holds still and
// the sound is paused.
export function setupMenu({ menu, close, sound }) {
  let started = false;

  function open() {
    if (menu.open) return;
    sound.pause();
    menu.showModal();
  }

  // Capture on window runs before the game's own key handlers.
  window.addEventListener('keydown', (event) => {
    if (menu.open) return;
    if (event.code === 'Escape') {
      // Kept from the default action, which would close the window again at once.
      event.preventDefault();
      if (!event.repeat) open();
      return;
    }
    // Esc does not count as a gesture that lets sound start, so the next key does it.
    sound.start();
  }, true);

  // A click on the scene opens it; a click on the backdrop (outside the box) closes it.
  document.querySelector('.scene').addEventListener('click', open);
  menu.addEventListener('click', (event) => {
    if (event.target === menu) menu.close();
  });
  menu.addEventListener('close', () => {
    if (!started) {
      started = true;
      close.textContent = 'BACK (ESC)';
      close.classList.remove('window__button--blink');
    }
    sound.start();
  });

  // In a hidden tab the game stops (no animation frames), so the sound stops with it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sound.pause();
    else if (!menu.open) sound.resume();
  });

  // The keys go by their place on the keyboard (Z is Y on a German one): show what they say there.
  navigator.keyboard?.getLayoutMap?.().then((layout) => {
    menu.querySelectorAll('[data-key]').forEach((el) => {
      const label = layout.get(el.dataset.key);
      if (label) el.textContent = label.toUpperCase();
    });
  }).catch(() => {});

  menu.showModal();
  return {
    paused: () => menu.open,
    open,
    toggle: () => (menu.open ? menu.close() : open()),
  };
}
