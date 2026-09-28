import { h, seg, cardEl, keypad, buzz } from '../ui.js';
import { settings, saveSettings, stats, saveStats, pct } from '../store.js';
import { buildDecks, shuffle, Shoe, hiLo, randInt } from '../engine/cards.js';
import { signed, trueCount, plausibleTrueCounts } from '../engine/count.js';
import { TableState, playRound } from '../engine/table.js';
import { tableEl, shoeInfo, sleep } from './tableview.js';

let mode = 'table';

export function render(root) {
  let alive = true;
  const body = h('div', { class: 'view-body' });
  const segEl = h('div');
  const stage = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  const drawSeg = () => segEl.replaceChildren(seg([['table', 'Full table'], ['deck', 'Deck countdown']], mode, (v) => {
    mode = v;
    drawSeg();
    start();
  }, 'Counting mode'));

  let stop = () => {};
  function start() {
    stop();
    stage.replaceChildren();
    stop = mode === 'deck' ? deckMode(stage) : tableMode(stage);
  }

  drawSeg();
  body.append(
    h('div', null, h('h1', { style: { fontSize: '1.3rem' } }, 'Counting'),
      h('p', { class: 'small muted' }, 'Hi-Lo: 2–6 are +1, 7–9 are 0, tens and aces are −1.')),
    segEl, stage);
  root.append(body);
  start();
  return () => {
    alive = false;
    stop();
  };

  // ---------------- deck countdown ----------------
  function deckMode(el) {
    let run = { cancelled: false };
    const speedSeg = h('div');
    const perFlash = h('div');
    const opts = settings.count;
    opts.flash ??= 1;
    const drawOpts = () => {
      speedSeg.replaceChildren(seg([[1, '1/s'], [2, '2/s'], [3, '3/s'], [4, '4/s'], [6, '6/s']], opts.speed, (v) => { opts.speed = v; saveSettings(); drawOpts(); }, 'Speed'));
      perFlash.replaceChildren(seg([[1, 'One card'], [2, 'Two at a time']], opts.flash, (v) => { opts.flash = v; saveSettings(); drawOpts(); }, 'Cards per flash'));
    };
    drawOpts();
    const best = stats.count.deckBest;
    const intro = h('div', { class: 'panel' },
      h('p', { class: 'small' }, 'One deck is dealt with 1–3 cards secretly removed. Keep the running count, then enter it at the end. Pros count a deck in under 25 seconds.'),
      speedSeg, perFlash,
      best && h('p', { class: 'small muted' }, `Best correct run: ${best.toFixed(1)}s`),
      h('button', { class: 'btn primary block', onclick: go }, 'Start'));
    el.replaceChildren(intro);

    async function go() {
      run.cancelled = true;
      run = { cancelled: false };
      const my = run;
      const deck = shuffle(buildDecks(1));
      const removed = randInt(Math.random, 1, 3);
      const shown = deck.slice(removed);
      const answerRc = shown.reduce((s, c) => s + hiLo(c), 0);
      const flashSlot = h('div', { class: 'flash-stage' });
      const progress = h('div', { class: 'timer' });
      el.replaceChildren(h('div', { class: 'felt' }, flashSlot, progress),
        h('button', { class: 'btn ghost block', onclick: () => { my.cancelled = true; deckMode(el); } }, 'Stop'));
      const t0 = performance.now();
      const step = opts.flash;
      for (let i = 0; i < shown.length; i += step) {
        if (my.cancelled || !alive) return;
        const group = shown.slice(i, i + step);
        flashSlot.replaceChildren(h('div', { class: 'cards' }, group.map((c) => cardEl(c, { size: 'big' }))));
        progress.textContent = `${Math.min(i + step, shown.length)} / ${shown.length}`;
        await sleep((1000 / opts.speed) * (step === 2 ? 1.4 : 1), root);
      }
      const secs = (performance.now() - t0) / 1000;
      if (my.cancelled || !alive) return;
      el.replaceChildren(h('div', { class: 'panel' },
        h('p', { class: 'small muted' }, `${shown.length} cards in ${secs.toFixed(1)}s`),
        keypad({
          question: 'Running count',
          onSubmit: (v) => {
            const ok = v === answerRc;
            stats.count.checks++;
            if (ok) stats.count.correct++;
            if (ok && (!stats.count.deckBest || secs < stats.count.deckBest)) stats.count.deckBest = secs;
            stats.count.history.push({ mode: 'deck', ok, secs: Math.round(secs * 10) / 10, ts: Date.now() });
            stats.count.history = stats.count.history.slice(-200);
            saveStats();
            if (!ok) buzz(120);
            const missing = deck.slice(0, removed);
            el.replaceChildren(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
              h('div', { class: 'fb-head' }, ok ? '✓ Correct' : `✗ It was ${signed(answerRc)}`),
              h('div', { class: 'fb-body' },
                !ok && h('div', null, `You said ${signed(v)}.`),
                `Removed cards: `, missing.map((c) => `${c.rank === 'T' ? '10' : c.rank}${c.suit}`).join(' '),
                ` (their tags total ${signed(-answerRc)}, which is why the deck didn’t end at 0). `,
                `Time ${secs.toFixed(1)}s.`)),
            h('div', { class: 'row' },
              h('button', { class: 'btn primary', onclick: go }, 'Again'),
              h('button', { class: 'btn ghost', onclick: () => deckMode(el) }, 'Settings')));
          },
        })));
    }
    return () => { run.cancelled = true; };
  }

  // ---------------- full table ----------------
  function tableMode(el) {
    const opts = settings.count;
    opts.ask ??= 'random';
    let session = null;
    const optSlot = h('div', { class: 'panel' });
    const drawOpts = () => optSlot.replaceChildren(
      h('p', { class: 'small' }, 'A real shoe is dealt to the whole table. Other players hit, split and double by basic strategy. Count every card, including the dealer’s hole card when it flips.'),
      h('div', { class: 'small muted' }, 'Players at the table'),
      seg([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']], opts.players, (v) => { opts.players = v; saveSettings(); drawOpts(); }, 'Players'),
      h('div', { class: 'small muted' }, 'Dealing speed'),
      seg([[1, 'Slow'], [2, 'Casino'], [3, 'Fast'], [4, 'Pro']], opts.speed > 4 ? 2 : opts.speed, (v) => { opts.speed = v; saveSettings(); drawOpts(); }, 'Speed'),
      h('div', { class: 'small muted' }, 'Ask for the count'),
      seg([['round', 'Every round'], ['random', 'Randomly'], ['shoe', 'End of shoe']], opts.ask, (v) => { opts.ask = v; saveSettings(); drawOpts(); }, 'Ask'),
      h('label', { class: 'field' }, h('span', null, 'Also ask for true count'),
        Object.assign(h('input', { type: 'checkbox', class: 'switch', onchange: (e) => { opts.askTc = e.target.checked; saveSettings(); } }), { checked: !!opts.askTc })),
      h('button', { class: 'btn primary block', onclick: begin }, 'Deal'));
    drawOpts();
    el.replaceChildren(optSlot);

    function begin() {
      const rules = settings.rules;
      const token = { cancelled: false };
      session = token;
      const shoe = new Shoe(rules.decks, rules.penetration);
      const table = new TableState(shoe, rules, opts.players);
      const delay = [0, 900, 600, 380, 220][opts.speed] ?? 600;
      const info = h('div');
      const felt = h('div');
      const prompt = h('div', { class: 'bar-slot prompt-sheet' });
      let checks = 0;
      let good = 0;
      const score = h('div', { class: 'statline' });
      const drawScore = () => score.replaceChildren(
        h('span', null, 'Checks ', h('b', null, `${good}/${checks}`)),
        h('span', null, 'All-time ', h('b', null, pct(stats.count.correct, stats.count.checks))));
      drawScore();
      const stopBtn = h('button', { class: 'btn ghost block', onclick: () => { token.cancelled = true; tableMode(el); } }, 'End session');
      el.replaceChildren(score, info, felt, stopBtn, prompt);
      const draw = (turn) => {
        info.replaceChildren(shoeInfo(table, rules));
        felt.replaceChildren(tableEl(table, { turn, totals: true }));
      };

      const ask = (question, answer, accept = [answer]) => new Promise((resolve) => {
        prompt.replaceChildren(h('div', { class: 'panel' }, keypad({
          question,
          onSubmit: (v) => {
            const ok = accept.includes(v);
            checks++;
            if (ok) good++;
            stats.count.checks++;
            if (ok) stats.count.correct++;
            stats.count.history.push({ mode: 'table', ok, ts: Date.now() });
            stats.count.history = stats.count.history.slice(-200);
            saveStats();
            drawScore();
            if (!ok) buzz(120);
            prompt.replaceChildren(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
              h('div', { class: 'fb-head' }, ok ? '✓ Correct' : `✗ It’s ${signed(answer)}`),
              !ok && h('div', { class: 'fb-body' }, `You said ${signed(v)}.`),
              h('button', { class: 'btn primary block', onclick: () => { prompt.replaceChildren(); resolve(); } }, 'Continue')));
          },
        })));
      });

      (async () => {
        let sinceAsk = 0;
        let askAfter = randInt(Math.random, 1, 3);
        while (!token.cancelled && alive) {
          if (table.shuffleIfNeeded()) {
            prompt.replaceChildren(h('div', { class: 'feedback good' }, h('div', { class: 'fb-head' }, '♻ Shuffle'), h('div', { class: 'fb-body' }, 'New shoe. The count resets to 0.')));
            await sleep(1400, root);
            prompt.replaceChildren();
          }
          let turn = null;
          for (const ev of playRound(table, Array(opts.players).fill(1))) {
            if (token.cancelled || !alive) return;
            if (ev.type === 'turn') {
              turn = { seat: ev.seat, hand: ev.hand };
              continue;
            }
            if (ev.type === 'settle' || ev.type === 'split') { draw(turn); continue; }
            draw(turn);
            await sleep(delay, root);
          }
          draw(null);
          await sleep(delay * 1.5, root);
          if (token.cancelled || !alive) return;
          sinceAsk++;
          const due = opts.ask === 'round' || (opts.ask === 'random' && sinceAsk >= askAfter) ||
            (opts.ask === 'shoe' && table.shoe.pastCut);
          if (due && opts.ask !== 'shoe') {
            sinceAsk = 0;
            askAfter = randInt(Math.random, 1, 3);
            await ask('Running count?', table.rc);
            if (opts.askTc && !token.cancelled) {
              const tcs = plausibleTrueCounts(table.rc, table.decks);
              await ask(`True count? (${table.decks} decks left)`, trueCount(table.rc, table.decks), tcs);
            }
          } else if (due && opts.ask === 'shoe') {
            await ask('Running count at end of shoe?', table.rc);
            table.shoe.shuffle();
            table.rc = 0;
          }
        }
      })();
    }
    return () => { if (session) session.cancelled = true; };
  }
}
