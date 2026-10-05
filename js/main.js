import { TITLE_LOGO } from './art/title-logo.js';
import { renderPixelArt } from './pixel-art.js';
import { renderPixelText } from './pixel-font.js';

const ART = { 'title-logo': TITLE_LOGO };

document.querySelectorAll('[data-pixel-art]').forEach((el) => renderPixelArt(el, ART[el.dataset.pixelArt]));
document.querySelectorAll('[data-pixel-text]').forEach(renderPixelText);
