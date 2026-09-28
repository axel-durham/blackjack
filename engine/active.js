import { DEVIATIONS, deviationsFor, decorate, isTriggered } from './deviations.js';
import { COMPUTED } from './computed.js';
import { isDoubleDeck } from './tables.js';

const sameSpot = (a, b) => a.kind === b.kind && a.key === b.key && a.up === b.up;
const cache = new Map();

// Soft doubles on 18+ fall back to standing, like the chart's Ds cells.
const normalize = (d) => (d.kind === 'soft' && d.code === 'D' && d.key >= 18 ? { ...d, code: 'Ds' } : d);

/**
 * The index plays in force for these rules.
 *  - 4-8 decks: Blackjack Apprenticeship's published H17/S17 set; with rules.expanded,
 *    plus model-computed plays for every other cell that flips between TC -3 and +6.
 *  - 1-2 decks: model-computed indices (BJA doesn't publish a double-deck chart); the
 *    core set covers the same spots as BJA's chart, expanded adds the rest.
 */
export function activeDeviations(rules) {
  const key = `${rules.decks <= 2 ? 'dd' : 'shoe'}|${rules.h17}|${rules.surrender}|${!!rules.expanded}`;
  if (cache.has(key)) return cache.get(key);
  const tag = rules.h17 ? 'h17' : 's17';
  const computed = COMPUTED[`${isDoubleDeck(rules) ? 'dd' : 'shoe'}-${tag}`].map((d) => decorate(normalize(d), 'model'));
  let list;
  if (isDoubleDeck(rules)) {
    const core = computed.filter((d) => DEVIATIONS.some((b) => sameSpot(b, d)));
    list = rules.expanded ? computed : core;
  } else {
    const bja = deviationsFor({ ...rules, surrender: true });
    list = rules.expanded ? [...bja, ...computed.filter((d) => !bja.some((b) => sameSpot(b, d)))] : bja;
  }
  list = list.filter((d) => rules.surrender || d.kind !== 'surrender');
  cache.set(key, list);
  return list;
}

export function shouldInsure(rules, count) {
  const ins = activeDeviations(rules).find((d) => d.kind === 'insurance');
  return isTriggered(ins, count);
}
