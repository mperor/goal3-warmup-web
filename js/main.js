import { PRESS_START } from './art/press-start.js';
import { TITLE_LOGO } from './art/title-logo.js';
import { createSound } from './audio/sound.js';
import { startGame } from './game/game.js';
import { createInput } from './game/input.js';
import { setupMenu } from './menu.js';
import { renderPixelArt } from './pixel-art.js';
import { renderPixelText } from './pixel-font.js';
import { snapScale } from './scale.js';
import { setupFullscreen, setupTouch, setupVibration } from './touch.js';

const ART = { 'title-logo': TITLE_LOGO, 'press-start': PRESS_START };

snapScale();

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
const vibrate = setupVibration(document.getElementById('vibration-toggle'));
setupTouch(document.querySelector('.touch-pad'), { input, onStart: menu.open, vibrate });
setupFullscreen([...document.querySelectorAll('[data-fullscreen]')], document.querySelector('[data-home-screen]'));
startGame(document.getElementById('game'), { input, sound, paused: menu.paused });

// Drawn: the scene comes in (css/style.css), unless the time index.html gives it ran out first.
// Only once: later the window opens at once, as the game's menus do.
if (document.documentElement.classList.replace('booting', 'booted')) {
  setTimeout(() => document.documentElement.classList.remove('booted'), 500);
}
