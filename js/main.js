import { PRESS_START } from './art/press-start.js';
import { TITLE_LOGO } from './art/title-logo.js';
import { createSound } from './audio/sound.js';
import { startGame } from './game/game.js';
import { renderPixelArt } from './pixel-art.js';
import { renderPixelText } from './pixel-font.js';

const ART = { 'title-logo': TITLE_LOGO, 'press-start': PRESS_START };

document.querySelectorAll('[data-pixel-art]').forEach((el) => renderPixelArt(el, ART[el.dataset.pixelArt]));
document.querySelectorAll('[data-pixel-text]').forEach(renderPixelText);

// Sound may only start after a user gesture; M or the button mutes it.
const sound = createSound();
const toggle = document.getElementById('sound-toggle');
const showMuted = (muted) => {
  toggle.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  toggle.setAttribute('aria-pressed', String(muted));
};
showMuted(sound.muted);
sound.onMutedChange(showMuted);
toggle.addEventListener('click', () => {
  sound.start();
  sound.setMuted(!sound.muted);
  toggle.blur(); // Space is a game key: keep it from pressing the button again
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && !event.repeat) sound.setMuted(!sound.muted);
  sound.start();
});
window.addEventListener('pointerdown', () => sound.start());

startGame(document.getElementById('game'), sound);
