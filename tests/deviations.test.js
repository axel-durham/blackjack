import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../engine/strategy.js';
import { deviationsFor, isTriggered } from '../engine/deviations.js';
import { activeDeviations, shouldInsure } from '../engine/active.js';
import { DEFAULT_RULES } from '../engine/rules.js';
import { countAround, deviationHand } from '../engine/scenarios.js';
import { mulberry32 } from '../engine/cards.js';

const c = (s) => s.split(',').map((r) => ({ rank: r, suit: '♥' }));
const H17 = DEFAULT_RULES;
const S17 = { ...DEFAULT_RULES, h17: false };
const NO_SUR = { ...H17, surrender: false };
const at = (tc, rc = tc * 3) => ({ count: { tc, rc } });

test('I18 hard plays flip at their index (H17)', () => {
  assert.equal(decide(c('T,4,2'), 10, H17, at(0, 1)).action, 'S', '16 v 10 stands at positive RC');
  assert.equal(decide(c('T,4,2'), 10, H17, at(0, 0)).action, 'H');
  assert.equal(decide(c('T,4,2'), 9, H17, at(4)).action, 'S');
  assert.equal(decide(c('T,4,2'), 9, H17, at(3)).action, 'H');
  assert.equal(decide(c('T,3,2'), 10, H17, at(4)).action, 'S');
  assert.equal(decide(c('T,3,2'), 10, H17, at(3)).action, 'H');
  assert.equal(decide(c('T,2'), 2, H17, at(3)).action, 'S');
  assert.equal(decide(c('T,2'), 2, H17, at(2)).action, 'H');
  assert.equal(decide(c('T,2'), 3, H17, at(2)).action, 'S');
  assert.equal(decide(c('T,2'), 4, H17, at(0, -1)).action, 'H');
  assert.equal(decide(c('T,2'), 4, H17, at(0, 0)).action, 'S');
  assert.equal(decide(c('T,3'), 2, H17, at(-1)).action, 'H');
  assert.equal(decide(c('T,3'), 2, H17, at(0)).action, 'S');
  assert.equal(decide(c('6,4'), 10, H17, at(4)).action, 'D');
  assert.equal(decide(c('6,4'), 11, H17, at(3)).action, 'D');
  assert.equal(decide(c('6,4'), 11, H17, at(2)).action, 'H');
  assert.equal(decide(c('6,3'), 2, H17, at(1)).action, 'D');
  assert.equal(decide(c('6,3'), 7, H17, at(3)).action, 'D');
  assert.equal(decide(c('5,3'), 6, H17, at(2)).action, 'D');
});

test('surrender deviations and stand-vs-A when surrender is unavailable', () => {
  assert.equal(decide(c('T,6'), 8, H17, at(4)).action, 'R');
  assert.equal(decide(c('T,6'), 9, H17, at(-1)).action, 'H');
  assert.equal(decide(c('T,5'), 9, H17, at(2)).action, 'R');
  assert.equal(decide(c('T,5'), 10, H17, at(0, -1)).action, 'H');
  assert.equal(decide(c('T,5'), 11, H17, at(-1)).action, 'R');
  assert.equal(decide(c('T,5'), 11, H17, at(-2)).action, 'H');
  assert.equal(decide(c('T,5'), 11, S17, at(2)).action, 'R');
  assert.equal(decide(c('T,5'), 11, S17, at(1)).action, 'H');
  assert.equal(decide(c('T,6'), 11, NO_SUR, at(3)).action, 'S');
  assert.equal(decide(c('T,5'), 11, NO_SUR, at(5)).action, 'S');
  assert.equal(decide(c('T,5'), 11, NO_SUR, at(4)).action, 'H');
});

test('soft and pair deviations', () => {
  assert.equal(decide(c('A,8'), 4, H17, at(3)).action, 'D');
  assert.equal(decide(c('A,8'), 5, H17, at(1)).action, 'D');
  assert.equal(decide(c('A,8'), 6, H17, at(0, -1)).action, 'S');
  assert.equal(decide(c('A,8'), 6, H17, at(0, 0)).action, 'D');
  assert.equal(decide(c('A,8'), 6, S17, at(1)).action, 'D');
  assert.equal(decide(c('A,8'), 6, S17, at(0)).action, 'S');
  assert.equal(decide(c('A,6'), 2, H17, at(1)).action, 'D');
  assert.equal(decide(c('K,Q'), 6, H17, at(4)).action, 'P');
  assert.equal(decide(c('K,Q'), 5, H17, at(4)).action, 'S');
  assert.equal(decide(c('K,Q'), 4, H17, at(6)).action, 'P');
  assert.equal(decide(c('8,3'), 11, S17, at(1)).action, 'D');
  assert.equal(decide(c('8,3'), 11, S17, at(0)).action, 'H');
});

test('insurance at +3', () => {
  assert.equal(shouldInsure(H17, { tc: 3, rc: 9 }), true);
  assert.equal(shouldInsure(H17, { tc: 2, rc: 9 }), false);
});

test('rule filtering', () => {
  assert.ok(deviationsFor(NO_SUR).every((d) => d.kind !== 'surrender'));
  assert.ok(deviationsFor(S17).every((d) => d.rules !== 'h17'));
  const ids = deviationsFor(H17).map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('generated deviation drills put the deviation on the table', () => {
  const rng = mulberry32(7);
  const DD = { ...H17, decks: 2 };
  for (const rules of [H17, S17, NO_SUR, DD, { ...DD, h17: false }, { ...H17, expanded: true }, { ...S17, expanded: true }, { ...DD, expanded: true }]) {
    for (const d of activeDeviations(rules)) {
      for (let k = 0; k < 40; k++) {
        const count = countAround(d, rules, rng);
        const { cards, up } = deviationHand(d, rules, rng);
        assert.ok(cards && up, d.id);
        if (d.kind === 'insurance') continue;
        const res = decide(cards, up, rules, { count });
        const fired = isTriggered(d, count);
        assert.equal(res.deviation?.id === d.id, fired, `${d.id} tc=${count.tc} rc=${count.rc}`);
      }
    }
  }
});

test('expanded plays never change the answer without a count', () => {
  const exp = { ...H17, expanded: true };
  assert.equal(decide(c('T,3'), 3, exp).action, 'S');
  assert.equal(decide(c('T,3'), 3, exp, at(-3)).action, 'H', 'expanded 13 v 3 hits at -3');
  assert.equal(decide(c('T,3'), 3, H17, at(-3)).action, 'S', 'not in the BJA set');
  const ids = activeDeviations(exp).map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

// (BJA's own H17 15 v A surrender at -1+ does fire at TC 0; it is effectively basic strategy.)
test('computed plays never fire at a neutral count', () => {
  for (const rules of [{ ...H17, expanded: true }, { ...S17, expanded: true }, { ...H17, decks: 2, expanded: true }, { ...S17, decks: 2, expanded: true }]) {
    for (const d of activeDeviations(rules)) {
      if (d.kind === 'insurance' || d.source !== 'model') continue;
      assert.equal(isTriggered(d, { tc: 0, rc: 0 }), false, `${d.id} fires at TC 0 / RC 0`);
    }
  }
});
