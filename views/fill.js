import { h, seg, buzz, put } from '../ui.js';
import { settings, stats, saveStats, recordCell } from '../store.js';
import { UPS, cellCode } from '../engine/tables.js';
import { shortIndex } from '../engine/deviations.js';
import { activeDeviations } from '../engine/active.js';
import { rulesLabel } from '../engine/rules.js';
import { situationKey } from '../engine/scenarios.js';
import { TABLE_ROWS, TITLES, KIND_TO_TABLE, rowLabel, upHead } from './chartview.js';

// Palettes: [code shown in the cell, button label].
const PALETTES = {
  hard: [['H', 'Hit'], ['S', 'Stand'], ['D', 'Double']],
  soft: [['H', 'Hit'], ['S', 'Stand'], ['D', 'Dbl/hit'], ['Ds', 'Dbl/stand']],
  pairs: [['Y', 'Split'], ['Y/N', 'If DAS'], ['N', 'No']],
  surrender: [['SUR', 'Surrender']],
};
const ERASE = '';
const INDEX_TABLES = ['pairs', 'soft', 'hard', 'surrender'];

let which = 'hard';

const cls = (code) => (code ? `cell-${code.replace('/', '')}` : 'cell-empty');
const tokenOrder = (t) => {
  const n = parseInt(t, 10);
  return n * 2 + (t.endsWith('+') ? 1 : 0);
};

export function render(root) {
  const rules = settings.rules;
  const charts = ['hard', 'soft', 'pairs', ...(rules.surrender ? ['surrender'] : []), 'index'];
  if (!charts.includes(which)) which = 'hard';

  const segEl = h('div');
  const status = h('div', { class: 'statline' });
  const board = h('div');
  const result = h('div');
  const barSlot = h('div', { class: 'bar-slot' });

  let cells; // [{ table, key, up, answer, value, el, dev? }]
  let active;
  let checked = false;

  const drawSeg = () => segEl.replaceChildren(seg(
    charts.map((c) => [c, c === 'index' ? 'Indices' : { hard: 'Hard', soft: 'Soft', pairs: 'Pairs', surrender: 'Surrender' }[c]]),
    which, (v) => { which = v; drawSeg(); start(); }, 'Chart'));

  function drawStatus() {
    const left = cells.filter((c) => c.value === ERASE && c.answer !== ERASE).length;
    const best = stats.fill[chartId()];
    status.replaceChildren(...[
      which !== 'surrender' && h('span', null, 'Unfilled ', h('b', null, left)),
      best && h('span', null, 'Best ', h('b', null, `${best.best}/${best.total}`)),
      best && h('span', null, 'Attempts ', h('b', null, best.attempts)),
    ].filter(Boolean));
  }

  const chartId = () => `${which}|${rules.decks <= 2 ? 'dd' : 'shoe'}|${rules.h17 ? 'h17' : 's17'}${which === 'index' && rules.expanded ? '|x' : ''}`;

  function start() {
    checked = false;
    result.replaceChildren();
    cells = [];
    if (which === 'index') buildIndexBoard();
    else buildBoard(which);
    drawPalette();
    drawStatus();
  }

  // ---------- board ----------
  function tableFor(table, cellFor) {
    return h('table', { class: 'chart fill' },
      h('thead', null, h('tr', null, h('th', null, ''), UPS.map((u) => h('th', null, upHead(u))))),
      h('tbody', null, TABLE_ROWS[table].map((key) => h('tr', null,
        h('th', null, rowLabel(table, key)),
        UPS.map((up) => cellFor(key, up))))));
  }

  function buildBoard(table) {
    const t = tableFor(table, (key, up) => {
      const c = { table, key, up, answer: cellCode(table, key, up, rules), value: ERASE };
      c.el = h('td', { class: 'cell-empty' });
      cells.push(c);
      return c.el;
    });
    wirePainting(t);
    board.replaceChildren(h('div', { class: 'chart-wrap' },
      h('h3', null, `${TITLES[table]} · ${rulesLabel(rules)}`), t));
  }

  function buildIndexBoard() {
    const devs = activeDeviations(rules).filter((d) => d.kind !== 'insurance');
    const blocks = [];
    for (const table of INDEX_TABLES) {
      const here = devs.filter((d) => KIND_TO_TABLE[d.kind] === table);
      if (!here.length) continue;
      const rows = TABLE_ROWS[table].filter((k) => here.some((d) => d.key === k));
      const t = h('table', { class: 'chart fill' },
        h('thead', null, h('tr', null, h('th', null, ''), UPS.map((u) => h('th', null, upHead(u))))),
        h('tbody', null, rows.map((key) => h('tr', null,
          h('th', null, rowLabel(table, key)),
          UPS.map((up) => {
            const base = cellCode(table, key, up, rules);
            const d = here.find((x) => x.key === key && x.up === up);
            if (!d) return h('td', { class: `${cls(base)} fixed` }, base);
            const c = { table, key, up, answer: shortIndex(d), value: ERASE, dev: d, base };
            c.el = h('td', { class: `${cls(base)} idx-blank` });
            cells.push(c);
            return c.el;
          })))));
      wirePainting(t);
      blocks.push(h('div', { class: 'chart-wrap' }, h('h3', null, TITLES[table]), t));
    }
    board.replaceChildren(
      h('p', { class: 'small muted' }, `Blank cells have an index play (${rulesLabel(rules)}${rules.expanded ? ', expanded' : ''}). Pick the index, then tap the cell. “0+ / 0−” means any positive / negative running count.`),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, blocks));
  }

  function paintCell(c, value) {
    c.value = value;
    if (which === 'index') {
      c.el.className = `${cls(c.base)} ${value ? 'idx-filled' : 'idx-blank'}`;
      c.el.textContent = value;
    } else {
      c.el.className = cls(value);
      c.el.textContent = value;
    }
  }

  // Tap, or drag sideways along a row, to paint cells with the active code (vertical swipes
  // still scroll the page). Starting on a cell that already holds the active code erases.
  function wirePainting(table) {
    let mode = null;
    const cellAt = (x, y) => {
      const td = document.elementFromPoint(x, y)?.closest('td');
      return td && cells.find((c) => c.el === td);
    };
    const apply = (c) => {
      if (!c || checked) return;
      const v = mode === 'erase' ? ERASE : active;
      if (c.value !== v) {
        paintCell(c, v);
        drawStatus();
      }
    };
    table.addEventListener('pointerdown', (e) => {
      const c = cellAt(e.clientX, e.clientY);
      if (!c || checked) return;
      mode = c.value === active || active === ERASE ? 'erase' : 'paint';
      apply(c);
      if (e.pointerType === 'mouse') table.setPointerCapture?.(e.pointerId);
    });
    table.addEventListener('pointermove', (e) => { if (mode) apply(cellAt(e.clientX, e.clientY)); });
    const end = () => { mode = null; };
    table.addEventListener('pointerup', end);
    table.addEventListener('pointercancel', end);
  }

  // ---------- palette / actions ----------
  function paletteCodes() {
    if (which === 'index') {
      const tokens = [...new Set(cells.map((c) => c.answer))];
      // Pad with neighbouring indices so the palette doesn't give away which values exist.
      for (const t of ['6+', '5+', '4+', '3+', '2+', '1+', '0+', '0-', '-1-', '-2-', '-3-', '-1+']) if (!tokens.includes(t)) tokens.push(t);
      return tokens.sort((a, b) => tokenOrder(b) - tokenOrder(a)).map((t) => [t, t.replace('-', '−').replace(/-$/, '−')]);
    }
    return PALETTES[which];
  }

  function drawPalette() {
    if (checked) return;
    const codes = paletteCodes();
    if (!active || !codes.some(([c]) => c === active)) active = codes[0][0];
    const btn = ([code, label]) => h('button', {
      class: `pal ${which === 'index' ? 'tok' : cls(code)}`,
      'aria-pressed': String(active === code),
      onclick: () => { active = code; drawPalette(); },
    }, which === 'index' ? label : h('span', null, h('b', null, code), h('small', null, label)));
    barSlot.replaceChildren(h('div', { class: 'fill-bar' },
      h('div', { class: `palette ${which === 'index' ? 'tokens' : ''}` },
        codes.map(btn),
        h('button', { class: 'pal eraser', 'aria-pressed': String(active === ERASE), onclick: () => { active = ERASE; drawPalette(); } }, h('span', null, h('b', null, '⌫'), which !== 'index' && h('small', null, 'Erase')))),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => { if (cells.some((c) => c.value) && !confirm('Clear this chart?')) return; start(); } }, 'Clear'),
        h('button', { class: 'btn primary', onclick: check }, 'Check'))));
  }

  function check() {
    checked = true;
    let right = 0;
    for (const c of cells) {
      const ok = c.value === c.answer;
      if (ok) right++;
      if (which === 'index') recordCell('index', c.dev.id, ok);
      else recordCell('basic', situationKey(c.table, c.key, c.up), ok);
      if (!ok) {
        c.el.classList.add('wrong');
        put(c.el,
          c.value ? h('s', null, c.value) : null,
          h('span', { class: 'fix' }, c.answer || '—'));
      } else if (c.value) c.el.classList.add('right');
    }
    const id = chartId();
    const rec = (stats.fill[id] ??= { attempts: 0, best: 0, total: cells.length });
    rec.attempts++;
    rec.total = cells.length;
    rec.best = Math.max(rec.best, right);
    saveStats();
    const perfect = right === cells.length;
    if (!perfect) buzz(80);
    drawStatus();
    result.replaceChildren(h('div', { class: `feedback ${perfect ? 'good' : 'bad'}` },
      h('div', { class: 'fb-head' }, h('span', null, perfect ? '✓' : '✗'), h('span', null, `${right} / ${cells.length} correct`)),
      !perfect && h('div', { class: 'fb-body' }, 'Wrong cells are outlined in red with the right answer. Misses are fed into the ',
        which === 'index' ? 'Index' : 'Basic', ' drill so they come up more often.')));
    const wrong = cells.filter((c) => c.value !== c.answer);
    barSlot.replaceChildren(h('div', { class: 'actions two' },
      h('button', { class: 'btn ghost', disabled: !wrong.length, onclick: () => retry(wrong) }, 'Redo misses'),
      h('button', { class: 'btn primary', onclick: start }, 'Start over')));
    requestAnimationFrame(() => result.firstChild?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }

  // Keep the correct cells, blank the missed ones, and go again.
  function retry(wrong) {
    checked = false;
    result.replaceChildren();
    for (const c of cells) {
      c.el.classList.remove('right', 'wrong');
      paintCell(c, wrong.includes(c) ? ERASE : c.value);
    }
    drawPalette();
    drawStatus();
  }

  drawSeg();
  root.append(
    h('div', { class: 'view-body' },
      h('div', null, h('h1', { style: { fontSize: '1.3rem' } }, 'Fill in the chart'),
        h('p', { class: 'small muted intro' }, 'Pick a play below, then tap or drag across cells. Check when you’re done.')),
      segEl, status, board, result),
    barSlot);
  start();
}
