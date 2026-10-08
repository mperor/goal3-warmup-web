import { PRESS_START } from './art/press-start.js';
import { TITLE_LOGO } from './art/title-logo.js';
import { createSound } from './audio/sound.js';
import { startGame } from './game/game.js';
import { createInput } from './game/input.js';
import { setupMenu } from './menu.js';
import { renderPixelArt } from './pixel-art.js';
import { renderPixelText } from './pixel-font.js';
import { setupFullscreen, setupTouch } from './touch.js';

const ART = { 'title-logo': TITLE_LOGO, 'press-start': PRESS_START };

document.querySelectorAll('[data-pixel-art]').forEach((el) => renderPixelArt(el, ART[el.dataset.pixelArt]));
document.querySelectorAll('[data-pixel-text]').forEach(renderPixelText);

// Sound starts once the window is closed (browsers need a user gesture for it); M or the switch
// in the window mutes it.
const sound = createSound();
const toggle = document.getElementById('sound-toggle');
const showMuted = (muted) => {
  toggle.querySelector('.window__value').textContent = muted ? 'OFF' : 'ON';
  toggle.setAttribute('aria-pressed', String(muted));
};
showMuted(sound.muted);
sound.onMutedChange(showMuted);
toggle.addEventListener('click', () => sound.setMuted(!sound.muted));
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && !event.repeat) sound.setMuted(!sound.muted);
});

const menu = setupMenu({
  menu: document.getElementById('menu'),
  close: document.getElementById('menu-close'),
  sound,
});
const input = createInput({ onStart: menu.toggle });
setupTouch(document.querySelector('.touch-pad'), { input, onStart: menu.open });
setupFullscreen([...document.querySelectorAll('[data-fullscreen]')]);
startGame(document.getElementById('game'), { input, sound, paused: menu.paused });
