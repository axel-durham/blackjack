import { h, cardsEl } from '../ui.js';
import { handInfo, describeHand, upLabel } from '../engine/hand.js';
import { upValue } from '../engine/cards.js';
import { ACTIONS } from '../engine/strategy.js';
import { chartTable, rowLabel } from './chartview.js';
import { charts } from '../engine/tables.js';

export function singleFelt(up, cards, { hole = true } = {}) {
  return h('div', { class: 'felt' },
    h('div', { class: 'spot-label' }, 'Dealer'),
    cardsEl(hole ? [up, null] : [up], { hideIndex: hole ? 1 : -1 }),
    h('div', { class: 'divider' }),
    cardsEl(cards),
    h('div', { class: 'hand-total' }, describeHand(cards)),
    h('div', { class: 'spot-label' }, 'You'));
}

const ORDER = ['H', 'S', 'D', 'P', 'R'];
const SHORT = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surr.' };

export function actionBar(legal, onPick) {
  const buttons = {};
  const el = h('div', { class: 'actions' }, ORDER.map((a) => {
    buttons[a] = h('button', { class: `act ${a}`, disabled: !legal[a], onclick: () => onPick(a), 'aria-label': ACTIONS[a] },
      SHORT[a], h('span', { class: 'kbd', 'aria-hidden': 'true' }, a.toLowerCase()));
    return buttons[a];
  }));
  return { el, buttons, lock() { Object.values(buttons).forEach((b) => { b.disabled = true; b.style.opacity = b.classList.contains('correct') || b.classList.contains('chosen-bad') || b.classList.contains('chosen-good') ? '1' : ''; }); } };
}

export function nextBar(label, onNext) {
  const btn = h('button', { class: 'btn primary block', onclick: onNext }, label);
  return h('div', { class: 'actions one' }, btn);
}

// Chart rows that explain a decision, with the relevant cell outlined.
export function explainRows(cards, up, rules, result) {
  const u = typeof up === 'number' ? up : upValue(up);
  const info = handInfo(cards);
  const chart = charts(rules);
  const blocks = [];
  const add = (table, key) => blocks.push(h('div', null,
    h('div', { class: 'small muted', style: { margin: '2px 0 4px' } }, {
      pairs: 'Pair splitting', soft: 'Soft totals', hard: 'Hard totals', surrender: 'Late surrender',
    }[table] + (result.table === table ? '' : ' (checked first)')),
    chartTable(table, rules, { rows: [key], highlight: { key, up: u } })));
  if (info.pair && cards.length === 2) add('pairs', info.pair);
  if (!info.soft && cards.length === 2 && rules.surrender && chart.surrender[info.total]) add('surrender', info.total);
  if (result.table === 'soft' && info.total >= 13 && info.total <= 20) add('soft', info.total);
  if (result.table === 'hard' && info.total >= 8 && info.total <= 17) add('hard', info.total);
  const wrap = h('div', { class: 'chart-wrap', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, blocks);
  return blocks.length ? wrap : null;
}

export const actionName = (a) => ACTIONS[a];

export function codeMeaning(code, cards) {
  const multi = cards.length > 2;
  if (code === 'D') return multi ? 'Chart says double; with 3+ cards you can’t, so hit.' : 'Double if allowed, otherwise hit.';
  if (code === 'Ds') return multi ? 'Chart says double; with 3+ cards you can’t, so stand.' : 'Double if allowed, otherwise stand.';
  if (code === 'Y/N') return 'Split only when double after split is allowed.';
  return '';
}

export const handLine = (cards, up) => `${describeHand(cards)} v ${upLabel(typeof up === 'number' ? up : upValue(up))}`;

export { rowLabel };
