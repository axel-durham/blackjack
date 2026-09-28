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

// Chip colours share names with card classes (.red), so they must stay scoped to chips.
test('chip colour classes are scoped to chips and stack discs', () => {
  const css = readFileSync(new URL('style.css', root), 'utf8');
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g).flatMap((s) => s.split(','));
  for (const sel of selectors) {
    for (const m of sel.matchAll(/([.\w-]*)\.(white|red|green|black|purple)\b/g)) {
      assert.ok(['.chip', '.disc', '.card'].includes(m[1]), `unscoped colour selector: ${sel.trim()}`);
    }
    assert.ok(!/(^|[^\w-])\.chip(?![\w-])/.test(sel) || /^\s*\.chip(\.|:|\s|$)/.test(sel), `.chip used outside chip rules: ${sel.trim()}`);
  }
  const js = ['views/bet.js', 'views/sim.js'].map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n');
  assert.ok(!/class: '[^']*\bchip\b/.test(js), 'views should not reuse the .chip class for other buttons');
});
