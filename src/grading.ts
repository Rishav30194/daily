import { isWeekend } from './dates';
import type {
  DayEntry,
  DoingItemId,
  Grade,
  ISODate,
  ItemState,
  Slot,
} from './types';

/**
 * Day grading and month aggregation. Pure: no React, no storage, no clock.
 *
 * The day's colour comes from the core four only — phone, system design,
 * coding/cert, office target. English is tracked but never an input here
 * (SPEC.md §2.2), and the urge count never is either.
 */

/** A doing item passes when it is done, or still provisionally carried. */
function itemPasses(item: ItemState): boolean {
  // `carried` counting as a pass is what makes expiry a retroactive *downgrade*
  // rather than a no-op: the day reads amber until the carry lapses, then red.
  return item.status === 'done' || item.status === 'carried';
}

function phonePasses(entry: DayEntry): boolean {
  // `slip` is a pass. Stopping mid-scroll is the skill being trained; grading it
  // as a failure is what turns one slip into a lost day (SPEC.md §2.1).
  return entry.phone === 'clean' || entry.phone === 'slip';
}

/** Which core items apply on a given date. Weekends drop the office target
 *  entirely — it is not counted and not rendered (SPEC.md §5). */
export function appliesOn(date: ISODate): { office: boolean; total: number } {
  const weekend = isWeekend(date);
  return { office: !weekend, total: weekend ? 3 : 4 };
}

/** The doing items that apply on a date, in display order. */
export function doingItemsOn(date: ISODate): DoingItemId[] {
  return appliesOn(date).office
    ? ['systemDesign', 'coding', 'office']
    : ['systemDesign', 'coding'];
}

export function passCount(entry: DayEntry): number {
  let passes = 0;
  if (phonePasses(entry)) passes++;
  if (itemPasses(entry.systemDesign)) passes++;
  if (itemPasses(entry.coding)) passes++;
  if (appliesOn(entry.date).office && itemPasses(entry.office)) passes++;
  return passes;
}

/**
 * Green = all pass, amber = one short, red = two or more short.
 *
 * Weekdays grade on four items, weekends on three. No partial credit, no weights,
 * no fourth grade state (SPEC.md §3).
 *
 * Returns null when there is no entry — a blank heatmap cell, not a red one.
 */
export function gradeDay(entry: DayEntry | null): Grade | null {
  if (!entry) return null;
  const { total } = appliesOn(entry.date);
  const passes = passCount(entry);
  if (passes === total) return 'green';
  if (passes === total - 1) return 'amber';
  return 'red';
}

// ---------------------------------------------------------------------------
// Month aggregation
// ---------------------------------------------------------------------------

export interface GradeCounts {
  green: number;
  amber: number;
  red: number;
  /** Days with an entry. Blank days are excluded. */
  graded: number;
  /** Share of graded days that are green, 0–1. Null when nothing is graded. */
  percentGreen: number | null;
}

export function gradeCounts(days: (DayEntry | null)[]): GradeCounts {
  let green = 0;
  let amber = 0;
  let red = 0;
  for (const day of days) {
    switch (gradeDay(day)) {
      case 'green':
        green++;
        break;
      case 'amber':
        amber++;
        break;
      case 'red':
        red++;
        break;
    }
  }
  const graded = green + amber + red;
  return { green, amber, red, graded, percentGreen: graded ? green / graded : null };
}

export interface ItemRate {
  item: DoingItemId | 'phone';
  /** Days the item counted toward the grade. Office excludes weekends. */
  applicable: number;
  passed: number;
  /** 0–1, or null when the item never applied. */
  rate: number | null;
}

/**
 * Per-item completion rate — the diagnostic the day colour cannot give. A red day
 * says the day broke; this says which item is breaking (SPEC.md §6).
 */
export function itemRates(days: (DayEntry | null)[]): ItemRate[] {
  const items: (DoingItemId | 'phone')[] = ['phone', 'systemDesign', 'coding', 'office'];

  return items.map((item) => {
    let applicable = 0;
    let passed = 0;

    for (const day of days) {
      if (!day) continue;
      if (item === 'office' && !appliesOn(day.date).office) continue;

      applicable++;
      if (item === 'phone' ? phonePasses(day) : itemPasses(day[item])) passed++;
    }

    return { item, applicable, passed, rate: applicable ? passed / applicable : null };
  });
}

/**
 * 11:00 versus 3:00 for system design. If 3:00 is winning over a month, 11:00 is
 * not a real slot, and moving it beats defending it (SPEC.md §2.1).
 */
export function slotSplit(days: (DayEntry | null)[]): Record<Slot, number> {
  const split: Record<Slot, number> = { '11:00': 0, '15:00': 0 };
  for (const day of days) {
    if (!day) continue;
    const { slot, status } = day.systemDesign;
    if (slot && status === 'done') split[slot]++;
  }
  return split;
}

export interface EnglishRate {
  completed: number;
  applicable: number;
  rate: number | null;
}

/** Tracked separately and never folded into the day's colour. */
export function englishRate(days: (DayEntry | null)[]): EnglishRate {
  let completed = 0;
  let applicable = 0;
  for (const day of days) {
    if (!day) continue;
    applicable += 3;
    if (day.english.standup) completed++;
    if (day.english.rewrite) completed++;
    if (day.english.drill) completed++;
  }
  return { completed, applicable, rate: applicable ? completed / applicable : null };
}

export interface UrgePoint {
  date: ISODate;
  /** null = not recorded. Distinct from 0, which means "recorded, and it was zero". */
  count: number | null;
  /** Trailing 7-day mean over recorded values only; null when the window is empty. */
  average: number | null;
}

/**
 * Daily urge counts with a trailing 7-day average.
 *
 * Blank days are excluded from the average's denominator; zero days are included.
 * Coercing blank to zero here would drag the average down and make a day nobody
 * logged look like a perfect one (SPEC.md §2.3).
 */
export function urgeSeries(days: (DayEntry | null)[], dates: ISODate[]): UrgePoint[] {
  if (days.length !== dates.length) {
    throw new Error('urgeSeries: days and dates must be index-aligned');
  }

  // An explicit null test rather than `?? null`: `??` is correct here but reads as
  // a coalesce on `urges`, which is exactly the bug this field invites.
  const counts: (number | null)[] = days.map((day) =>
    day && day.urges !== null ? day.urges : null,
  );

  return dates.map((date, i) => {
    const window = counts.slice(Math.max(0, i - 6), i + 1);
    const recorded = window.filter((c): c is number => c !== null);
    const sum = recorded.reduce((a, b) => a + b, 0);
    const count = counts[i];

    return {
      date,
      count: count === undefined ? null : count,
      average: recorded.length ? sum / recorded.length : null,
    };
  });
}

/**
 * Consecutive non-red days ending at the most recent graded day.
 *
 * Display only. Never rendered in red, never with warning language, never
 * "don't break the chain" — a broken streak resets silently (SPEC.md §8).
 */
export function streak(days: (DayEntry | null)[]): number {
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const grade = gradeDay(days[i] ?? null);
    if (grade === null) continue; // a day with no entry neither extends nor breaks it
    if (grade === 'red') break;
    count++;
  }
  return count;
}

/** The item missed most often in a set of days, named for the weekly review.
 *  Null when nothing was missed. */
export function mostMissed(days: (DayEntry | null)[]): { item: ItemRate; missed: number } | null {
  let worst: { item: ItemRate; missed: number } | null = null;
  for (const rate of itemRates(days)) {
    const missed = rate.applicable - rate.passed;
    if (missed > 0 && (!worst || missed > worst.missed)) worst = { item: rate, missed };
  }
  return worst;
}
