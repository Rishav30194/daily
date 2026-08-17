import { settle } from './carry';
import { addDays, diffDays, todayISO } from './dates';
import { getMeta, getRange, saveMeta, writeDayRaw } from './storage';
import type { ISODate } from './types';

/**
 * The impure half of expiry: read the days, run the pure `settle`, write back what
 * changed.
 *
 * Lives here rather than in `App.tsx` because it has two callers. Startup runs it
 * over the recent past; an import runs it over whatever range the restored file
 * covered, which can reach back years.
 */

/** How far back a first run looks for outstanding carries. Nothing older can still
 *  be due: a carry lives one day. */
export const FIRST_RUN_LOOKBACK = 14;

/**
 * Expires every carry that fell due before `today`, across `from`..`today`.
 *
 * Writes through `writeDayRaw` rather than `saveDay` so the timestamp `settle` chose
 * survives: `saveDay` re-stamps on write, and settlement's own stamp is the one an
 * import merge should compare. It ignores the 7-day edit lock by design
 * (ARCHITECTURE.md §1, q7).
 *
 * Returns how many entries changed, for tests — nothing in the UI announces it. No
 * toast, no prompt, no undo: an interaction to acknowledge expiry is an interaction
 * that can be gamed (SPEC.md §4).
 */
export function settleFrom(from: ISODate, today: ISODate, now = new Date()): number {
  // Clamped to the real calendar day, never the caller's word for it. Settlement
  // expires every carry due before the date it is given, so a `today` in the future
  // marks live carries as missed — and expiry has no undo. A caller passing the
  // app's focused date, which follows whatever heatmap cell was last tapped, is the
  // exact bug this guard exists for.
  const real = todayISO(now);
  const limit = today > real ? real : today;

  const changed = settle(getRange(from, limit), limit, now);
  for (const entry of changed) writeDayRaw(entry);

  const meta = getMeta();
  saveMeta({ ...meta, lastSettledOn: limit });
  return changed.length;
}

/**
 * The startup pass, run once per app open.
 *
 * Lazy rather than scheduled (ARCHITECTURE.md §1, q2): there is no background process
 * and no timer, so a day's colour can change between two openings. That is expected —
 * the user opens the app and yesterday is already red.
 */
export function runSettlement(today: ISODate, now = new Date()): number {
  const { lastSettledOn } = getMeta();
  const floor = addDays(today, -FIRST_RUN_LOOKBACK);

  // A 14-day floor rather than trusting `lastSettledOn` exactly. It costs at most
  // fourteen reads, and it means a clock change or a partial import cannot leave a
  // carry outstanding for good.
  const from = lastSettledOn && diffDays(floor, lastSettledOn) < 0 ? lastSettledOn : floor;

  return settleFrom(from, today, now);
}
