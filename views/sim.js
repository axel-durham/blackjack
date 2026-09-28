import { h, seg, keypad, toast, buzz, bindKeys, ACTION_KEYS } from '../ui.js';
import { settings, saveSettings, stats, saveStats, pct } from '../store.js';
import { Shoe } from '../engine/cards.js';
import { TableState, playRound } from '../engine/table.js';
import { decide } from '../engine/strategy.js';
import { shouldInsure } from '../engine/active.js';
import { plausibleTrueCounts, signed } from '../engine/count.js';
import { betUnits, betChoices } from '../engine/betting.js';
import { describeHand, upLabel } from '../engine/hand.js';
import { upValue } from '../engine/cards.js';
import { actionBar, actionName } from './common.js';
import { tableEl, shoeInfo, sleep } from './tableview.js';

export function render(root) {
  let alive = true;
  let session = null;
  const body = h('div', { class: 'view-body' });
  const barSlot = h('div', { class: 'bar-slot' });
  root.append(body, barSlot);
  setup();
  return () => {
    alive = false;
    if (session) session.cancelled = true;
  };

  function setup() {
    const o = settings.sim;
    o.showCount ??= false;
    o.betting ??= true;
    barSlot.replaceChildren();
    const draw = () => body.replaceChildren(
      h('div', null, h('h1', { style: { fontSize: '1.3rem' } }, 'Casino session'),
        h('p', { class: 'small muted' }, 'Play a real shoe at a full table: bet by the count, play with deviations, and answer surprise count checks. Every decision is graded.')),
      h('div', { class: 'panel' },
        h('div', { class: 'small muted' }, 'Other players'),
        seg([[0, 'Heads-up'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], o.players, (v) => { o.players = v; saveSettings(); draw(); }),
        h('div', { class: 'small muted' }, 'Dealing speed'),
        seg([[1, 'Slow'], [2, 'Casino'], [3, 'Fast']], o.speed > 3 ? 2 : o.speed, (v) => { o.speed = v; saveSettings(); draw(); }),
        h('label', { class: 'field' }, h('span', null, 'Betting', h('small', null, 'Off: flat 1-unit bets, no bet grading — just play the hands')),
          Object.assign(h('input', { type: 'checkbox', class: 'switch', onchange: (e) => { o.betting = e.target.checked; saveSettings(); } }), { checked: o.betting })),
        h('label', { class: 'field' }, h('span', null, 'Surprise count checks', h('small', null, 'Asked for the running count before some rounds')),
          Object.assign(h('input', { type: 'checkbox', class: 'switch', onchange: (e) => { o.checks = e.target.checked; saveSettings(); } }), { checked: !!o.checks })),
        h('label', { class: 'field' }, h('span', null, 'Show the count', h('small', null, 'Training wheels: display RC/TC on screen')),
          Object.assign(h('input', { type: 'checkbox', class: 'switch', onchange: (e) => { o.showCount = e.target.checked; saveSettings(); } }), { checked: !!o.showCount })),
        h('button', { class: 'btn primary block', onclick: play }, 'Sit down')),
      history());
    draw();
  }

  function history() {
    const hist = stats.sim.history.slice(-5).reverse();
    if (!hist.length) return null;
    return h('div', null, h('div', { class: 'section-title', style: { marginBottom: '8px' } }, 'Recent sessions'),
      h('div', { class: 'list' }, hist.map((s) => h('div', { class: 'li' },
        h('div', { class: 'grow' }, `${s.rounds} rounds · ${s.net >= 0 ? '+' : ''}${s.net}u`,
          h('div', { class: 'sub' }, `Plays ${pct(s.playOk, s.plays)} · Bets ${pct(s.betOk, s.bets)} · Counts ${pct(s.countOk, s.counts)}`)),
        h('span', { class: 'sub' }, new Date(s.ts).toLocaleDateString())))));
  }

  function play() {
    const rules = settings.rules;
    const ramp = settings.ramp;
    const o = settings.sim;
    const token = { cancelled: false };
    session = token;
    const seats = o.players + 1;
    const hero = Math.floor(seats / 2);
    const names = Array.from({ length: seats }, (_, i) => `P${i + 1}`);
    const table = new TableState(new Shoe(rules.decks, rules.penetration), rules, seats);
    const delay = [0, 750, 480, 260][o.speed] ?? 480;
    const s = { rounds: 0, net: 0, plays: 0, playOk: 0, bets: 0, betOk: 0, counts: 0, countOk: 0, curve: [0], mistakes: [] };
    let turn = null;

    const top = h('div');
    const felt = h('div');
    const panel = h('div');
    body.replaceChildren(top, felt, panel);
    const draw = () => {
      top.replaceChildren(shoeInfo(table, rules, { showCount: o.showCount, compact: true }),
        h('div', { class: 'statline', style: { marginTop: '8px' } },
          h('span', null, 'Net ', h('b', null, `${s.net >= 0 ? '+' : ''}${s.net}u`)),
          h('span', null, 'Plays ', h('b', null, pct(s.playOk, s.plays))),
          o.betting && h('span', null, 'Bets ', h('b', null, pct(s.betOk, s.bets))),
          h('span', null, 'Counts ', h('b', null, pct(s.countOk, s.counts)))));
      felt.replaceChildren(tableEl(table, { hero, turn, names, showBets: true, allSeats: true }));
    };
    const mistake = (text) => {
      s.mistakes.push(text);
      buzz(90);
      toast(text);
    };
    const waitFor = (build) => new Promise((resolve) => build(resolve));
    const acceptTcs = () => plausibleTrueCounts(table.rc, table.decks);

    (async () => {
      draw();
      while (!token.cancelled && alive) {
        if (table.shuffleIfNeeded()) {
          toast('♻ Shuffle: new shoe, count resets to 0.', true, 1800);
        }
        table.reset();
        turn = null;
        draw();

        // Surprise count check before the bet.
        if (o.checks && table.round > 0 && Math.random() < 0.3) {
          await waitFor((done) => {
            panel.replaceChildren();
            barSlot.replaceChildren(h('div', { style: { padding: '10px 16px 12px', background: 'var(--bg)', borderTop: '1px solid var(--line)' } }, keypad({
              question: 'Count check: running count?',
              onSubmit: (v) => {
                s.counts++;
                if (v === table.rc) {
                  s.countOk++;
                  toast(`✓ Running count ${signed(table.rc)}`, true, 1400);
                } else mistake(`Count check: it was ${signed(table.rc)}, you said ${signed(v)}.`);
                barSlot.replaceChildren();
                draw();
                done();
              },
            })));
          });
        }

        // Bet (flat 1 unit when betting practice is off).
        const tcNow = table.tc;
        const wants = new Set(acceptTcs().map((tc) => betUnits(tc, ramp)));
        const bet = !o.betting ? 1 : await waitFor((done) => {
          panel.replaceChildren(h('div', { class: 'small muted', style: { textAlign: 'center' } }, 'Place your bet'));
          barSlot.replaceChildren(h('div', { class: 'actions', style: { gridTemplateColumns: `repeat(${Math.min(betChoices(ramp).length, 4)}, 1fr)` } },
            betChoices(ramp).map((u) => h('button', { class: 'act chip', onclick: () => done(u) }, u === 0 ? 'Sit out' : `${u}u`)),
            h('button', { class: 'act H', onclick: () => done(null) }, 'Leave')));
        });
        if (bet === null) break;
        if (o.betting) {
          s.bets++;
          if (wants.has(bet)) s.betOk++;
          else mistake(`Bet: at TC ${signed(tcNow)} your ramp says ${betUnits(tcNow, ramp)}u, you bet ${bet}u.`);
        }
        barSlot.replaceChildren();
        panel.replaceChildren();

        const bets = Array.from({ length: seats }, (_, i) => (i === hero ? bet : 1));
        const gen = playRound(table, bets, [hero]);
        let step = gen.next();
        while (!step.done) {
          if (token.cancelled || !alive) return;
          const ev = step.value;
          if (ev.type === 'turn') {
            turn = { seat: ev.seat, hand: ev.hand };
            step = gen.next();
            continue;
          }
          if (ev.type === 'insurance') {
            draw();
            const take = await waitFor((done) => {
              barSlot.replaceChildren(h('div', { class: 'actions two' },
                h('button', { class: 'act yes', onclick: () => done(true) }, 'Insurance'),
                h('button', { class: 'act no', onclick: () => done(false) }, 'No insurance')));
            });
            const right = new Set(acceptTcs().map((tc) => shouldInsure(rules, { tc, rc: table.rc })));
            s.plays++;
            if (right.has(take)) s.playOk++;
            else mistake(`Insurance: take it at TC +3 or higher. TC was ${signed(table.tc)}.`);
            barSlot.replaceChildren();
            step = gen.next(take);
            continue;
          }
          if (ev.type === 'decision') {
            draw();
            requestAnimationFrame(() => felt.querySelector('.seat.hero')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
            const hand = table.seats[hero].hands[ev.hand];
            const up = table.dealerUp;
            const action = await waitFor((done) => {
              const bar = actionBar(ev.legal, done);
              barSlot.replaceChildren(bar.el);
              bindKeys(bar.el, (k) => {
                if (ACTION_KEYS[k] && ev.legal[ACTION_KEYS[k]]) { done(ACTION_KEYS[k]); return true; }
                return false;
              });
            });
            barSlot.replaceChildren();
            const count = { rc: table.rc, tc: table.tc };
            const exact = decide(hand.cards, up, rules, { legal: ev.legal, count });
            const ok = acceptTcs().some((tc) => decide(hand.cards, up, rules, { legal: ev.legal, count: { tc, rc: table.rc } }).action === action);
            s.plays++;
            if (ok) s.playOk++;
            else {
              const dv = exact.deviation;
              mistake(`${describeHand(hand.cards)} v ${upLabel(upValue(up))}: ${actionName(exact.action)}, not ${actionName(action)}.` +
                (dv ? ` Index play ${dv.title} (RC ${signed(count.rc)}, TC ${signed(count.tc)}).` : ' Basic strategy.'));
            }
            step = gen.next(action);
            continue;
          }
          if (ev.type !== 'settle' && ev.type !== 'split') {
            draw();
            await sleep(delay);
          }
          step = gen.next();
        }
        turn = null;
        s.rounds++;
        const net = table.seats[hero].hands.reduce((a, hd) => a + hd.net, 0);
        s.net += net;
        s.curve.push(s.net);
        draw();
        if (bet > 0) {
          panel.replaceChildren(h('div', { class: 'small', style: { textAlign: 'center', fontWeight: 700, color: net > 0 ? 'var(--good)' : net < 0 ? 'var(--bad)' : 'var(--muted)' } },
            net > 0 ? `+${net}u` : net < 0 ? `${net}u` : 'Push'));
        }
        await waitFor((done) => {
          barSlot.replaceChildren(h('div', { class: 'actions two' },
            h('button', { class: 'btn ghost', onclick: () => done('end') }, 'End session'),
            h('button', { class: 'btn primary', onclick: () => done('next') }, 'Next round')));
          bindKeys(barSlot.firstChild, (k) => { if (k === 'enter' || k === ' ') { done('next'); return true; } return false; });
        }).then((v) => { if (v === 'end') token.cancelled = true; });
      }
      summary(s);
    })();
  }

  function summary(s) {
    if (!alive) return;
    const rec = { ts: Date.now(), rounds: s.rounds, net: s.net, plays: s.plays, playOk: s.playOk, bets: s.bets, betOk: s.betOk, counts: s.counts, countOk: s.countOk };
    if (s.rounds) {
      stats.sim.history.push(rec);
      stats.sim.history = stats.sim.history.slice(-100);
      saveStats();
    }
    const metric = (k, v) => h('div', { class: 'metric' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
    body.replaceChildren(
      h('h1', { style: { fontSize: '1.3rem' } }, 'Session summary'),
      h('div', { class: 'summary-grid' },
        metric('Rounds', String(s.rounds)),
        metric('Result', `${s.net >= 0 ? '+' : ''}${s.net}u`),
        metric('Playing', pct(s.playOk, s.plays)),
        s.bets > 0 && metric('Betting', pct(s.betOk, s.bets)),
        metric('Count checks', `${s.countOk}/${s.counts}`),
        metric(`At $${settings.ramp.unit}/unit`, `${s.net * settings.ramp.unit >= 0 ? '+' : '−'}$${Math.abs(s.net * settings.ramp.unit)}`)),
      s.curve.length > 2 && spark(s.curve),
      s.mistakes.length
        ? h('div', null, h('div', { class: 'section-title', style: { marginBottom: '8px' } }, `Mistakes (${s.mistakes.length})`),
          h('div', { class: 'list' }, s.mistakes.slice(-30).map((m) => h('div', { class: 'li small' }, m))))
        : s.rounds > 0 && h('div', { class: 'feedback good' }, h('div', { class: 'fb-head' }, '✓ Perfect session')));
    barSlot.replaceChildren(h('div', { class: 'actions one' }, h('button', { class: 'btn primary', onclick: setup }, 'Done')));
  }
}

function spark(values) {
  const w = 300;
  const hgt = 70;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => hgt - 4 - ((v - min) / span) * (hgt - 8);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Bankroll over the session');
  svg.innerHTML = `<line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" stroke="#ffffff33" stroke-dasharray="3 3"/>` +
    `<path d="${d}" fill="none" stroke="#e9c47e" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  return h('div', { class: 'panel' }, h('div', { class: 'small muted' }, 'Bankroll (units)'), svg);
}
