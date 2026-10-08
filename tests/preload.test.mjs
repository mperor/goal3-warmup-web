// The modulepreload list in index.html follows the imports (tools/check_preload.mjs).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('index.html preloads every module js/main.js imports', () => {
  const tool = fileURLToPath(new URL('../tools/check_preload.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [tool], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
