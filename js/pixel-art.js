const SVG_NS = 'http://www.w3.org/2000/svg';

export function rowsToPath(rows, key, offsetX = 0) {
  const run = new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`, 'g');
  let d = '';
  rows.forEach((row, y) => {
    for (const m of row.matchAll(run)) {
      d += `M${offsetX + m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
    }
  });
  return d;
}

// Replaces el's content with a crisp SVG; the original text stays for screen readers.
export function replaceWithPixels(el, width, height, layers) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pixel-text');
  svg.style.setProperty('--w', width);
  svg.style.setProperty('--h', height);

  for (const { fill, d } of layers) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    svg.append(path);
  }

  const label = document.createElement('span');
  label.className = 'visually-hidden';
  label.textContent = el.textContent.trim().replace(/\s+/g, ' ');

  el.replaceChildren(label, svg);
}

export function renderPixelArt(el, art) {
  const layers = Object.entries(art.palette).map(([key, fill]) => ({ fill, d: rowsToPath(art.rows, key) }));
  replaceWithPixels(el, art.rows[0].length, art.rows.length, layers);
}
