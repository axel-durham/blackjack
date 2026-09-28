import { h, seg, keypad, trayEl, buzz, chipPicker } from '../ui.js';
import { settings, saveSettings, stats, saveStats, pct } from '../store.js';
import { randInt } from '../engine/cards.js';
import { trueCount, plausibleTrueCounts, signed } from '../engine/count.js';
import { betUnits, betChoices, rampRows } from '../engine/betting.js';

let show = 'tray';

export function render(root) {
  const rules = settings.rules;
  const ramp = settings.ramp;
  const statEl = h('div', { class: 'statline' });
  const segEl = h('div');
  const stage = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

  const drawStats = () => statEl.replaceChildren(
    h('span', null, 'True count ', h('b', null, pct(stats.tc.correct, stats.tc.answered))),
    h('span', null, 'Bet sizing ', h('b', null, pct(stats.bet.correct, stats.bet.answered))));
  const drawSeg = () => segEl.replaceChildren(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    seg([['tray', 'Read the tray'], ['decks', 'Decks given']], show, (v) => { show = v; drawSeg(); next(); }, 'Deck display'),
    seg([[false, 'Bet in units'], [true, 'Bet with chips']], !!settings.chips, (v) => { settings.chips = v; saveSettings(); drawSeg(); next(); }, 'Bet input')));

  function next() {
    const minD = rules.decks <= 2 ? 0.5 : 1;
    const steps = [];
    for (let d = minD; d <= rules.decks - 0.5; d += 0.5) steps.push(d);
    const decks = steps[randInt(Math.random, 0, steps.length - 1)];
    // Bias toward counts that matter for betting.
    const targetTc = randInt(Math.random, -3, 7);
    const rc = Math.round(targetTc * decks + (Math.random() - 0.5) * decks);
    const tc = trueCount(rc, decks);
    const accept = show === 'tray' ? plausibleTrueCounts(rc, decks) : [tc];

    const countBox = h('div', { class: 'count-strip', style: { alignItems: 'center' } },
      h('div', { class: 'metric' }, h('span', { class: 'k' }, 'Running count'), h('span', { class: 'v' }, signed(rc))),
      show === 'tray'
        ? trayEl(rules.decks - decks, rules.decks)
        : h('div', { class: 'metric' }, h('span', { class: 'k' }, 'Decks left'), h('span', { class: 'v' }, String(decks))));
    const fb = h('div');
    const step2 = h('div');
    stage.replaceChildren(countBox, fb, step2, h('div', { class: 'panel' }, keypad({
      question: 'True count',
      onSubmit: (v) => {
        const ok = accept.includes(v);
        stats.tc.answered++;
        if (ok) stats.tc.correct++;
        saveStats();
        drawStats();
        if (!ok) buzz(80);
        stage.lastChild.remove();
        fb.replaceChildren(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
          h('div', { class: 'fb-head' }, h('span', null, ok ? '✓' : '✗'), `TC ${signed(tc)}`),
          h('div', { class: 'fb-body' },
            `${signed(rc)} ÷ ${decks} decks = ${(rc / decks).toFixed(2)}, rounded down → ${signed(tc)}.`,
            !ok && h('div', null, `You said ${signed(v)}.`),
            show === 'tray' && accept.length > 1 && h('div', { class: 'muted' }, `Accepted ${accept.map(signed).join(' / ')} (±½ deck reading the tray).`))));
        askBet(tc);
      },
    })));

    function askBet(tcUsed) {
      const want = betUnits(tcUsed, ramp);
      const choices = betChoices(ramp);
      const bar = settings.chips
        ? chipPicker({ unit: ramp.unit, maxBet: Math.max(...ramp.units) * ramp.unit, onBet: (d) => pickBet(d / ramp.unit),
          extra: ramp.wongOut ? [['Sit out', () => pickBet(0)]] : [] })
        : h('div', { class: 'actions', style: { gridTemplateColumns: `repeat(${Math.min(choices.length, 4)}, 1fr)`, position: 'static', padding: 0, background: 'none' } },
          choices.map((u) => h('button', { class: 'act unit-bet', onclick: () => pickBet(u) },
            u === 0 ? 'Sit out' : `${u}u`, h('span', { class: 'kbd' }, u ? `$${u * ramp.unit}` : ''))));
      step2.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'small muted' }, `Bet at TC ${signed(tcUsed)}?`), bar));

      function pickBet(u) {
        const ok = u === want;
        stats.bet.answered++;
        if (ok) stats.bet.correct++;
        saveStats();
        drawStats();
        if (!ok) buzz(80);
        const rows = rampRows(ramp);
        const hlIndex = ramp.wongOut && tcUsed <= ramp.wongOutAt ? 0
          : (ramp.wongOut ? 1 : 0) + Math.min(Math.max(tcUsed - 1, 0), ramp.units.length - 1);
        step2.replaceChildren(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
          h('div', { class: 'fb-head' }, h('span', null, ok ? '✓' : '✗'), want === 0 ? 'Sit out' : `Bet $${want * ramp.unit} (${want} unit${want > 1 ? 's' : ''})`),
          !ok && h('div', { class: 'fb-body' }, u === 0 ? 'You sat out.' : `You bet $${Math.round(u * ramp.unit)}.`),
          h('div', { class: 'list' }, rows.map((r, i) => h('div', { class: 'li', style: i === hlIndex ? { background: '#e9c47e22' } : null },
            h('span', { class: 'grow' }, `TC ${r.tc}`), h('span', { class: 'idxv' }, r.units ? `${r.units}u · $${r.units * ramp.unit}` : 'sit out'))))),
        h('button', { class: 'btn primary block', onclick: next }, 'Next →'));
      }
    }
  }

  drawSeg();
  drawStats();
  root.append(h('div', { class: 'view-body' },
    h('div', null, h('h1', { style: { fontSize: '1.3rem' } }, 'True count & bet'),
      h('p', { class: 'small muted intro' }, 'Divide the running count by decks left (read from the discard tray), round down, then size your bet from your ramp. Edit the ramp in ⚙︎ Settings.')),
    segEl, statEl, stage));
  next();
}
