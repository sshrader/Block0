// The anti-snipe fee schedule. It is set once, on chain, when `npm run dbc-config` creates the curve config, and it
// applies to every pool made from that config. This file holds the same numbers so the site and the config script agree,
// and so the coin page can show the live fee. The chain is the source of truth: if you change the config, change these.

export type SnipeParams = {
  /** 'exponential' drops fastest right after launch (closest to a block-zero fee). 'linear' drops by a fixed step. */
  mode: 'exponential' | 'linear';
  /** Fee on the very first slots, in basis points (5000 = 50%). */
  startBps: number;
  /** Fee once the schedule is over, in basis points. This is also the normal trading fee. */
  endBps: number;
  /** How many steps the fee drops in. */
  periods: number;
  /** Length of the whole schedule in slots (one slot is about 0.4 seconds). */
  durationSlots: number;
};

export const SLOT_SECONDS = 0.4;

export const SNIPE_DEFAULTS: SnipeParams = {
  mode: 'exponential',
  startBps: 5000, // 50% in the first slots
  endBps: 100, // 1% afterwards
  periods: 30,
  durationSlots: 150, // about one minute
};

/** Reads settings from a getter (process.env in the config script, import.meta.env in the browser). */
export function readSnipeParams(get: (name: string) => string | undefined): SnipeParams {
  const num = (name: string, fallback: number) => {
    const v = get(name);
    return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;
  };
  const mode = get('SNIPE_MODE') === 'linear' ? 'linear' : get('SNIPE_MODE') === 'exponential' ? 'exponential' : SNIPE_DEFAULTS.mode;
  const p: SnipeParams = {
    mode,
    startBps: num('SNIPE_START_BPS', SNIPE_DEFAULTS.startBps),
    endBps: num('SNIPE_END_BPS', SNIPE_DEFAULTS.endBps),
    periods: num('SNIPE_PERIODS', SNIPE_DEFAULTS.periods),
    durationSlots: num('SNIPE_DURATION_SLOTS', SNIPE_DEFAULTS.durationSlots),
  };
  return p;
}

/** Throws a plain-English message if the numbers cannot work. Meteora's limits: base fee at least 0.25%, total fee at most 99%. */
export function checkSnipeParams(p: SnipeParams): void {
  if (p.endBps < 25) throw new Error('The final fee must be at least 25 bps (0.25%), Meteora\'s minimum.');
  if (p.startBps < p.endBps) throw new Error('The starting fee must be at least the final fee.');
  if (p.startBps > 9900) throw new Error('The starting fee cannot be above 99% (9900 bps).');
  if (p.startBps > p.endBps) {
    if (!(p.periods > 0) || !(p.durationSlots > 0)) throw new Error('A decaying fee needs periods and a duration above zero.');
    if (!Number.isInteger(p.periods) || !Number.isInteger(p.durationSlots)) throw new Error('Periods and duration must be whole numbers.');
    if (p.durationSlots < p.periods) throw new Error('The duration (in slots) must be at least the number of periods.');
  }
}

/** The base fee in basis points `slotsSinceLaunch` slots after the pool opened. Close to the chain's own maths, not identical. */
export function feeBpsAt(p: SnipeParams, slotsSinceLaunch: number): number {
  if (p.startBps <= p.endBps || p.periods <= 0 || p.durationSlots <= 0) return p.endBps;
  const periodSlots = p.durationSlots / p.periods;
  const k = Math.max(0, Math.min(p.periods, Math.floor(slotsSinceLaunch / periodSlots)));
  if (p.mode === 'linear') return p.startBps - ((p.startBps - p.endBps) * k) / p.periods;
  const factor = Math.pow(p.endBps / p.startBps, 1 / p.periods); // each step keeps this share of the fee
  return Math.max(p.endBps, p.startBps * Math.pow(factor, k));
}

/** The schedule as a few labelled points, for showing in the UI and in the config script's --check output. */
export function schedulePoints(p: SnipeParams, seconds = [0, 2, 5, 10, 20, 30, 45, 60, 90]): { seconds: number; bps: number }[] {
  return seconds.map((s) => ({ seconds: s, bps: feeBpsAt(p, s / SLOT_SECONDS) }));
}

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
