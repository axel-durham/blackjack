import { h, seg, bindKeys, buzz, ACTION_KEYS } from '../ui.js';
import { settings, stats, record, pct } from '../store.js';
import { decide, legalActions } from '../engine/strategy.js';
import { basicSituations, basicHand, weightedPick, situationKey } from '../engine/scenarios.js';
import { singleFelt, actionBar, nextBar, explainRows, actionName, codeMeaning, handLine } from './common.js';

let filter = 'all';

export function render(root) {
  const rules = settings.rules;
  let current = null;
  let answered = false;
  let timer = null;

  const statEl = h('div', { class: 'statline' });
  const feltSlot = h('div');
  const fbSlot = h('div');
  const barSlot = h('div', { class: 'bar-slot' });
  const filters = [['all', 'All'], ['hard', 'Hard'], ['soft', 'Soft'], ['pairs', 'Pairs']];
  if (rules.surrender) filters.push(['surrender', 'Surrender']);
  if (!filters.some(([v]) => v === filter)) filter = 'all';
  const segEl = h('div');
  const drawSeg = () => segEl.replaceChildren(seg(filters, filter, (v) => { filter = v; drawSeg(); next(); }, 'Hand type'));

  const drawStats = () => {
    const s = stats.basic;
    statEl.replaceChildren(
      h('span', null, 'Accuracy ', h('b', null, pct(s.correct, s.answered))),
      h('span', null, 'Streak ', h('b', null, s.streak)),
      h('span', null, 'Best ', h('b', null, s.best)),
      h('span', null, 'Hands ', h('b', null, s.answered)));
  };

  function next() {
    clearTimeout(timer);
    answered = false;
    const pool = basicSituations(rules).filter((s) => filter === 'all' || s.cat === filter);
    const sit = weightedPick(pool, (s) => situationKey(s.table, s.key, s.up), stats.basic.cells);
    const { cards, up } = basicHand(sit);
    const legal = legalActions(cards, rules);
    const result = decide(cards, up, rules, { legal });
    current = { sit, cards, up, legal, result };
    feltSlot.replaceChildren(singleFelt(up, cards));
    fbSlot.replaceChildren();
    const bar = actionBar(legal, answer);
    current.bar = bar;
    barSlot.replaceChildren(bar.el);
  }

  function answer(a) {
    if (answered || !current.legal[a]) return;
    answered = true;
    const { result, cards, up, sit, bar } = current;
    const ok = a === result.action;
    record('basic', situationKey(sit.table, sit.key, sit.up), ok);
    drawStats();
    bar.buttons[a].classList.add(ok ? 'chosen-good' : 'chosen-bad');
    if (!ok) bar.buttons[result.action].classList.add('correct');
    bar.lock();
    const meaning = codeMeaning(result.code, cards);
    fbSlot.replaceChildren(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
      h('div', { class: 'fb-head' }, h('span', null, ok ? '✓' : '✗'), h('span', null, ok ? actionName(result.action) : `Correct: ${actionName(result.action)}`),
        h('span', { class: 'small muted', style: { fontWeight: 500, marginLeft: 'auto' } }, handLine(cards, up))),
      !ok && h('div', { class: 'fb-body' }, `You chose `, h('b', null, actionName(a)), '. ', meaning),
      !ok && explainRows(cards, up, rules, result)));
    if (!ok) {
      buzz(80);
      requestAnimationFrame(() => fbSlot.firstChild?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    }
    if (ok && settings.autoAdvance) {
      timer = setTimeout(next, 650);
    } else {
      barSlot.replaceChildren(nextBar('Next hand →', next));
    }
  }

  bindKeys(root, (k) => {
    if (ACTION_KEYS[k] && !answered) { answer(ACTION_KEYS[k]); return true; }
    if ((k === 'enter' || k === ' ') && answered) { next(); return true; }
    return false;
  });

  drawSeg();
  drawStats();
  root.append(
    h('div', { class: 'view-body' },
      h('div', null, h('h1', { style: { fontSize: '1.3rem' } }, 'Basic strategy'),
        h('p', { class: 'small muted intro' }, 'Play the chart. Hands you miss come back more often.')),
      segEl, statEl, feltSlot, fbSlot),
    barSlot);
  next();
  return () => clearTimeout(timer);
}
