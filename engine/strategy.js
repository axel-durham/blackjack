import { upValue } from './cards.js';
import { handInfo } from './hand.js';
import { charts, col, softCode, hardCode } from './tables.js';
import { isTriggered } from './deviations.js';
import { activeDeviations } from './active.js';

export const ACTIONS = {
  H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender',
};

// Legal moves for a hand in play. afterSplit disables surrender and gates doubling on DAS.
export function legalActions(cards, rules, { afterSplit = false, canSplitMore = true, splitAces = false } = {}) {
  const two = cards.length === 2;
  const info = handInfo(cards);
  if (splitAces) return { H: false, S: true, D: false, P: false, R: false };
  return {
    H: true,
    S: true,
    D: two && (!afterSplit || rules.das),
    P: two && info.pair !== null && canSplitMore,
    R: two && !afterSplit && rules.surrender,
  };
}

const resolve = (code, canDouble) => {
  if (code === 'D') return canDouble ? 'D' : 'H';
  if (code === 'Ds') return canDouble ? 'D' : 'S';
  return code;
};

/**
 * Correct play for `cards` against dealer `up` card.
 * opts.count = { tc, rc } enables deviations; omit it for pure basic strategy.
 * opts.legal overrides legalActions(). Returns the action plus where it came from.
 */
export function decide(cards, up, rules, opts = {}) {
  const u = typeof up === 'number' ? up : upValue(up);
  const legal = opts.legal ?? legalActions(cards, rules, opts);
  const chart = charts(rules);
  const info = handInfo(cards);
  const devs = opts.count ? activeDeviations(rules) : [];
  const find = (kind, key) => devs.find((d) => d.kind === kind && d.key === key && d.up === u);
  const fire = (d) => (d && isTriggered(d, opts.count) ? d : null);

  if (legal.P && legal.R && !rules.das && chart.pairSurrenderNoDas?.[info.pair]?.includes(u)) {
    return { action: 'R', code: 'SUR', table: 'surrender', key: info.total, deviation: null };
  }

  // A "don't split" / "don't surrender" index play falls through to the total's normal play.
  let declined = null;
  if (legal.P) {
    const code = chart.pairs[info.pair][col(u)];
    let split = code === 'Y' || (code === 'Y/N' && rules.das);
    const d = fire(find('pair', info.pair));
    if (d) split = d.code === 'P';
    if (split) return { action: 'P', code, table: 'pairs', key: info.pair, deviation: d };
    declined = d;
  }

  if (legal.R && !info.soft) {
    let sur = chart.surrender[info.total]?.includes(u) ?? false;
    const d = fire(find('surrender', info.total));
    if (d) sur = d.code === 'R';
    if (sur) return { action: 'R', code: 'SUR', table: 'surrender', key: info.total, deviation: d ?? declined };
    declined = d ?? declined;
  }

  let code;
  let d;
  if (info.soft) {
    code = softCode(chart, info.total, u);
    d = fire(find('soft', info.total));
  } else {
    code = hardCode(chart, info.total, u);
    d = fire(find('hard', info.total));
  }
  const table = info.soft ? 'soft' : 'hard';
  const finalCode = d ? d.code : code;
  return { action: resolve(finalCode, legal.D), code: finalCode, table, key: info.total, deviation: d ?? declined };
}
