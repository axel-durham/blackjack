// Basic strategy tables. Columns are dealer upcards 2,3,4,5,6,7,8,9,10,A.
// Shoe games (4-8 decks): H17 transcribed from the Blackjack Apprenticeship basic
// strategy chart; S17 differences from the BJA S17 chart. 8-deck strategy matches 6-deck.
export const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const col = (up) => up - 2;

const row = (s) => s.trim().split(/\s+/);
const all = (code) => row(Array(10).fill(code).join(' '));

// Pair key is the card value (A = 11). Codes: Y split, Y/N split only with DAS, N don't.
const PAIRS = {
  11: all('Y'),
  10: all('N'),
  9: row('Y Y Y Y Y N Y Y N N'),
  8: all('Y'),
  7: row('Y Y Y Y Y Y N N N N'),
  6: row('Y/N Y Y Y Y N N N N N'),
  5: all('N'),
  4: row('N N N Y/N Y/N N N N N N'),
  3: row('Y/N Y/N Y Y Y Y N N N N'),
  2: row('Y/N Y/N Y Y Y Y N N N N'),
};

// Soft totals keyed by total (A,2 = 13 ... A,9 = 20).
// Codes: H hit, S stand, D double else hit, Ds double else stand.
const SOFT_H17 = {
  20: all('S'),
  19: row('S S S S Ds S S S S S'),
  18: row('Ds Ds Ds Ds Ds S S H H H'),
  17: row('H D D D D H H H H H'),
  16: row('H H D D D H H H H H'),
  15: row('H H D D D H H H H H'),
  14: row('H H H D D H H H H H'),
  13: row('H H H D D H H H H H'),
};
const SOFT_S17 = { ...SOFT_H17, 19: all('S') };

const HARD_H17 = {
  17: all('S'),
  16: row('S S S S S H H H H H'),
  15: row('S S S S S H H H H H'),
  14: row('S S S S S H H H H H'),
  13: row('S S S S S H H H H H'),
  12: row('H H S S S H H H H H'),
  11: all('D'),
  10: row('D D D D D D D D H H'),
  9: row('H D D D D H H H H H'),
  8: all('H'),
};
const HARD_S17 = { ...HARD_H17, 11: row('D D D D D D D D D H') };

// Late surrender: total -> upcards. BJA's H17 chart adds 17 v A.
const SURRENDER_H17 = { 17: [11], 16: [9, 10, 11], 15: [10] };
const SURRENDER_S17 = { 16: [9, 10, 11], 15: [10] };

// Double deck (Wizard of Odds 2-deck charts). Differences from the shoe game:
// 6,6 v 2 always splits, 6,6 v 7 and 7,7 v 8 split with DAS; S17 doubles 11 v A and
// stands A,7 v 2; 16 v 9 is not a surrender; H17 surrenders 15 v A, and 8,8 v A when no DAS.
const DD_PAIRS = {
  ...PAIRS,
  7: row('Y Y Y Y Y Y Y/N N N N'),
  6: row('Y Y Y Y Y Y/N N N N N'),
  3: row('Y/N Y/N Y Y Y Y N N N N'),
  2: row('Y/N Y/N Y Y Y Y N N N N'),
};
const DD_SOFT_H17 = { ...SOFT_H17 };
const DD_SOFT_S17 = { ...SOFT_S17, 18: row('S Ds Ds Ds Ds S S H H H') };
const DD_HARD_H17 = { ...HARD_H17 };
const DD_HARD_S17 = { ...HARD_H17 };
const DD_SURRENDER_H17 = { 17: [11], 16: [10, 11], 15: [10, 11] };
const DD_SURRENDER_S17 = { 16: [10, 11], 15: [10] };

export const isDoubleDeck = (rules) => rules.decks <= 2;

export function charts(rules) {
  if (isDoubleDeck(rules)) {
    return rules.h17
      ? { pairs: DD_PAIRS, soft: DD_SOFT_H17, hard: DD_HARD_H17, surrender: DD_SURRENDER_H17, pairSurrenderNoDas: { 8: [11] } }
      : { pairs: DD_PAIRS, soft: DD_SOFT_S17, hard: DD_HARD_S17, surrender: DD_SURRENDER_S17 };
  }
  return rules.h17
    ? { pairs: PAIRS, soft: SOFT_H17, hard: HARD_H17, surrender: SURRENDER_H17 }
    : { pairs: PAIRS, soft: SOFT_S17, hard: HARD_S17, surrender: SURRENDER_S17 };
}

export function softCode(chart, total, up) {
  if (total >= 20) return 'S';
  if (total <= 12) return 'H';
  return chart.soft[total][col(up)];
}

export function hardCode(chart, total, up) {
  if (total >= 17) return 'S';
  if (total <= 8) return 'H';
  return chart.hard[total][col(up)];
}

// Chart code for any cell: pairs Y | Y/N | N, soft/hard H | S | D | Ds, surrender SUR | ''.
export function cellCode(table, key, up, rules) {
  const c = charts(rules);
  if (table === 'surrender') return c.surrender[key]?.includes(up) ? 'SUR' : '';
  return c[table][key][col(up)];
}
