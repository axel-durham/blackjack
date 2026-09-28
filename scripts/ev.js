// Blackjack EV model with Hi-Lo count skew. Dev tooling only: used to cross-check the
// published charts and to derive index plays the published charts don't cover.
//
// Card index 1..10 (1 = ace, 10 = any ten). A shoe with `decks` decks remaining at
// true count t has t*decks/2 fewer low cards (2-6) and as many more high cards (tens and
// aces in their natural 16:4 ratio). The player's cards and dealer upcard are removed,
// which captures most of the deck-count effect; draws within a hand don't deplete further.

export function shoeProbs(tc, decks, removed = []) {
  const n = Array(11).fill(0);
  for (let v = 2; v <= 9; v++) n[v] = 4 * decks;
  n[10] = 16 * decks;
  n[1] = 4 * decks;
  const shift = (tc * decks) / 2;
  for (let v = 2; v <= 6; v++) n[v] -= shift / 5;
  n[10] += shift * 0.8;
  n[1] += shift * 0.2;
  for (const v of removed) n[v] -= 1;
  const total = n.reduce((a, b) => a + b, 0);
  return n.map((c) => Math.max(0, c) / total);
}

const add = (total, soft, v) => {
  let t = total + v;
  let s = soft;
  if (v === 1 && t + 10 <= 21) {
    t += 10;
    s = true;
  }
  if (t > 21 && s) {
    t -= 10;
    s = false;
  }
  return [t, s];
};

// Dealer final-total distribution {17..21, 22 = bust}, conditioned on no dealer blackjack.
export function dealerDist(up, p, h17) {
  const memo = new Map();
  const go = (total, soft) => {
    const key = total * 2 + (soft ? 1 : 0);
    if (memo.has(key)) return memo.get(key);
    const out = [0, 0, 0, 0, 0, 0];
    if (total > 21) out[5] = 1;
    else if (total > 17 || (total === 17 && !(soft && h17))) out[total - 17] = 1;
    else {
      for (let v = 1; v <= 10; v++) {
        const [t, s] = add(total, soft, v);
        const sub = go(t, s);
        for (let k = 0; k < 6; k++) out[k] += p[v] * sub[k];
      }
    }
    memo.set(key, out);
    return out;
  };
  const [t0, s0] = up === 1 ? [11, true] : [up, false];
  const out = [0, 0, 0, 0, 0, 0];
  const banned = up === 1 ? 10 : up === 10 ? 1 : 0;
  const norm = 1 - (banned ? p[banned] : 0);
  for (let v = 1; v <= 10; v++) {
    if (v === banned) continue;
    const [t, s] = add(t0, s0, v);
    const sub = go(t, s);
    for (let k = 0; k < 6; k++) out[k] += (p[v] / norm) * sub[k];
  }
  return out;
}

// EVs of each option for one starting hand against one upcard, with probabilities p.
export function handOptions(p, up, h17, { total, soft, pairCard = null, das = true }) {
  const d = dealerDist(up, p, h17);
  const standMemo = new Map();
  const hitMemo = new Map();
  const stand = (t) => {
    if (t > 21) return -1;
    if (standMemo.has(t)) return standMemo.get(t);
    let ev = d[5];
    for (let f = 17; f <= 21; f++) ev += d[f - 17] * (t > f ? 1 : t < f ? -1 : 0);
    standMemo.set(t, ev);
    return ev;
  };
  const best = (t, s) => (t > 21 ? -1 : Math.max(stand(t), hit(t, s)));
  const hit = (t, s) => {
    const key = t * 2 + (s ? 1 : 0);
    if (hitMemo.has(key)) return hitMemo.get(key);
    let ev = 0;
    for (let v = 1; v <= 10; v++) {
      const [t2, s2] = add(t, s, v);
      ev += p[v] * best(t2, s2);
    }
    hitMemo.set(key, ev);
    return ev;
  };
  const double = (t, s) => {
    let ev = 0;
    for (let v = 1; v <= 10; v++) ev += p[v] * 2 * stand(add(t, s, v)[0]);
    return ev;
  };
  const o = { S: stand(total), H: hit(total, soft), D: double(total, soft) };
  if (pairCard) {
    const [t0, s0] = pairCard === 1 ? [11, true] : [pairCard, false];
    let one = 0;
    for (let v = 1; v <= 10; v++) {
      const [t, s] = add(t0, s0, v);
      if (pairCard === 1) one += p[v] * stand(t);
      else one += p[v] * Math.max(best(t, s), das ? double(t, s) : -Infinity);
    }
    o.P = 2 * one;
  }
  return o;
}

// Two-card compositions (card values, 1 = ace) for a chart row, with shoe-frequency weights.
export function compositions(table, key) {
  const w = (v) => (v === 10 ? 4 : 1);
  if (table === 'pairs') return [{ cards: [key === 11 ? 1 : key, key === 11 ? 1 : key], weight: 1 }];
  if (table === 'soft') return [{ cards: [1, key - 11], weight: 1 }];
  const out = [];
  for (let a = 2; a <= 10; a++) for (let b = a + 1; b <= 10; b++) {
    if (a + b === key) out.push({ cards: [a, b], weight: w(a) * w(b) });
  }
  return out;
}

/**
 * Weighted-average option EVs for a chart cell at a true count.
 * table: hard | soft | pairs | surrender. up: 2..11 (11 = ace).
 */
export function cellOptions(table, key, up, tc, rules) {
  const upCard = up === 11 ? 1 : up;
  const remaining = rules.remaining ?? rules.decks;
  const rowTable = table === 'surrender' ? 'hard' : table;
  const comps = compositions(rowTable, key);
  const acc = {};
  let wsum = 0;
  for (const { cards, weight } of comps) {
    const p = shoeProbs(tc, remaining, [...cards, upCard]);
    const pair = table === 'pairs';
    const aces = cards.filter((c) => c === 1).length;
    let total = cards[0] + cards[1];
    let soft = false;
    if (aces && total + 10 <= 21) {
      total += 10;
      soft = true;
    }
    const o = handOptions(p, upCard, rules.h17, { total, soft, pairCard: pair ? cards[0] : null, das: rules.das });
    if (table === 'surrender') o.R = -0.5;
    for (const k in o) acc[k] = (acc[k] ?? 0) + weight * o[k];
    wsum += weight;
  }
  for (const k in acc) acc[k] /= wsum;
  return acc;
}

export function insuranceEV(tc, rules) {
  const p = shoeProbs(tc, rules.remaining ?? rules.decks, [1]);
  return 2 * p[10] - (1 - p[10]);
}

export const argmax = (o) => Object.entries(o).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
