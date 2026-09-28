import { DEFAULT_RULES } from './engine/rules.js';
import { DEFAULT_RAMP } from './engine/betting.js';

const KEY_SETTINGS = 'bjlab.settings.v1';
const KEY_STATS = 'bjlab.stats.v1';

export const DEFAULT_SETTINGS = {
  rules: { ...DEFAULT_RULES, expanded: false },
  ramp: { ...DEFAULT_RAMP, units: [...DEFAULT_RAMP.units] },
  autoAdvance: true,
  haptics: true,
  countDisplay: 'rc', // tc | rc | tray — how the Index drill shows the count
  count: { speed: 2, players: 4, askTc: false },
  sim: { players: 3, speed: 1, checks: true },
};

const blankStats = () => ({
  basic: { cells: {}, answered: 0, correct: 0, streak: 0, best: 0 },
  index: { cells: {}, answered: 0, correct: 0, streak: 0, best: 0 },
  tc: { answered: 0, correct: 0 },
  bet: { answered: 0, correct: 0 },
  count: { checks: 0, correct: 0, deckBest: null, history: [] },
  sim: { history: [] },
});

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — keep working in memory */
  }
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(base)) return saved ?? base;
  const out = { ...base };
  for (const k of Object.keys(saved)) {
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], saved[k]) : saved[k];
  }
  return out;
}

export const settings = merge(structuredClone(DEFAULT_SETTINGS), read(KEY_SETTINGS));
export const stats = merge(blankStats(), read(KEY_STATS));

export const saveSettings = () => write(KEY_SETTINGS, settings);
export const saveStats = () => write(KEY_STATS, stats);

export function resetStats() {
  Object.assign(stats, blankStats());
  saveStats();
}

// Record one graded answer for a drill with per-situation tracking.
export function record(bucket, key, ok) {
  const b = stats[bucket];
  b.answered++;
  if (ok) {
    b.correct++;
    b.streak++;
    b.best = Math.max(b.best, b.streak);
  } else b.streak = 0;
  if (key) {
    const cell = (b.cells[key] ??= { n: 0, wrong: 0 });
    cell.n++;
    if (!ok) cell.wrong++;
  }
  saveStats();
}

export const pct = (c, n) => (n ? `${Math.round((100 * c) / n)}%` : '—');
