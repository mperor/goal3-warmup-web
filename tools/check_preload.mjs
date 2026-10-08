// Keeps the <link rel="modulepreload"> list in index.html in step with the modules js/main.js
// imports (directly or not), so the browser fetches them all at once instead of finding them one
// import at a time. Checks by default (the Pages workflow runs it); --write rewrites the list.
// Run: node tools/check_preload.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'index.html');
const ENTRY = 'js/main.js';
const START = '  <!-- Every module js/main.js imports, fetched at once (tools/check_preload.mjs) -->\n';
const END = '  <!-- end of modulepreload -->\n';

// The modules reachable from the entry, by their static imports; paths relative to the root.
function graph(entry) {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const source = readFileSync(join(ROOT, path), 'utf8');
    for (const [, spec] of source.matchAll(/^\s*(?:import|export)\s[^'"]*?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      visit(relative(ROOT, join(ROOT, dirname(path), spec)).replaceAll('\\', '/'));
    }
  };
  visit(entry);
  return [...seen].sort();
}

const modules = graph(ENTRY);
const block = START + modules.map((m) => `  <link rel="modulepreload" href="${m}">\n`).join('') + END;
const html = readFileSync(HTML, 'utf8').replaceAll('\r\n', '\n');
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from < 0 || to < 0) throw new Error('index.html: the modulepreload block is missing');
const current = html.slice(from, to + END.length);

if (process.argv.includes('--write')) {
  writeFileSync(HTML, html.slice(0, from) + block + html.slice(to + END.length));
  console.log(`index.html: ${modules.length} modules to preload`);
} else if (current !== block) {
  console.error('index.html: the modulepreload list is out of date; run node tools/check_preload.mjs --write');
  process.exit(1);
} else {
  console.log(`index.html: the modulepreload list is up to date (${modules.length} modules)`);
}
