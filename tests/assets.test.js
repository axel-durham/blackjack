import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);

test('service worker precaches every shipped module and nothing missing', () => {
  const sw = readFileSync(new URL('sw.js', root), 'utf8');
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const p of listed) assert.ok(existsSync(new URL(p, root)), `sw.js lists missing ${p}`);
  const modules = ['engine', 'views'].flatMap((d) => readdirSync(new URL(`${d}/`, root)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
  for (const m of [...modules, 'app.js', 'ui.js', 'store.js', 'style.css']) assert.ok(listed.includes(m), `sw.js is missing ${m}`);
});
