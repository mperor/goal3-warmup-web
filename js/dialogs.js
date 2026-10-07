// The start window (its key press or click is the gesture that lets the sound start) and the
// tribute window (Enter or a click on the scene: where the game and its makers live on).
// While either is open the game holds still and the sound is paused.
export function setupDialogs({ start, tribute, sound }) {
  let started = false;
  let enterDown = false; // pressed outside the tribute window

  const isOpen = () => !started || tribute.open;

  function begin(event) {
    if (started) return;
    // The key or click that starts must not also reach the game.
    event.preventDefault();
    event.stopImmediatePropagation();
    started = true;
    start.close();
    sound.start();
  }

  function openTribute() {
    if (!started || tribute.open) return;
    sound.pause();
    tribute.showModal();
  }

  start.showModal();
  start.addEventListener('cancel', (event) => event.preventDefault()); // Esc must not skip it unstarted
  // Capture on window runs before the game's own key handlers.
  window.addEventListener('keydown', (event) => {
    if (!started) {
      if (!event.repeat && !['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) begin(event);
      return;
    }
    if (event.code === 'Enter' && !tribute.open) {
      event.preventDefault();
      enterDown = true;
    }
  }, true);
  // The tribute opens on release, so the same press cannot also follow a link in it.
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Enter') return;
    if (enterDown && !tribute.open) openTribute();
    enterDown = false;
  }, true);
  start.addEventListener('click', begin);

  // A click on the scene opens the tribute; the sound toggle and the windows have their own.
  document.querySelector('.scene').addEventListener('click', openTribute);
  // A click on the backdrop (outside the box) closes it.
  tribute.addEventListener('click', (event) => {
    if (event.target === tribute) tribute.close();
  });
  tribute.addEventListener('close', () => sound.start());

  return { paused: isOpen };
}
