import { hiLo } from './cards.js';

export const runningCount = (cards) => cards.reduce((sum, c) => sum + hiLo(c), 0);

// What a player reads off the discard tray: nearest half deck, never below half a deck.
export function decksRemaining(cardsRemaining) {
  return Math.max(0.5, Math.round(cardsRemaining / 26) / 2);
}

// BJA convention: floor the division (+2.9 -> +2, -0.5 -> -1).
export function trueCount(rc, decks) {
  return Math.floor(rc / Math.max(0.5, decks) + 1e-9);
}

// True counts a player could reasonably arrive at when eyeballing the tray (± half a deck).
export function plausibleTrueCounts(rc, decks) {
  const out = new Set();
  for (const d of [decks - 0.5, decks, decks + 0.5]) if (d >= 0.5) out.add(trueCount(rc, d));
  return [...out];
}

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
