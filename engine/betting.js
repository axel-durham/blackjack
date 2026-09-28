// Bet ramp: units[0] applies at TC <= 1, units[i] at TC = i + 1, last entry for anything higher.
export const DEFAULT_RAMP = Object.freeze({
  unit: 25,
  units: [1, 2, 4, 6, 8, 10],
  wongOut: false,
  wongOutAt: -1,
});

export function betUnits(tc, ramp = DEFAULT_RAMP) {
  if (ramp.wongOut && tc <= ramp.wongOutAt) return 0;
  const i = Math.min(Math.max(tc - 1, 0), ramp.units.length - 1);
  return ramp.units[i];
}

// Distinct bet sizes the player can choose from, in units.
export function betChoices(ramp = DEFAULT_RAMP) {
  const set = new Set(ramp.units);
  if (ramp.wongOut) set.add(0);
  return [...set].sort((a, b) => a - b);
}

export function rampRows(ramp = DEFAULT_RAMP) {
  const rows = ramp.units.map((u, i) => ({
    tc: i === 0 ? '≤ +1' : i === ramp.units.length - 1 ? `+${i + 1} or more` : `+${i + 1}`,
    units: u,
  }));
  if (ramp.wongOut) rows.unshift({ tc: `≤ ${ramp.wongOutAt}`, units: 0 });
  return rows;
}
