import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../engine/strategy.js';
import { handInfo } from '../engine/hand.js';
import { DEFAULT_RULES } from '../engine/rules.js';
import { composeHard } from '../engine/scenarios.js';

const c = (s) => s.split(',').map((r) => ({ rank: r, suit: '♠' }));
const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const H17 = { ...DEFAULT_RULES, surrender: false };
const S17 = { ...H17, h17: false };

// Expected results are the user's chart read cell by cell, as actions with doubling allowed.
// P = split, H/S/D. Y/N cells are P here (DAS on).
const PAIR_GRID = {
  'A,A': 'P P P P P P P P P P',
  'T,T': 'S S S S S S S S S S',
  '9,9': 'P P P P P N P P S S',
  '8,8': 'P P P P P P P P P P',
  '7,7': 'P P P P P P H H H H',
  '6,6': 'P P P P P H H H H H',
  '5,5': 'D D D D D D D D H H',
  '4,4': 'H H H P P H H H H H',
  '3,3': 'P P P P P P H H H H',
  '2,2': 'P P P P P P H H H H',
};
const SOFT_GRID = {
  'A,9': 'S S S S S S S S S S',
  'A,8': 'S S S S D S S S S S',
  'A,7': 'D D D D D S S H H H',
  'A,6': 'H D D D D H H H H H',
  'A,5': 'H H D D D H H H H H',
  'A,4': 'H H D D D H H H H H',
  'A,3': 'H H H D D H H H H H',
  'A,2': 'H H H D D H H H H H',
};
const HARD_GRID = {
  17: 'S S S S S S S S S S',
  16: 'S S S S S H H H H H',
  15: 'S S S S S H H H H H',
  14: 'S S S S S H H H H H',
  13: 'S S S S S H H H H H',
  12: 'H H S S S H H H H H',
  11: 'D D D D D D D D D D',
  10: 'D D D D D D D D H H',
  9: 'H D D D D H H H H H',
  8: 'H H H H H H H H H H',
};
const HARD_HANDS = { 17: 'T,7', 16: 'T,6', 15: 'T,5', 14: 'T,4', 13: 'T,3', 12: 'T,2', 11: '8,3', 10: '6,4', 9: '6,3', 8: '5,3' };

function checkGrid(grid, handFor, rules) {
  for (const [label, rowStr] of Object.entries(grid)) {
    const expected = rowStr.split(' ');
    UPS.forEach((up, i) => {
      const want = expected[i] === 'N' ? 'S' : expected[i];
      const got = decide(c(handFor(label)), up, rules).action;
      assert.equal(got, want, `${label} v ${up}`);
    });
  }
}

test('H17 pairs match the chart', () => checkGrid(PAIR_GRID, (l) => l, H17));
test('H17 soft totals match the chart', () => checkGrid(SOFT_GRID, (l) => l, H17));
test('H17 hard totals match the chart', () => checkGrid(HARD_GRID, (l) => HARD_HANDS[l], H17));

test('late surrender cells', () => {
  const r = DEFAULT_RULES;
  for (const up of UPS) {
    assert.equal(decide(c('T,6'), up, r).action === 'R', [9, 10, 11].includes(up), `16 v ${up}`);
    assert.equal(decide(c('T,5'), up, r).action === 'R', up === 10, `15 v ${up}`);
    assert.equal(decide(c('T,7'), up, r).action === 'R', up === 11, `17 v ${up} (H17)`);
    assert.notEqual(decide(c('T,4'), up, r).action, 'R');
  }
  assert.equal(decide(c('8,8'), 10, r).action, 'P', '8,8 splits before surrender');
  assert.equal(decide(c('T,4,2'), 10, r).action, 'H', 'no surrender on 3 cards');
  assert.equal(decide(c('T,7'), 11, { ...r, h17: false }).action, 'S', 'S17 17 v A stands');
});

test('S17 differences', () => {
  assert.equal(decide(c('8,3'), 11, S17).action, 'H');
  assert.equal(decide(c('A,8'), 6, S17).action, 'S');
  assert.equal(decide(c('A,8'), 6, H17).action, 'D');
});

test('fallbacks when doubling or DAS is unavailable', () => {
  assert.equal(decide(c('A,2,5'), 3, H17).action, 'S', 'soft 18 Ds -> stand with 3 cards');
  assert.equal(decide(c('A,2,3'), 5, H17).action, 'H', 'soft 16 D -> hit with 3 cards');
  assert.equal(decide(c('5,4,2'), 6, H17).action, 'H', 'hard 11 3-card -> hit');
  const ndas = { ...H17, das: false };
  assert.equal(decide(c('4,4'), 5, ndas).action, 'H');
  assert.equal(decide(c('2,2'), 2, ndas).action, 'H');
  assert.equal(decide(c('6,6'), 2, ndas).action, 'H');
  assert.equal(decide(c('6,6'), 3, ndas).action, 'P');
  const noDoubleAfterSplit = decide(c('6,5'), 6, ndas, { afterSplit: true });
  assert.equal(noDoubleAfterSplit.action, 'H');
});

test('hand totals', () => {
  assert.deepEqual([handInfo(c('A,A')).total, handInfo(c('A,A')).soft], [12, true]);
  assert.deepEqual([handInfo(c('A,6,T')).total, handInfo(c('A,6,T')).soft], [17, false]);
  assert.equal(handInfo(c('A,K')).blackjack, true);
  assert.equal(handInfo(c('K,Q')).pair, 10);
  assert.equal(handInfo(c('K,Q,5')).bust, true);
  assert.equal(handInfo(c('A,A,9')).total, 21);
});

test('composeHard produces the requested non-pair total', () => {
  for (let t = 5; t <= 19; t++) for (const n of [2, 3]) {
    if (n === 3 && t < 6) continue;
    const cards = composeHard(t, n);
    assert.ok(cards, `compose ${t}/${n}`);
    const info = handInfo(cards);
    assert.equal(info.total, t);
    assert.equal(info.soft, false);
    if (n === 2) assert.equal(info.pair, null);
  }
});

test('double-deck chart differences (Wizard of Odds 2D)', () => {
  const dd = { ...DEFAULT_RULES, decks: 2 };
  const dds17 = { ...dd, h17: false };
  assert.equal(decide(c('6,6'), 2, { ...dd, das: false }).action, 'P', '6,6 v 2 splits even without DAS');
  assert.equal(decide(c('6,6'), 7, dd).action, 'P');
  assert.equal(decide(c('7,7'), 8, dd).action, 'P');
  assert.equal(decide(c('7,7'), 8, { ...dd, das: false }).action, 'H');
  assert.equal(decide(c('8,3'), 11, dds17).action, 'D');
  assert.equal(decide(c('A,7'), 2, dds17).action, 'S');
  assert.equal(decide(c('T,6'), 9, dd).action, 'H', 'no 16 v 9 surrender in DD');
  assert.equal(decide(c('T,5'), 11, dd).action, 'R');
  assert.equal(decide(c('T,5'), 11, dds17).action, 'H');
  assert.equal(decide(c('8,8'), 11, { ...dd, das: false }).action, 'R');
  assert.equal(decide(c('8,8'), 11, dd).action, 'P');
  assert.equal(decide(c('8,8'), 11, { ...DEFAULT_RULES, das: false }).action, 'P', 'shoe game still splits');
});

test('8 decks uses the shoe chart', () => {
  const r8 = { ...DEFAULT_RULES, decks: 8 };
  assert.equal(decide(c('T,6'), 9, r8).action, 'R');
  assert.equal(decide(c('6,6'), 7, r8).action, 'H');
});
