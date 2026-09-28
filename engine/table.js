import { hiLo } from './cards.js';
import { handInfo } from './hand.js';
import { decide, legalActions } from './strategy.js';
import { decksRemaining, trueCount } from './count.js';

const MAX_HANDS = 4;

// Shared state for a shoe being dealt: visible cards update the running count.
export class TableState {
  constructor(shoe, rules, seats) {
    this.shoe = shoe;
    this.rules = rules;
    this.seatCount = seats;
    this.rc = 0;
    this.round = 0;
    this.reset();
  }

  reset() {
    this.dealer = { cards: [], holeHidden: true };
    this.seats = Array.from({ length: this.seatCount }, () => ({ hands: [] }));
  }

  shuffleIfNeeded() {
    // Also reshuffle if a full table might run the shoe dry (short double-deck pitch games).
    if (!this.shoe.pastCut && this.shoe.remaining > this.seatCount * 8 + 12) return false;
    this.shoe.shuffle();
    this.rc = 0;
    return true;
  }

  see(card) {
    this.rc += hiLo(card);
  }

  get decks() {
    return decksRemaining(this.shoe.remaining);
  }

  get tc() {
    return trueCount(this.rc, this.decks);
  }

  get dealerUp() {
    return this.dealer.cards[0];
  }
}

const newHand = (bet, extra = {}) => ({ cards: [], bet, doubled: false, done: false, result: null, net: 0, ...extra });

/**
 * Plays one round as a sequence of events. Seats listed in `heroSeats` yield
 * { type: 'decision' | 'insurance' } events and read the reply from next(value);
 * all other seats play basic strategy. `bets[i]` is the wager for seat i (0 = empty seat).
 */
export function* playRound(table, bets, heroSeats = []) {
  const { shoe, rules } = table;
  table.reset();
  table.round++;
  const isHero = (i) => heroSeats.includes(i);
  const active = [];
  bets.forEach((b, i) => {
    if (b > 0) {
      table.seats[i].hands = [newHand(b)];
      active.push(i);
    }
  });

  const deal = (hand, seat, hidden = false) => {
    const card = shoe.draw();
    hand.cards.push(card);
    if (!hidden) table.see(card);
    return { type: 'deal', seat, card, hidden };
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const i of active) yield deal(table.seats[i].hands[0], i);
    yield deal(table.dealer, -1, pass === 1);
  }

  const up = table.dealerUp;
  const hole = table.dealer.cards[1];
  const dealerBJ = handInfo(table.dealer.cards).blackjack;

  if (up.rank === 'A') {
    for (const i of active) {
      const hand = table.seats[i].hands[0];
      const take = isHero(i) ? yield { type: 'insurance', seat: i, hand } : false;
      if (take) {
        hand.insurance = hand.bet / 2;
        hand.insuranceNet = dealerBJ ? hand.bet : -hand.bet / 2;
      }
    }
  }

  const peek = up.rank === 'A' || handInfo([up]).total === 10;
  if (peek && dealerBJ) {
    table.dealer.holeHidden = false;
    table.see(hole);
    yield { type: 'reveal', card: hole, dealerBlackjack: true };
    for (const i of active) settle(table.seats[i].hands[0], table, true);
    yield { type: 'settle' };
    return;
  }

  for (const i of active) {
    const seat = table.seats[i];
    for (let h = 0; h < seat.hands.length; h++) {
      const hand = seat.hands[h];
      yield { type: 'turn', seat: i, hand: h };
      if (hand.cards.length === 1) yield deal(hand, i);
      if (hand.fromAces || (handInfo(hand.cards).blackjack && seat.hands.length === 1)) {
        hand.done = true;
        continue;
      }
      while (!hand.done) {
        const info = handInfo(hand.cards);
        if (info.total >= 21) break;
        const legal = legalActions(hand.cards, rules, {
          afterSplit: seat.hands.length > 1,
          canSplitMore: seat.hands.length < MAX_HANDS && !(hand.fromAces),
          splitAces: hand.fromAces,
        });
        const action = isHero(i)
          ? yield { type: 'decision', seat: i, hand: h, legal }
          : decide(hand.cards, up, rules, { legal }).action;
        if (action === 'S') break;
        if (action === 'R') {
          hand.surrendered = true;
          break;
        }
        if (action === 'D') {
          hand.doubled = true;
          hand.bet *= 2;
          yield deal(hand, i);
          break;
        }
        if (action === 'P') {
          const fromAces = hand.cards[0].rank === 'A';
          const moved = hand.cards.pop();
          const twin = newHand(hand.bet, { fromAces });
          hand.fromAces = fromAces;
          twin.cards.push(moved);
          seat.hands.splice(h + 1, 0, twin);
          yield { type: 'split', seat: i, hand: h };
          yield deal(hand, i);
          if (fromAces) break;
          continue;
        }
        yield deal(hand, i);
      }
      hand.done = true;
    }
  }

  table.dealer.holeHidden = false;
  table.see(hole);
  yield { type: 'reveal', card: hole, dealerBlackjack: false };

  const live = active.some((i) => table.seats[i].hands.some((hd) =>
    !hd.surrendered && !handInfo(hd.cards).bust && !(handInfo(hd.cards).blackjack && table.seats[i].hands.length === 1)));
  if (live) {
    for (;;) {
      const info = handInfo(table.dealer.cards);
      const hits = info.total < 17 || (info.total === 17 && info.soft && rules.h17);
      if (!hits) break;
      yield deal(table.dealer, -1);
    }
  }

  for (const i of active) for (const hand of table.seats[i].hands) settle(hand, table, false);
  yield { type: 'settle' };
}

function settle(hand, table, dealerBJ) {
  const seat = table.seats.find((s) => s.hands.includes(hand));
  const single = seat.hands.length === 1;
  const p = handInfo(hand.cards);
  const d = handInfo(table.dealer.cards);
  const bj = p.blackjack && single;
  let net;
  if (dealerBJ) net = bj ? 0 : -hand.bet;
  else if (hand.surrendered) net = -hand.bet / 2;
  else if (p.bust) net = -hand.bet;
  else if (bj) net = hand.bet * 1.5;
  else if (d.bust || p.total > d.total) net = hand.bet;
  else if (p.total < d.total) net = -hand.bet;
  else net = 0;
  hand.net = net + (hand.insuranceNet ?? 0);
  hand.result = dealerBJ && !bj ? 'lose'
    : hand.surrendered ? 'surrender'
      : bj ? (dealerBJ ? 'push' : 'blackjack')
        : net > 0 ? 'win' : net < 0 ? 'lose' : 'push';
}
