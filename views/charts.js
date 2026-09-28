import { h, seg } from '../ui.js';
import { settings, stats, resetStats, pct } from '../store.js';
import { chartCard } from './chartview.js';
import { activeDeviations } from '../engine/active.js';
import { indexLabel } from '../engine/deviations.js';
import { rampRows } from '../engine/betting.js';
import { rulesLabel } from '../engine/rules.js';
import { situationKey } from '../engine/scenarios.js';

let tab = 'strategy';
let overlay = 'plain';

const KIND_ORDER = ['insurance', 'hard', 'soft', 'pair', 'surrender'];
const KIND_NAME = { insurance: 'Insurance', hard: 'Hard totals', soft: 'Soft totals', pair: 'Pairs', surrender: 'Surrender' };

export function render(root) {
  const rules = settings.rules;
  const body = h('div', { class: 'view-body' });
  const segEl = h('div');
  const content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  const draw = () => {
    segEl.replaceChildren(seg([['strategy', 'Strategy'], ['indices', 'Indices'], ['ramp', 'Bet ramp'], ['stats', 'My stats']], tab, (v) => { tab = v; draw(); }, 'Reference'));
    content.replaceChildren(...{ strategy, indices, ramp, statsView }[tab === 'stats' ? 'statsView' : tab]().filter(Boolean));
  };

  function heat(table, key, up) {
    const cell = stats.basic.cells[situationKey(table, key, up)];
    if (!cell || !cell.wrong) return 0;
    return Math.min(1, cell.wrong / cell.n);
  }

  function strategy() {
    const opts = { legend: true, index: overlay === 'index', heat: overlay === 'heat' ? heat : null };
    const tables = ['pairs', 'soft', 'hard'];
    if (rules.surrender) tables.push('surrender');
    return [
      h('p', { class: 'small muted' }, `Basic strategy for ${rulesLabel(rules)}.`),
      seg([['plain', 'Chart'], ['index', 'With indices'], ['heat', 'My mistakes']], overlay, (v) => { overlay = v; draw(); }, 'Overlay'),
      overlay === 'index' && h('p', { class: 'small muted' }, 'Red numbers replace cells with an index play: “3+” means deviate at TC +3 or higher, “−1−” at −1 or lower, “0+ / 0−” at any positive / negative running count.'),
      overlay === 'heat' && h('p', { class: 'small muted' }, 'Red tint shows how often you miss each cell in the Basic drill.'),
      ...tables.map((t) => chartCard(t, rules, opts)),
      h('p', { class: 'panel small' }, h('span', null, h('b', null, 'Insurance / even money: '), 'never with basic strategy; take it at TC +3 or higher when counting.')),
    ];
  }

  function indices() {
    const list = activeDeviations(rules);
    const groups = KIND_ORDER.map((k) => [k, list.filter((d) => d.kind === k)]).filter(([, l]) => l.length);
    const source = rules.decks <= 2
      ? 'Double-deck indices are computed by this app’s EV model (BJA publishes shoe charts only).'
      : rules.expanded
        ? 'BJA’s published chart plus computed expanded plays (tagged “computed”).'
        : 'Blackjack Apprenticeship’s published chart (Illustrious 18 + Fab 4 and extras). Turn on expanded plays in ⚙︎ Settings.';
    return [
      h('p', { class: 'small muted' }, `${list.length} plays for ${rulesLabel(rules)}. ${source}`),
      ...groups.flatMap(([k, l]) => [
        h('div', { class: 'section-title' }, KIND_NAME[k]),
        h('div', { class: 'list' }, l.map((d) => {
          const cell = stats.index.cells[d.id];
          return h('div', { class: 'li' },
            h('div', { class: 'grow' }, d.title, d.source !== 'bja' && h('span', { class: 'tag', style: { marginLeft: '6px' } }, 'computed'),
              h('div', { class: 'sub' }, indexLabel(d), cell ? ` · you: ${pct(cell.n - cell.wrong, cell.n)} of ${cell.n}` : '')),
            h('span', { class: 'idxv' }, d.basis === 'rc' ? `RC ${d.dir === '+' ? '>' : '<'} 0` : `${d.index > 0 ? '+' : ''}${d.index}${d.dir === '+' ? '↑' : '↓'}`));
        })),
      ]),
    ];
  }

  function ramp() {
    const r = settings.ramp;
    return [
      h('p', { class: 'small muted' }, `Unit $${r.unit}. Spread 1–${Math.max(...r.units)}. Edit in ⚙︎ Settings.`),
      h('div', { class: 'list' }, rampRows(r).map((row) => h('div', { class: 'li' },
        h('span', { class: 'grow' }, `TC ${row.tc}`),
        h('span', { class: 'idxv' }, row.units ? `${row.units}u · $${row.units * r.unit}` : 'sit out')))),
      h('p', { class: 'small muted' }, 'True count = running count ÷ decks remaining, rounded down. Raise your bet only when the true count is +2 or better.'),
    ];
  }

  function statsView() {
    const b = stats.basic;
    const i = stats.index;
    const row = (label, value, sub) => h('div', { class: 'li' }, h('div', { class: 'grow' }, label, sub && h('div', { class: 'sub' }, sub)), h('span', { class: 'idxv' }, value));
    const worst = Object.entries(i.cells).filter(([, c]) => c.wrong).sort((a, z) => z[1].wrong / z[1].n - a[1].wrong / a[1].n).slice(0, 5);
    const all = activeDeviations({ ...rules, expanded: true }).concat(activeDeviations(rules));
    const sims = stats.sim.history;
    return [
      h('div', { class: 'list' },
        row('Basic strategy', pct(b.correct, b.answered), `${b.answered} hands · best streak ${b.best}`),
        row('Index plays', pct(i.correct, i.answered), `${i.answered} hands · best streak ${i.best}`),
        row('True count conversion', pct(stats.tc.correct, stats.tc.answered), `${stats.tc.answered} answered`),
        row('Bet sizing', pct(stats.bet.correct, stats.bet.answered), `${stats.bet.answered} answered`),
        row('Count checks', pct(stats.count.correct, stats.count.checks), stats.count.deckBest ? `Best deck countdown ${stats.count.deckBest.toFixed(1)}s` : `${stats.count.checks} checks`),
        row('Casino sessions', String(sims.length), sims.length ? `${sims.reduce((a, s) => a + s.rounds, 0)} rounds · ${sims.reduce((a, s) => a + s.net, 0)}u net` : '')),
      worst.length && h('div', { class: 'section-title' }, 'Index plays to review'),
      worst.length && h('div', { class: 'list' }, worst.map(([id, c]) => {
        const d = all.find((x) => x.id === id);
        return row(d ? d.title : id, `${c.wrong}/${c.n} missed`, d ? indexLabel(d) : '');
      })),
      h('p', { class: 'small muted' }, 'See the Strategy tab → “My mistakes” for a heatmap of basic-strategy misses. Progress is stored only on this device.'),
      h('button', { class: 'btn ghost', onclick: () => { if (confirm('Reset all practice stats on this device?')) { resetStats(); draw(); } } }, 'Reset stats'),
    ].filter(Boolean);
  }

  body.append(h('h1', { style: { fontSize: '1.3rem' } }, 'Charts & stats'), segEl, content);
  root.append(body);
  draw();
}
