import { parseISO } from './dates';
import type { ISODate, StudyItemId } from './types';

/**
 * Which study items a given date asks for.
 *
 * The weekly hour is one hour on weekdays and three at the weekend, and one hour
 * does not split across two subjects without ruining both — so a weekday schedules
 * exactly one study item and the others are simply not part of that day.
 *
 * Fixed in source, like the item list itself. There is no UI to edit it and no
 * per-day override: a schedule you can move on the day is a schedule that always
 * ends up holding whichever subject is easiest that evening.
 *
 * Pure — no storage, no clock. The date comes in, the shape comes out.
 */

/**
 * Sunday = 0, matching `Date.getDay()`.
 *
 * Weekend order is the order the hours are meant to run in, and the render order
 * follows it, so the list is not sorted or regrouped anywhere downstream.
 *
 * The certification slot is deliberately generic. It holds whichever certification
 * is in flight; when one is passed the next moves into the same slot, so the map
 * never changes and no history is ever re-graded. If the slot empties for good, that
 * is a remodel, not a schedule edit.
 */
const SCHEDULE: Record<number, readonly StudyItemId[]> = {
  0: ['cert', 'systemDesign', 'lld'], // Sunday — after the weekly review
  1: ['cert'],
  2: ['cert'],
  3: ['systemDesign'],
  4: ['cert'],
  5: ['lld'],
  6: ['cert', 'systemDesign', 'lld'],
};

export function scheduledOn(date: ISODate): StudyItemId[] {
  const day = SCHEDULE[parseISO(date).getDay()];
  // Every weekday index is present, so this cannot be reached with a real ISO date —
  // but `parseISO` is the only thing standing between here and a hand-edited key.
  if (!day) throw new Error(`no schedule for date: ${date}`);
  return [...day];
}

/** Whether `item` counts on `date`. An item that was not scheduled is not a miss —
 *  it is not part of the day at all, and never reaches the grade. */
export function isScheduled(item: StudyItemId, date: ISODate): boolean {
  return scheduledOn(date).includes(item);
}
