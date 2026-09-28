// Hi-Lo index plays from the Blackjack Apprenticeship H17 and S17 deviation charts
// (blackjackapprenticeship.com, 2018), which cover the Illustrious 18 and Fab 4.
//
// basis 'tc': dir '+' deviates at true count >= index, '-' at true count <= index.
// basis 'rc': BJA's "0+" / "0-" — deviate at any positive / negative running count.
// kind: hard | soft | pair | surrender | insurance. key = total (or pair value).
// code: action when deviating (S, H, D, Ds, P split, R surrender, NR don't surrender, I insure).

const tc = (index, dir) => ({ basis: 'tc', index, dir });
const rc = (dir) => ({ basis: 'rc', index: 0, dir });

const dev = (kind, key, up, code, when, rules = 'both') => ({ kind, key, up, code, rules, ...when });

const LIST = [
  dev('insurance', 0, 11, 'I', tc(3, '+')),

  dev('pair', 10, 4, 'P', tc(6, '+')),
  dev('pair', 10, 5, 'P', tc(5, '+')),
  dev('pair', 10, 6, 'P', tc(4, '+')),

  dev('soft', 19, 4, 'Ds', tc(3, '+')),
  dev('soft', 19, 5, 'Ds', tc(1, '+')),
  dev('soft', 19, 6, 'S', rc('-'), 'h17'),
  dev('soft', 19, 6, 'Ds', tc(1, '+'), 's17'),
  dev('soft', 17, 2, 'D', tc(1, '+')),

  dev('hard', 16, 9, 'S', tc(4, '+')),
  dev('hard', 16, 10, 'S', rc('+')),
  dev('hard', 16, 11, 'S', tc(3, '+'), 'h17'),
  dev('hard', 15, 10, 'S', tc(4, '+')),
  dev('hard', 15, 11, 'S', tc(5, '+'), 'h17'),
  dev('hard', 13, 2, 'H', tc(-1, '-')),
  dev('hard', 12, 2, 'S', tc(3, '+')),
  dev('hard', 12, 3, 'S', tc(2, '+')),
  dev('hard', 12, 4, 'H', rc('-')),
  dev('hard', 11, 11, 'D', tc(1, '+'), 's17'),
  dev('hard', 10, 10, 'D', tc(4, '+')),
  dev('hard', 10, 11, 'D', tc(3, '+'), 'h17'),
  dev('hard', 10, 11, 'D', tc(4, '+'), 's17'),
  dev('hard', 9, 2, 'D', tc(1, '+')),
  dev('hard', 9, 7, 'D', tc(3, '+')),
  dev('hard', 8, 6, 'D', tc(2, '+')),

  dev('surrender', 16, 8, 'R', tc(4, '+')),
  dev('surrender', 16, 9, 'NR', tc(-1, '-')),
  dev('surrender', 15, 9, 'R', tc(2, '+')),
  dev('surrender', 15, 10, 'NR', rc('-')),
  dev('surrender', 15, 11, 'R', tc(-1, '+'), 'h17'),
  dev('surrender', 15, 11, 'R', tc(2, '+'), 's17'),
];

const upName = (up) => (up === 11 ? 'A' : String(up));

export function handName(d) {
  if (d.kind === 'insurance') return 'Insurance';
  if (d.kind === 'pair') return d.key === 10 ? 'T,T' : `${d.key},${d.key}`;
  if (d.kind === 'soft') return `A,${d.key - 11}`;
  return String(d.key);
}

export function indexLabel(d) {
  if (d.basis === 'rc') return d.dir === '+' ? '0+ (RC)' : '0− (RC)';
  const n = d.index > 0 ? `+${d.index}` : d.index < 0 ? `−${-d.index}` : '0';
  return `${n}${d.dir === '+' ? ' or higher' : ' or lower'}`;
}

export const shortIndex = (d) =>
  d.basis === 'rc' ? `0${d.dir}` : `${d.index}${d.dir}`;

const ACTION_WORDS = {
  S: 'stand', H: 'hit', D: 'double', Ds: 'double', P: 'split', NP: "don't split", R: 'surrender', NR: "don't surrender", I: 'take insurance',
};

export function decorate(d, source = 'bja') {
  const id = `${source}-${d.kind}-${d.key}-${d.up}-${d.rules ?? ''}`;
  const title = d.kind === 'insurance'
    ? 'Insurance / even money'
    : `${handName(d)} v ${upName(d.up)}: ${ACTION_WORDS[d.code]}`;
  return Object.freeze({ rules: 'both', ...d, id, title, source });
}

export const DEVIATIONS = LIST.map((d) => decorate(d));

// BJA's published set for shoe games. See active.js for what the drills actually use.
export function deviationsFor(rules) {
  const tag = rules.h17 ? 'h17' : 's17';
  return DEVIATIONS.filter((d) =>
    (d.rules === 'both' || d.rules === tag) && (rules.surrender || d.kind !== 'surrender'));
}

export function isTriggered(d, count) {
  if (d.basis === 'rc') return d.dir === '+' ? count.rc > 0 : count.rc < 0;
  return d.dir === '+' ? count.tc >= d.index : count.tc <= d.index;
}

