export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const TEN_RANKS = ['T', 'J', 'Q', 'K'];

// Blackjack value with aces as 1; hand.js promotes one ace to 11 when it fits.
export function rankValue(rank) {
  if (rank === 'A') return 1;
  if (TEN_RANKS.includes(rank)) return 10;
  return Number(rank);
}

// Dealer upcard / pair key: 2..10, ace = 11.
export function upValue(card) {
  const rank = typeof card === 'string' ? card : card.rank;
  return rank === 'A' ? 11 : rankValue(rank);
}

export function hiLo(card) {
  const v = rankValue(typeof card === 'string' ? card : card.rank);
  if (v >= 2 && v <= 6) return 1;
  if (v === 10 || v === 1) return -1;
  return 0;
}

export function isRed(card) {
  return card.suit === '♥' || card.suit === '♦';
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function makeCard(rank, rng = Math.random) {
  return { rank, suit: pick(rng, SUITS) };
}

// A card of the given blackjack value (2..11); tens get a random ten-rank.
export function cardOfValue(value, rng = Math.random) {
  if (value === 11 || value === 1) return makeCard('A', rng);
  if (value === 10) return makeCard(pick(rng, TEN_RANKS), rng);
  return makeCard(String(value), rng);
}

export function buildDecks(decks) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  return cards;
}

export function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export class Shoe {
  constructor(decks = 6, penetration = 0.75, rng = Math.random) {
    this.decks = decks;
    this.penetration = penetration;
    this.rng = rng;
    this.shuffle();
  }

  shuffle() {
    this.cards = shuffle(buildDecks(this.decks), this.rng);
    this.dealt = 0;
    this.cutIndex = Math.round(this.cards.length * this.penetration);
  }

  draw() {
    if (this.dealt >= this.cards.length) throw new Error('Shoe is empty');
    return this.cards[this.dealt++];
  }

  get remaining() {
    return this.cards.length - this.dealt;
  }

  get pastCut() {
    return this.dealt >= this.cutIndex;
  }
}
