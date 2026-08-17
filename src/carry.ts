import { addDays, diffDays } from './dates';
import type { DayEntry, DoingItemId, ISODate } from './types';

/**
 * Carry-forward: eligibility, the rolling window, and expiry settlement.
 *
 * Pure — it never reads storage and never reads the clock. Callers pass the days
 * and today's date in.
 *
 * SPEC.md §4 calls this "the rule most likely to be gamed", which is why the
 * verdict type has three cases rather than a boolean, and why the limit message is
 * a constant rather than inline copy.
 */

/** Shown verbatim on the disabled control. Never reworded, shortened, or softened. */
export const CARRY_LIMIT_MESSAGE =
  'Two carries this week already. Do it today or take the miss.';

/** Rolling window, in days, counted inclusive of today. */
export const CARRY_WINDOW_DAYS = 7;

export const MAX_CARRIES_PER_WINDOW = 2;

export type CarryVerdict =
  /** Render the control. */
  | { kind: 'allowed' }
  /** Do not render the control at all. */
  | { kind: 'hidden' }
  /** Render it disabled, with this message. */
  | { kind: 'disabled'; message: string };

/**
 * Counts carries created in the `CARRY_WINDOW_DAYS` calendar days ending on
 * `today`, inclusive (ARCHITECTURE.md §1, q3).
 *
 * `expired` counts as well as `carried`: a carry that lapsed still consumed a slot,
 * and letting expiry free it back up would reward failing.
 */
export function carriesInWindow(window: (DayEntry | null)[], today: ISODate): number {
  let count = 0;
  for (const day of window) {
    if (!day) continue;
    const age = diffDays(day.date, today);
    if (age < 0 || age >= CARRY_WINDOW_DAYS) continue;

    for (const item of ['systemDesign', 'coding', 'office'] as const) {
      const { status } = day[item];
      if (status === 'carried' || status === 'expired') count++;
    }
  }
  return count;
}

/**
 * Whether `item` on `entry` may be carried.
 *
 * `hidden` and `disabled` are deliberately distinct. An item that has already been
 * carried loses the control entirely, because a greyed-out control invites a second
 * attempt while an absent one closes the question (SPEC.md §4). A full window keeps
 * the control visible but disabled, so the limit is legible rather than mysterious.
 *
 * Note the type: `DoingItemId` excludes phone, so "the phone can never be carried"
 * is unrepresentable here rather than guarded at runtime.
 */
export function canCarry(
  item: DoingItemId,
  entry: DayEntry,
  window: (DayEntry | null)[],
  today: ISODate,
): CarryVerdict {
  const { status } = entry[item];

  // An item cannot be carried twice, and a finished one has nothing to defer.
  if (status === 'carried' || status === 'expired' || status === 'done') {
    return { kind: 'hidden' };
  }

  if (carriesInWindow(window, today) >= MAX_CARRIES_PER_WINDOW) {
    return { kind: 'disabled', message: CARRY_LIMIT_MESSAGE };
  }

  return { kind: 'allowed' };
}

/** Marks an item carried from `entry` to the following day. Returns a new entry;
 *  the input is not mutated. */
export function carryItem(item: DoingItemId, entry: DayEntry, now: Date): DayEntry {
  return {
    ...entry,
    [item]: { status: 'carried', dueOn: addDays(entry.date, 1) },
    updatedAt: now.toISOString(),
  };
}

/**
 * Expires carries whose due day has passed.
 *
 * A carry created on day 1 is due on day 2. At the end of day 2 it expires and is
 * recorded as a miss on the *original* day, retroactively downgrading that day's
 * colour — so the check is `dueOn < today`.
 *
 * Returns only the entries that changed, so callers write back the minimum. The
 * input array is never mutated.
 *
 * There is no undo, dismiss, snooze, or confirmation, and nothing here announces
 * itself: the user sees a day that was amber turn red. An interaction to acknowledge
 * expiry is an interaction that can be gamed (SPEC.md §4).
 *
 * This writes to entries of any age. The 7-day edit lock guards *user* edits and
 * must never be consulted here (ARCHITECTURE.md §1, q7).
 */
export function settle(days: (DayEntry | null)[], today: ISODate, now: Date): DayEntry[] {
  const changed: DayEntry[] = [];

  for (const day of days) {
    if (!day) continue;
    let next: DayEntry | null = null;

    for (const item of ['systemDesign', 'coding', 'office'] as const) {
      const state = day[item];
      if (state.status !== 'carried') continue;
      if (state.dueOn === undefined) continue;
      if (diffDays(state.dueOn, today) <= 0) continue; // still due today or later

      next = {
        ...(next ?? day),
        [item]: { ...state, status: 'expired' },
        updatedAt: now.toISOString(),
      };
    }

    if (next) changed.push(next);
  }

  return changed;
}

/**
 * Items carried into `date` from the day before.
 *
 * Derived by reading the previous day rather than stored on the receiving day: one
 * fact, one record. Writing it to both days means two records that can disagree
 * after an import or a partial write (ARCHITECTURE.md §3).
 */
export function carriedInto(previous: DayEntry | null, date: ISODate): DoingItemId[] {
  if (!previous) return [];
  return (['systemDesign', 'coding', 'office'] as const).filter((item) => {
    const state = previous[item];
    return state.status === 'carried' && state.dueOn === date;
  });
}
