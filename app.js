import { h } from './ui.js';
import { settings, saveSettings } from './store.js';
import { rulesLabel } from './engine/rules.js';
import { DEFAULT_RAMP } from './engine/betting.js';
import * as basic from './views/basic.js';
import * as index from './views/index.js';
import * as count from './views/count.js';
import * as bet from './views/bet.js';
import * as sim from './views/sim.js';
import * as chartsView from './views/charts.js';
import * as fill from './views/fill.js';

const VIEWS = { basic, index, count, bet, sim, fill, charts: chartsView };
// Charts shows current stats, so it re-renders on every visit; every other tab stays
// mounted (hidden) so a drill or casino session survives a trip to the charts.
const FRESH_EACH_VISIT = new Set(['charts']);
const host = document.getElementById('view');
const main = document.getElementById('main');
const mounted = new Map(); // name -> { el, cleanup, scroll }
let current = null;

function unmount(name) {
  const m = mounted.get(name);
  if (!m) return;
  m.cleanup?.();
  m.el.remove();
  mounted.delete(name);
}

function route() {
  const hashName = (location.hash.slice(1) || 'basic').split('/')[0];
  const name = VIEWS[hashName] ? hashName : 'basic';
  if (current && mounted.has(current)) mounted.get(current).scroll = main.scrollTop;
  if (FRESH_EACH_VISIT.has(name)) unmount(name);
  for (const [n, m] of mounted) m.el.hidden = n !== name;
  if (!mounted.has(name)) {
    const el = h('div', { class: 'view' });
    host.append(el);
    mounted.set(name, { el, scroll: 0, cleanup: VIEWS[name].render(el) ?? null });
  }
  current = name;
  main.scrollTop = mounted.get(name).scroll;
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// Rule changes invalidate every drill and session in progress.
function resetViews() {
  for (const name of [...mounted.keys()]) unmount(name);
}
let settingsDirty = false;

function updatePill() {
  const r = settings.rules;
  document.getElementById('rules-pill').textContent = rulesLabel(r) + (r.expanded ? ' · +idx' : '');
}

// ---------- settings sheet ----------
const dialog = document.getElementById('settings');

function toggle(label, get, set, help) {
  const input = h('input', { type: 'checkbox', class: 'switch', onchange: (e) => set(e.target.checked) });
  input.checked = get();
  return h('label', { class: 'field' }, h('span', null, label, help && h('small', null, help)), input);
}

function select(label, options, get, set, help) {
  const sel = h('select', { onchange: (e) => set(e.target.value) },
    options.map(([v, t]) => h('option', { value: v }, t)));
  sel.value = String(get());
  return h('label', { class: 'field' }, h('span', null, label, help && h('small', null, help)), sel);
}

function buildSettings() {
  const r = settings.rules;
  const ramp = settings.ramp;
  // Only table-rule changes restart drills and sessions; ramp, chips and practice
  // toggles are read live.
  const changed = (resets = false) => {
    if (resets) settingsDirty = true;
    saveSettings();
    updatePill();
  };
  const rampInputs = ramp.units.map((u, i) => {
    const input = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 50, value: u,
      onchange: (e) => { ramp.units[i] = Math.max(0, Math.round(Number(e.target.value) || 0)); changed(); } });
    return h('label', null, i === 0 ? '≤+1' : i === ramp.units.length - 1 ? `+${i + 1}↑` : `+${i + 1}`, input);
  });
  dialog.replaceChildren(
    h('div', { class: 'sheet-head' }, h('h2', { id: 'settings-title' }, 'Settings'),
      h('button', { class: 'btn primary', style: { minHeight: '40px', padding: '8px 16px' }, onclick: () => dialog.close() }, 'Done')),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'section-title' }, 'Table rules'),
      h('div', { class: 'panel' },
        select('Decks', [[2, 'Double deck'], [4, '4 decks'], [6, '6 decks'], [8, '8 decks']], () => r.decks,
          (v) => { r.decks = Number(v); changed(true); }, 'Double deck uses its own chart and indices'),
        select('Soft 17', [['h17', 'Dealer hits (H17)'], ['s17', 'Dealer stands (S17)']], () => (r.h17 ? 'h17' : 's17'),
          (v) => { r.h17 = v === 'h17'; changed(true); }),
        toggle('Double after split', () => r.das, (v) => { r.das = v; changed(true); }),
        toggle('Late surrender', () => r.surrender, (v) => { r.surrender = v; changed(true); }),
        select('Penetration', [[0.65, '65%'], [0.7, '70%'], [0.75, '75%'], [0.8, '80%'], [0.85, '85%']], () => r.penetration,
          (v) => { r.penetration = Number(v); changed(true); }, 'Where the cut card sits (Count & Casino)')),
      h('div', { class: 'section-title' }, 'Deviations'),
      h('div', { class: 'panel' },
        toggle('Expanded index plays', () => !!r.expanded, (v) => { r.expanded = v; changed(true); },
          'Adds EV-model indices for every other cell that flips between TC −3 and +6, beyond BJA’s chart')),
      h('div', { class: 'section-title' }, 'Bet ramp (units by true count)'),
      h('div', { class: 'panel' },
        h('div', { class: 'ramp-grid' }, rampInputs),
        h('label', { class: 'field' }, h('span', null, 'Unit size ($)'),
          h('input', { type: 'number', inputmode: 'numeric', min: 1, value: ramp.unit,
            onchange: (e) => { ramp.unit = Math.max(1, Number(e.target.value) || 1); changed(); } })),
        toggle('Bet with chips', () => settings.chips, (v) => { settings.chips = v; changed(); }, 'Casino and Bet drill: stack $ chips instead of tapping unit buttons'),
        toggle('Wong out', () => ramp.wongOut, (v) => { ramp.wongOut = v; changed(); }, 'Sit out (bet 0) when the count drops'),
        select('Wong out at', [[-1, 'TC −1 or lower'], [-2, 'TC −2 or lower'], [-3, 'TC −3 or lower']], () => ramp.wongOutAt,
          (v) => { ramp.wongOutAt = Number(v); changed(); }),
        h('button', { class: 'btn ghost', onclick: () => { Object.assign(ramp, structuredClone(DEFAULT_RAMP), { units: [...DEFAULT_RAMP.units] }); changed(); buildSettings(); } }, 'Reset ramp')),
      h('div', { class: 'section-title' }, 'Practice'),
      h('div', { class: 'panel' },
        toggle('Auto-advance when correct', () => settings.autoAdvance, (v) => { settings.autoAdvance = v; changed(); }),
        toggle('Vibrate on mistakes', () => settings.haptics, (v) => { settings.haptics = v; changed(); }, 'Android only; iOS Safari ignores it')),
      h('p', { class: 'small muted', style: { padding: '0 4px' } },
        'Shoe charts and indices: Blackjack Apprenticeship (H17/S17). Double-deck chart: Wizard of Odds. ',
        'Double-deck and expanded indices are computed by this app’s EV model, which reproduces BJA’s published indices within ±1.')));
}

document.getElementById('open-settings').addEventListener('click', () => {
  buildSettings();
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  if (settingsDirty) resetViews();
  settingsDirty = false;
  route();
});
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

window.addEventListener('hashchange', route);
updatePill();
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
