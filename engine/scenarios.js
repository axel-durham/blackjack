import { cardOfValue, makeCard, randInt, pick } from './cards.js';
import { handInfo } from './hand.js';
import { UPS, charts } from './tables.js';
import { activeDeviations } from './active.js';
import { trueCount } from './count.js';

// Random non-ace cards (values 2..10) summing to `total`. Two-card hands are never pairs.
export function composeHard(total, n, rng = Math.random) {
  for (let tries = 0; tries < 500; tries++) {
    const vals = [];
    let left = total;
    for (let i = 0; i < n - 1; i++) {
      const maxV = Math.min(10, left - 2 * (n - 1 - i));
      if (maxV < 2) break;
      const v = randInt(rng, 2, maxV);
      vals.push(v);
      left -= v;
    }
    if (vals.length !== n - 1 || left < 2 || left > 10) continue;
    vals.push(left);
    if (n === 2 && vals[0] === vals[1]) continue;
    return vals.map((v) => cardOfValue(v, rng));
  }
  return null;
}

// Soft hand: an ace plus non-ace cards summing to total - 11.
export function composeSoft(total, n, rng = Math.random) {
  const rest = total - 11;
  if (n === 2) return rest >= 2 && rest <= 9 ? [makeCard('A', rng), cardOfValue(rest, rng)] : null;
  const others = composeHard(rest, n - 1, rng);
  return others ? [makeCard('A', rng), ...others] : null;
}

export const pairOf = (value, rng = Math.random) => [cardOfValue(value, rng), cardOfValue(value, rng)];

const weightOf = (stat) => {
  if (!stat || stat.n === 0) return 3;
  const err = stat.wrong / stat.n;
  return 1 + 8 * err + (stat.n < 3 ? 1.5 : 0);
};

// Mistake-weighted choice: situations you miss (or haven't seen) come up more often.
export function weightedPick(items, keyOf, stats = {}, rng = Math.random) {
  const weights = items.map((it) => weightOf(stats[keyOf(it)]));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export const situationKey = (table, key, up) => `${table}:${key}:${up}`;

// Every cell of the chart for the current rules, tagged by category for filtering.
export function basicSituations(rules) {
  const chart = charts(rules);
  const out = [];
  for (const up of UPS) {
    for (let t = 5; t <= 17; t++) out.push({ cat: 'hard', table: 'hard', key: t, up });
    for (let t = 13; t <= 20; t++) out.push({ cat: 'soft', table: 'soft', key: t, up });
    for (const p of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) out.push({ cat: 'pairs', table: 'pairs', key: p, up });
  }
  if (rules.surrender) {
    for (const up of [8, 9, 10, 11]) for (const t of [14, 15, 16, 17]) {
      out.push({ cat: 'surrender', table: 'surrender', key: t, up, inChart: !!chart.surrender[t]?.includes(up) });
    }
  }
  return out;
}

export function basicHand(sit, rng = Math.random) {
  const up = cardOfValue(sit.up, rng);
  let cards;
  if (sit.table === 'pairs') cards = pairOf(sit.key, rng);
  else if (sit.table === 'soft') cards = rng() < 0.15 && sit.key - 11 >= 4 ? composeSoft(sit.key, 3, rng) : composeSoft(sit.key, 2, rng);
  else if (sit.table === 'surrender') cards = composeHard(sit.key, 2, rng);
  else {
    const multi = rng() < 0.15 && sit.key >= 7;
    cards = composeHard(sit.key, multi ? 3 : 2, rng) ?? composeHard(sit.key, 2, rng);
  }
  return { cards, up };
}

const between = (rng, lo, hi) => randInt(rng, Math.min(lo, hi), Math.max(lo, hi));

// Count situation around a deviation: roughly half the time on the deviating side.
export function countAround(d, rules, rng = Math.random) {
  const fire = rng() < 0.55;
  const minDecks = rules.decks <= 2 ? 0.5 : 1;
  const maxDecks = Math.max(minDecks, rules.decks - 0.5);
  const halfSteps = [];
  for (let x = minDecks; x <= maxDecks; x += 0.5) halfSteps.push(x);
  const decks = pick(rng, halfSteps);
  if (d.basis === 'rc') {
    let rc;
    if (d.dir === '+') rc = fire ? between(rng, 1, 9) : between(rng, -9, 0);
    else rc = fire ? between(rng, -9, -1) : between(rng, 0, 9);
    return { rc, decks, tc: trueCount(rc, decks) };
  }
  let tc;
  if (d.dir === '+') tc = fire ? between(rng, d.index, d.index + 3) : between(rng, d.index - 3, d.index - 1);
  else tc = fire ? between(rng, d.index - 3, d.index) : between(rng, d.index + 1, d.index + 3);
  const lo = Math.ceil(tc * decks);
  const hi = Math.ceil((tc + 1) * decks) - 1;
  const rc = between(rng, lo, Math.max(lo, hi));
  return { rc, decks, tc: trueCount(rc, decks) };
}

// A hand that exercises deviation `d`. Hard 14-17 use three cards when surrender would
// otherwise pre-empt the play being drilled.
export function deviationHand(d, rules, rng = Math.random) {
  const up = cardOfValue(d.up, rng);
  if (d.kind === 'insurance') {
    const cards = rng() < 0.2 ? [makeCard('A', rng), cardOfValue(10, rng)] : composeHard(randInt(rng, 8, 19), 2, rng);
    return { cards, up: makeCard('A', rng) };
  }
  if (d.kind === 'pair') return { cards: pairOf(d.key, rng), up };
  if (d.kind === 'soft') return { cards: composeSoft(d.key, 2, rng), up };
  if (d.kind === 'surrender') return { cards: composeHard(d.key, 2, rng), up };
  const surrenderShadow = rules.surrender && d.key >= 14 && d.key <= 17;
  const cards = surrenderShadow ? composeHard(d.key, 3, rng) : composeHard(d.key, 2, rng);
  return { cards, up };
}

export function deviationSituations(rules) {
  return activeDeviations(rules);
}

// Sanity helper for tests: which total a generated hand really has.
export const totalOf = (cards) => handInfo(cards).total;
