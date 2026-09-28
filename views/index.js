import { h, seg, bindKeys, buzz, ACTION_KEYS, trayEl } from '../ui.js';
import { settings, saveSettings, stats, record, pct } from '../store.js';
import { decide, legalActions } from '../engine/strategy.js';
import { countAround, deviationHand, weightedPick } from '../engine/scenarios.js';
import { activeDeviations, shouldInsure } from '../engine/active.js';
import { isTriggered, indexLabel } from '../engine/deviations.js';
import { plausibleTrueCounts, signed } from '../engine/count.js';
import { singleFelt, actionBar, nextBar, actionName, handLine } from './common.js';

const MODES = [['tc', 'True count'], ['rc', 'RC + decks'], ['tray', 'RC + tray']];

export function render(root) {
  const rules = settings.rules;
  let q = null;
  let answered = false;
  let timer = null;

  const statEl = h('div', { class: 'statline' });
  const segEl = h('div');
  const countSlot = h('div');
  const feltSlot = h('div');
  const fbSlot = h('div');
  const barSlot = h('div', { class: 'bar-slot' });

  const drawSeg = () => segEl.replaceChildren(seg(MODES, settings.countDisplay, (v) => {
    settings.countDisplay = v;
    saveSettings();
    drawSeg();
    next();
  }, 'Count display'));

  const drawStats = () => {
    const s = stats.index;
    statEl.replaceChildren(
      h('span', null, 'Accuracy ', h('b', null, pct(s.correct, s.answered))),
      h('span', null, 'Streak ', h('b', null, s.streak)),
      h('span', null, 'Best ', h('b', null, s.best)),
      h('span', null, 'Plays in set ', h('b', null, activeDeviations(rules).length)));
  };

  function countStrip(count, d) {
    const mode = settings.countDisplay;
    const metric = (k, v) => h('div', { class: 'metric' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    if (mode === 'tc') {
      return h('div', { class: 'count-strip' }, metric('True count', signed(count.tc)),
        d.basis === 'rc' && metric('Running count', signed(count.rc)));
    }
    if (mode === 'rc') {
      return h('div', { class: 'count-strip' }, metric('Running count', signed(count.rc)), metric('Decks left', String(count.decks)));
    }
    return h('div', { class: 'count-strip' }, metric('Running count', signed(count.rc)),
      trayEl(rules.decks - count.decks, rules.decks));
  }

  function next() {
    clearTimeout(timer);
    answered = false;
    const pool = activeDeviations(rules);
    const d = weightedPick(pool, (x) => x.id, stats.index.cells);
    const count = countAround(d, rules);
    const { cards, up } = deviationHand(d, rules);
    q = { d, count, cards, up };
    countSlot.replaceChildren(countStrip(count, d));
    feltSlot.replaceChildren(singleFelt(up, cards));
    fbSlot.replaceChildren();

    // In tray mode the deck estimate is fuzzy: accept any play right for ±½ deck.
    const tcs = settings.countDisplay === 'tray' ? plausibleTrueCounts(count.rc, count.decks) : [count.tc];
    if (d.kind === 'insurance') {
      q.correct = shouldInsure(rules, count) ? 'Y' : 'N';
      q.accept = new Set(tcs.map((tc) => (shouldInsure(rules, { tc, rc: count.rc }) ? 'Y' : 'N')));
      const yes = h('button', { class: 'act yes', onclick: () => answer('Y') }, 'Take insurance');
      const no = h('button', { class: 'act no', onclick: () => answer('N') }, 'No insurance');
      q.bar = { buttons: { Y: yes, N: no }, lock() { yes.disabled = true; no.disabled = true; yes.style.opacity = no.style.opacity = '1'; } };
      barSlot.replaceChildren(h('div', { class: 'actions two' }, yes, no));
      return;
    }
    const legal = legalActions(cards, rules);
    q.legal = legal;
    q.result = decide(cards, up, rules, { legal, count });
    q.basic = decide(cards, up, rules, { legal });
    q.correct = q.result.action;
    q.accept = new Set(tcs.map((tc) => decide(cards, up, rules, { legal, count: { tc, rc: count.rc } }).action));
    q.bar = actionBar(legal, answer);
    barSlot.replaceChildren(q.bar.el);
  }

  function answer(a) {
    if (answered || (q.legal && !q.legal[a])) return;
    answered = true;
    const { d, count, cards, up } = q;
    const ok = q.accept.has(a);
    record('index', d.id, ok);
    drawStats();
    q.bar.buttons[a].classList.add(ok ? 'chosen-good' : 'chosen-bad');
    if (!ok) q.bar.buttons[q.correct].classList.add('correct');
    q.bar.lock();
    const fired = isTriggered(d, count);
    const tcMath = `TC = ${signed(count.rc)} ÷ ${count.decks} = ${(count.rc / count.decks).toFixed(2)} → ${signed(count.tc)}`;
    const correctName = d.kind === 'insurance' ? (q.correct === 'Y' ? 'Take insurance' : 'No insurance') : actionName(q.correct);
    const why = d.basis === 'rc'
      ? `Index ${indexLabel(d)} — running count is ${signed(count.rc)}, so ${fired ? 'deviate' : 'play basic'}.`
      : `Index ${indexLabel(d)} — true count is ${signed(count.tc)}, so ${fired ? 'deviate' : 'play basic'}.`;
    const lenient = ok && a !== q.correct;
    fbSlot.replaceChildren(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
      h('div', { class: 'fb-head' }, h('span', null, ok ? '✓' : '✗'), h('span', null, ok ? correctName : `Correct: ${correctName}`),
        h('span', { class: 'small muted', style: { fontWeight: 500, marginLeft: 'auto' } }, d.kind === 'insurance' ? 'Dealer shows A' : handLine(cards, up))),
      h('div', { class: 'fb-body' },
        h('b', null, d.title), ' ', h('span', { class: 'tag' }, d.source === 'bja' ? 'BJA' : 'computed'), h('br'),
        why, h('br'),
        settings.countDisplay !== 'tc' && h('span', { class: 'muted' }, tcMath),
        q.basic && fired && q.basic.action !== q.result.action && h('div', { class: 'muted' }, `Basic strategy would ${actionName(q.basic.action).toLowerCase()}.`),
        lenient && h('div', { class: 'muted' }, `Accepted: at a slightly different deck estimate your play is right (exact answer: ${correctName}).`))));
    if (!ok) buzz(80);
    requestAnimationFrame(() => fbSlot.firstChild?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    if (ok && settings.autoAdvance) timer = setTimeout(next, 1400);
    else barSlot.replaceChildren(nextBar('Next hand →', next));
  }

  bindKeys(root, (k) => {
    if (answered) {
      if (k === 'enter' || k === ' ') { next(); return true; }
      return false;
    }
    if (q?.d.kind === 'insurance') {
      if (k === 'y' || k === 'n') { answer(k.toUpperCase()); return true; }
      return false;
    }
    if (ACTION_KEYS[k]) { answer(ACTION_KEYS[k]); return true; }
    return false;
  });

  drawSeg();
  drawStats();
  root.append(
    h('div', { class: 'view-body' },
      h('div', null, h('h1', { style: { fontSize: '1.3rem' } }, 'Index plays'),
        h('p', { class: 'small muted intro' }, 'Every hand is a deviation spot. Convert the count, then decide: basic or deviate?')),
      segEl, statEl, countSlot, feltSlot, fbSlot),
    barSlot);
  next();
  return () => clearTimeout(timer);
}
