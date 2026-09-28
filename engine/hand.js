import { rankValue, upValue } from './cards.js';

export function handInfo(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = rankValue(c.rank);
    total += v;
    if (v === 1) aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  if (soft) total += 10;
  const pair = cards.length === 2 && upValue(cards[0]) === upValue(cards[1]) ? upValue(cards[0]) : null;
  return {
    total,
    soft,
    pair,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}

export function describeHand(cards) {
  const { total, soft, pair } = handInfo(cards);
  if (pair) return pair === 11 ? 'A,A' : pair === 10 ? 'T,T' : `${pair},${pair}`;
  return `${soft ? 'Soft' : 'Hard'} ${total}`;
}

export const upLabel = (up) => (up === 11 ? 'A' : String(up));
