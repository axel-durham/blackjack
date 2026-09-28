// Cross-checks the strategy tables and published index plays against the EV model,
// and (with --write) regenerates engine/computed.js: index plays derived from the model.
//
//   node scripts/ev-check.js           report
//   node scripts/ev-check.js --write   report + regenerate engine/computed.js
import { writeFileSync } from 'node:fs';
import { cellOptions, insuranceEV, argmax } from './ev.js';
import { UPS } from '../engine/tables.js';
import { cellCode } from '../engine/tables.js';
import { DEVIATIONS } from '../engine/deviations.js';

const ROWS = {
  hard: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  soft: [13, 14, 15, 16, 17, 18, 19, 20],
  pairs: [2, 3, 4, 6, 7, 8, 9, 10, 11],
  surrender: [14, 15, 16, 17],
};
const KIND = { hard: 'hard', soft: 'soft', pairs: 'pair', surrender: 'surrender' };
const GRID = [];
for (let t = -12; t <= 14.0001; t += 0.1) GRID.push(Math.round(t * 10) / 10);

// Collapse option EVs to the decision the chart encodes.
function decision(table, o) {
  if (table === 'pairs') return o.P >= Math.max(o.S, o.H, o.D) ? 'P' : 'NP';
  if (table === 'surrender') return o.R >= Math.max(o.S, o.H) ? 'R' : 'NR';
  return argmax({ S: o.S, H: o.H, D: o.D });
}

function chartDecision(table, key, up, rules) {
  const code = cellCode(table, key, up, rules);
  if (table === 'pairs') return code === 'Y' || (code === 'Y/N' && rules.das) ? 'P' : 'NP';
  if (table === 'surrender') return code === 'SUR' ? 'R' : 'NR';
  return code === 'Ds' ? 'D' : code;
}

// Nearest flips on each side of TC 0, relative to the chart play.
function flips(table, key, up, rules) {
  const base = chartDecision(table, key, up, rules);
  const at = new Map(GRID.map((t) => [t, decision(table, cellOptions(table, key, up, t, rules))]));
  const out = { base, model0: at.get(0), plus1: at.get(1), minus1: at.get(-1) };
  const pos = GRID.find((t) => t >= 0 && at.get(t) !== base);
  const neg = [...GRID].reverse().find((t) => t <= 0 && at.get(t) !== base);
  if (pos !== undefined) out.hi = { x: pos, action: at.get(pos) };
  if (neg !== undefined) out.lo = { x: neg, action: at.get(neg) };
  return out;
}

const round = (x) => Math.round(x + 1e-9);
// Crossover rounded to the nearest integer; this reproduces BJA's published indices
// within ±1 (flooring against the TC interval matched them worse).
const toIndex = (x) => round(x);
const label = (u) => (u === 11 ? 'A' : u);
const CONFIGS = [
  { name: '6D H17', rules: { decks: 6, h17: true, das: true, surrender: true } },
  { name: '6D S17', rules: { decks: 6, h17: false, das: true, surrender: true } },
  { name: '8D H17', rules: { decks: 8, h17: true, das: true, surrender: true } },
  { name: '2D H17', rules: { decks: 2, h17: true, das: true, surrender: true } },
  { name: '2D S17', rules: { decks: 2, h17: false, das: true, surrender: true } },
];

const computed = {};
for (const { name, rules } of CONFIGS) {
  console.log(`\n=== ${name} ===`);
  const cells = [];
  for (const table of Object.keys(ROWS)) for (const key of ROWS[table]) for (const up of UPS) {
    cells.push({ table, key, up, ...flips(table, key, up, rules) });
  }
  const mism = cells.filter((c) => c.model0 !== c.base);
  console.log(`Basic strategy at TC 0: ${cells.length - mism.length}/${cells.length} cells agree with the chart`);
  for (const c of mism) console.log(`  ${c.table} ${c.key} v ${label(c.up)}: chart ${c.base}, model ${c.model0}`);

  // Published index plays for this rule set (shoe games only).
  if (rules.decks >= 4) {
    const tag = rules.h17 ? 'h17' : 's17';
    const pub = DEVIATIONS.filter((d) => (d.rules === 'both' || d.rules === tag) && d.kind !== 'insurance');
    let worst = 0;
    for (const d of pub) {
      const table = d.kind === 'pair' ? 'pairs' : d.kind;
      const c = cells.find((x) => x.table === table && x.key === d.key && x.up === d.up);
      const side = d.dir === '+' ? c.hi : c.lo;
      const got = side ? toIndex(side.x, d.dir) : null;
      const diff = got === null ? Infinity : Math.abs(got - d.index);
      worst = Math.max(worst, diff === Infinity ? 99 : diff);
      if (diff > 1) console.log(`  ! ${d.title} (${d.basis === 'rc' ? 'RC ' : ''}${d.index}${d.dir}) model: ${got ?? 'none'}`);
    }
    console.log(`Published indices: max |model − BJA| = ${worst}`);
  }
  const ins = GRID.find((t) => insuranceEV(t, rules) > 0);
  console.log(`Insurance break-even: TC ${ins}`);

  computed[name] = { cells, insurance: toIndex(ins, '+') };
}

if (process.argv.includes('--write')) {
  // Candidate plays: flips within a practical count range whose deviating action differs.
  const LIMIT = { lo: -3, hi: 6 };
  const emit = [];
  for (const [name, group] of [['6D H17', 'shoe-h17'], ['6D S17', 'shoe-s17'], ['2D H17', 'dd-h17'], ['2D S17', 'dd-s17']]) {
    emit.push(`  '${group}': [`);
    emit.push(`    { kind: 'insurance', key: 0, up: 11, code: 'I', basis: 'tc', index: ${computed[name].insurance}, dir: '+' },`);
    for (const c of computed[name].cells) {
      // Borderline cells where the model and the chart disagree at TC 0: the chart play is
      // right on one side of zero, so drill it as a running-count play toward the other side.
      if (c.model0 !== c.base) {
        const dir = c.plus1 === c.model0 && c.minus1 === c.base ? '+' : c.minus1 === c.model0 && c.plus1 === c.base ? '-' : null;
        if (dir) emit.push(`    { kind: '${KIND[c.table]}', key: ${c.key}, up: ${c.up}, code: '${c.model0}', basis: 'rc', index: 0, dir: '${dir}' },`);
        continue;
      }
      for (const [side, dir] of [['hi', '+'], ['lo', '-']]) {
        const f = c[side];
        if (!f) continue;
        const idx = toIndex(f.x, dir);
        if (idx < LIMIT.lo || idx > LIMIT.hi) continue;
        const code = f.action === 'NP' ? 'NP' : f.action;
        // Like BJA's charts, a zero index becomes a running-count play ("0+" / "0−").
        const basis = idx === 0 ? 'rc' : 'tc';
        emit.push(`    { kind: '${KIND[c.table]}', key: ${c.key}, up: ${c.up}, code: '${code}', basis: '${basis}', index: ${idx}, dir: '${dir}' },`);
      }
    }
    emit.push('  ],');
  }
  const src = `// GENERATED by scripts/ev-check.js --write. Do not edit by hand.
// Hi-Lo index plays derived from the EV model in scripts/ev.js (finite shoe, count-skewed,
// player cards removed) for every chart cell whose best play flips between TC ${LIMIT.lo} and +${LIMIT.hi}.
// Used for double-deck games and for the optional "expanded" set in shoe games.
export const COMPUTED = {
${emit.join('\n')}
};
`;
  writeFileSync(new URL('../engine/computed.js', import.meta.url), src);
  console.log('\nWrote engine/computed.js');
}
