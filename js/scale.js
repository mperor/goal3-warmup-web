// Snaps the NES pixel (--px) to whole screen pixels, so every pixel of the art comes out the same
// size. Where that would shrink the scene by more than a quarter (a small window on a screen without
// high density) the exact fit stays, a little uneven.
const MAX_SHRINK = 0.75;

export function snapScale() {
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.className = 'px-probe';
  probe.setAttribute('aria-hidden', 'true');
  document.body.append(probe);

  function update() {
    const fit = probe.getBoundingClientRect().width;
    const ratio = window.devicePixelRatio || 1;
    const snapped = Math.floor(fit * ratio) / ratio;
    if (snapped > 0 && snapped >= fit * MAX_SHRINK) root.style.setProperty('--px-snap', `${snapped}px`);
    else root.style.removeProperty('--px-snap');
  }

  update();
  new ResizeObserver(update).observe(probe);
  window.addEventListener('resize', update);
}
