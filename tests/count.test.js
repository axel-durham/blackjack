import test from 'node:test';
import assert from 'node:assert/strict';
import { Shoe, buildDecks, mulberry32, hiLo } from '../engine/cards.js';
import { runningCount, trueCount, decksRemaining, plausibleTrueCounts } from '../engine/count.js';
import { betUnits, betChoices, DEFAULT_RAMP } from '../engine/betting.js';
import { TableState, playRound } from '../engine/table.js';
import { handInfo } from '../engine/hand.js';
import { DEFAULT_RULES } from '../engine/rules.js';

test('a full deck counts to zero', () => {
  assert.equal(runningCount(buildDecks(1)), 0);
  assert.equal(runningCount(buildDecks(6)), 0);
  assert.equal(hiLo({ rank: '7' }), 0);
  assert.equal(hiLo({ rank: 'A' }), -1);
});

test('true count floors', () => {
  assert.equal(trueCount(9, 3), 3);
  assert.equal(trueCount(8, 3), 2);
  assert.equal(trueCount(-1, 2), -1);
  assert.equal(trueCount(-4, 2), -2);
  assert.equal(trueCount(0, 4), 0);
  assert.equal(trueCount(6, 1.5), 4);
  assert.deepEqual(plausibleTrueCounts(6, 2).sort(), [2, 3, 4].sort());
});

test('decks remaining rounds to half decks', () => {
  assert.equal(decksRemaining(312), 6);
  assert.equal(decksRemaining(150), 3);
  assert.equal(decksRemaining(10), 0.5);
});

test('bet ramp', () => {
  assert.equal(betUnits(-3), 1);
  assert.equal(betUnits(1), 1);
  assert.equal(betUnits(2), 2);
  assert.equal(betUnits(3), 4);
  assert.equal(betUnits(6), 10);
  assert.equal(betUnits(12), 10);
  const wong = { ...DEFAULT_RAMP, wongOut: true };
  assert.equal(betUnits(-1, wong), 0);
  assert.equal(betUnits(0, wong), 1);
  assert.deepEqual(betChoices(wong), [0, 1, 2, 4, 6, 8, 10]);
});

test('shoe cut card and conservation', () => {
  const shoe = new Shoe(2, 0.5, mulberry32(1));
  assert.equal(shoe.remaining, 104);
  for (let i = 0; i < 52; i++) shoe.draw();
  assert.equal(shoe.pastCut, true);
});

test('simulated rounds: running count matches visible cards and hands are legal', () => {
  const rules = DEFAULT_RULES;
  const shoe = new Shoe(6, 0.75, mulberry32(42));
  const table = new TableState(shoe, rules, 5);
  let rounds = 0;
  while (rounds < 400) {
    if (table.shuffleIfNeeded()) continue;
    const before = shoe.dealt;
    const rcBefore = table.rc;
    const seen = [];
    for (const ev of playRound(table, [1, 1, 0, 2, 1])) {
      if (ev.type === 'deal' && !ev.hidden) seen.push(ev.card);
      if (ev.type === 'reveal') seen.push(ev.card);
    }
    assert.equal(shoe.dealt - before, seen.length, 'every dealt card is eventually seen');
    assert.equal(table.rc - rcBefore, runningCount(seen));
    const d = handInfo(table.dealer.cards);
    for (const seat of table.seats) for (const hand of seat.hands) {
      assert.ok(hand.result, 'hand settled');
      assert.ok(hand.cards.length >= 2 || hand.fromAces === undefined);
    }
    assert.ok(d.total >= 17 || table.seats.every((s) => s.hands.every((h) => h.result !== 'win' || handInfo(h.cards).total > d.total)));
    rounds++;
  }
});

test('hero decisions are requested and honored', () => {
  const shoe = new Shoe(6, 0.75, mulberry32(3));
  const table = new TableState(shoe, DEFAULT_RULES, 3);
  let decisions = 0;
  for (let r = 0; r < 50; r++) {
    table.shuffleIfNeeded();
    const gen = playRound(table, [1, 1, 1], [1]);
    let step = gen.next();
    while (!step.done) {
      const ev = step.value;
      if (ev.type === 'decision') {
        decisions++;
        step = gen.next('S');
      } else if (ev.type === 'insurance') step = gen.next(false);
      else step = gen.next();
    }
    for (const hand of table.seats[1].hands) assert.ok(hand.cards.length <= 2 || hand.fromAces);
  }
  assert.ok(decisions > 30);
});
