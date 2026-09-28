import { h, cardsEl, trayEl } from '../ui.js';
import { handInfo } from '../engine/hand.js';

const RESULT_TEXT = { win: 'Win', lose: 'Lose', push: 'Push', blackjack: 'BJ', surrender: 'Surr' };

function totalText(cards) {
  if (!cards.length) return '';
  const info = handInfo(cards);
  if (info.bust) return `Bust ${info.total}`;
  if (info.blackjack) return 'Blackjack';
  return info.soft && info.total < 21 ? `${info.total - 10}/${info.total}` : String(info.total);
}

/**
 * Multi-seat table. opts: hero (seat index), turn { seat, hand }, totals (show hand totals),
 * showBets, names (seat labels).
 */
export function tableEl(table, opts = {}) {
  const { dealer } = table;
  const dealerCards = cardsEl(dealer.cards, { size: '', overlap: dealer.cards.length > 3, hideIndex: dealer.holeHidden ? 1 : -1 });
  const dealerTotal = !dealer.holeHidden && dealer.cards.length ? totalText(dealer.cards) : '';
  const seated = table.seats.map((s, i) => ({ s, i })).filter(({ s, i }) => opts.allSeats || s.hands.length || i === opts.hero);
  const cols = seated.length <= 2 ? seated.length || 1 : seated.length === 4 ? 2 : 3;
  // Heads-up there is room for full-size cards.
  const solo = seated.length === 1;
  return h('div', { class: 'felt', style: { gap: '12px' } },
    h('div', { class: 'dealer-spot' },
      h('div', { class: 'spot-label' }, 'Dealer'),
      dealerCards,
      h('div', { class: 'hand-total', style: { minHeight: '1.2em' } }, opts.totals === false ? '' : dealerTotal)),
    h('div', { class: 'seats', style: { '--cols': cols } }, seated.map(({ s, i }) => {
      const hero = i === opts.hero;
      return h('div', { class: `seat ${hero ? 'hero' : ''} ${opts.turn?.seat === i ? 'active' : ''}` },
        h('div', { class: 'who' }, hero ? 'You' : opts.names?.[i] ?? `Seat ${i + 1}`),
        h('div', { class: 'hands' }, s.hands.map((hand, hi) => h('div', { class: `hand ${opts.turn?.seat === i && opts.turn?.hand === hi && s.hands.length > 1 ? 'current' : ''}` },
          cardsEl(hand.cards, solo ? { overlap: hand.cards.length > 3 } : { size: 'sm', overlap: true }),
          h('div', { class: 'tot' }, opts.totals === false && !hand.result ? '' : totalText(hand.cards)),
          hand.result
            ? h('span', { class: `res ${hand.result}` }, RESULT_TEXT[hand.result])
            : opts.showBets && h('span', { class: 'bet-chip' }, opts.unit ? `$${Math.round(hand.bet * opts.unit)}` : `${hand.bet}u`)))));
    })));
}

export function shoeInfo(table, rules, { showCount = false, compact = false } = {}) {
  const played = rules.decks - table.shoe.remaining / 52;
  return h('div', { class: 'count-strip', style: { alignItems: 'center', padding: compact ? '6px 12px' : null } },
    trayEl(Math.round(played * 2) / 2, rules.decks, { compact }),
    h('div', { class: 'metric' }, h('span', { class: 'k' }, 'Round'), h('span', { class: 'v' }, String(table.round))),
    showCount && h('div', { class: 'metric' }, h('span', { class: 'k' }, 'RC / TC'), h('span', { class: 'v' }, `${table.rc} / ${table.tc}`)));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
