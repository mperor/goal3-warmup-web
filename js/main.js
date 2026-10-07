import { PRESS_START } from './art/press-start.js';
import { TITLE_LOGO } from './art/title-logo.js';
import { createSound } from './audio/sound.js';
import { setupDialogs } from './dialogs.js';
import { startGame } from './game/game.js';
import { renderPixelArt } from './pixel-art.js';
import { renderPixelText } from './pixel-font.js';

const ART = { 'title-logo': TITLE_LOGO, 'press-start': PRESS_START };

document.querySelectorAll('[data-pixel-art]').forEach((el) => renderPixelArt(el, ART[el.dataset.pixelArt]));
document.querySelectorAll('[data-pixel-text]').forEach(renderPixelText);

// Sound starts with the start window (browsers need a user gesture for it); M or the button mutes it.
const sound = createSound();
const toggle = document.getElementById('sound-toggle');
const showMuted = (muted) => {
  toggle.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  toggle.setAttribute('aria-pressed', String(muted));
};
showMuted(sound.muted);
sound.onMutedChange(showMuted);
toggle.addEventListener('click', () => {
  sound.setMuted(!sound.muted);
  toggle.blur(); // Space is a game key: keep it from pressing the button again
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && !event.repeat) sound.setMuted(!sound.muted);
});

const { paused } = setupDialogs({
  start: document.getElementById('start-dialog'),
  tribute: document.getElementById('tribute-dialog'),
  sound,
});
startGame(document.getElementById('game'), { sound, paused });
