import { PRESS_START } from './art/press-start.js';
import { TITLE_LOGO } from './art/title-logo.js';
import { startGame } from './game/game.js';
import { renderPixelArt } from './pixel-art.js';
import { renderPixelText } from './pixel-font.js';

const ART = { 'title-logo': TITLE_LOGO, 'press-start': PRESS_START };

document.querySelectorAll('[data-pixel-art]').forEach((el) => renderPixelArt(el, ART[el.dataset.pixelArt]));
document.querySelectorAll('[data-pixel-text]').forEach(renderPixelText);
startGame(document.getElementById('game'));
