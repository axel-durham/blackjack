// Defaults match the Blackjack Apprenticeship chart the trainer is built around:
// 6 decks, dealer hits soft 17, double after split, late surrender.
export const DEFAULT_RULES = Object.freeze({
  h17: true,
  das: true,
  surrender: true,
  decks: 6,
  penetration: 0.75,
});

export function rulesLabel(r) {
  return [
    `${r.decks}D`,
    r.h17 ? 'H17' : 'S17',
    r.das ? 'DAS' : 'NDAS',
    r.surrender ? 'LS' : 'no surrender',
  ].join(' · ');
}
