import { h } from '../ui.js';
import { UPS, cellCode } from '../engine/tables.js';
import { shortIndex } from '../engine/deviations.js';
import { activeDeviations } from '../engine/active.js';

const upHead = (u) => (u === 11 ? 'A' : String(u));

export const TABLE_ROWS = {
  pairs: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  soft: [20, 19, 18, 17, 16, 15, 14, 13],
  hard: [17, 16, 15, 14, 13, 12, 11, 10, 9, 8],
  surrender: [17, 16, 15, 14],
};

export const TITLES = { pairs: 'Pair splitting', soft: 'Soft totals', hard: 'Hard totals', surrender: 'Late surrender' };

export function rowLabel(table, key) {
  if (table === 'pairs') return key === 11 ? 'A,A' : key === 10 ? 'T,T' : `${key},${key}`;
  if (table === 'soft') return `A,${key - 11}`;
  return String(key);
}

const KIND_TO_TABLE = { pair: 'pairs', soft: 'soft', hard: 'hard', surrender: 'surrender' };

/**
 * Renders a chart (or selected rows of it) for the given rules.
 * opts.highlight = { key, up } outlines a cell; opts.index overlays deviation indices;
 * opts.heat = (table, key, up) => 0..1 tints cells by error rate.
 */
export function chartTable(table, rules, opts = {}) {
  const rows = opts.rows ?? TABLE_ROWS[table];
  const devs = opts.index ? activeDeviations(rules).filter((d) => KIND_TO_TABLE[d.kind] === table) : [];
  const hl = opts.highlight;
  return h('table', { class: 'chart' },
    h('thead', null, h('tr', null,
      h('th', null, ''),
      UPS.map((u) => h('th', { class: hl && hl.up === u ? 'hl' : '' }, upHead(u))))),
    h('tbody', null, rows.map((key) => h('tr', { class: opts.dimRow?.(key) ? 'dim' : '' },
      h('th', null, rowLabel(table, key)),
      UPS.map((u) => {
        const code = cellCode(table, key, u, rules);
        const d = devs.find((x) => x.key === key && x.up === u);
        const heat = opts.heat?.(table, key, u);
        const cls = [
          code ? `cell-${code.replace('/', '')}` : 'cell-empty',
          hl && hl.key === key && hl.up === u ? 'hl' : '',
          heat ? 'heat' : '',
        ].join(' ');
        return h('td', { class: cls, style: heat ? { '--heat': (0.15 + 0.55 * heat).toFixed(2) } : null },
          d ? h('span', { class: 'idx' }, shortIndex(d)) : code);
      })))));
}

export function chartCard(table, rules, opts = {}) {
  return h('div', { class: 'chart-wrap' },
    opts.title !== false && h('h3', null, TITLES[table]),
    chartTable(table, rules, opts),
    opts.legend && legend(table));
}

const LEGENDS = {
  pairs: [['Y', 'Split'], ['YN', 'Split if DAS'], ['N', "Don't split"]],
  soft: [['H', 'Hit'], ['S', 'Stand'], ['D', 'Double, else hit'], ['Ds', 'Double, else stand']],
  hard: [['H', 'Hit'], ['S', 'Stand'], ['D', 'Double, else hit']],
  surrender: [['SUR', 'Surrender (first two cards)']],
};

export function legend(table) {
  return h('div', { class: 'legend' }, LEGENDS[table].map(([c, t]) => h('span', null, h('i', { class: `cell-${c}` }), t)));
}
