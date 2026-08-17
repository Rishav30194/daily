import { getISOWeek, getISOWeekYear } from 'date-fns';

import type { ISODate, ISOWeek, YearMonth } from './types';

/**
 * Local-time date arithmetic on 'YYYY-MM-DD' strings. No UTC normalisation and no
 * timezone handling: the day boundary is local midnight (ARCHITECTURE.md §1, q6).
 *
 * Everything here works through Date's local year/month/day components rather than
 * epoch milliseconds, so adding a day across a DST boundary still lands on the next
 * calendar date rather than 23 or 25 hours later.
 */

const MS_PER_DAY = 86_400_000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** A Date at local midnight on the given calendar date. */
export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`not an ISO date: ${date}`);
  }
  return new Date(y, m - 1, d);
}

export function toISO(d: Date): ISODate {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The caller's clock, passed explicitly into everything else. Nothing in the pure
 *  modules calls this itself — a function that reads the clock internally cannot be
 *  tested against a Tuesday, a leap day, or an expired carry. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now);
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISO(date);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function diffDays(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  // Both are local midnights, so a DST shift leaves a fractional day that rounds away.
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function isWeekend(date: ISODate): boolean {
  const day = parseISO(date).getDay();
  return day === 0 || day === 6;
}

export function daysInMonth(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number);
  if (y === undefined || m === undefined) throw new Error(`not a year-month: ${ym}`);
  return new Date(y, m, 0).getDate();
}

export function monthOf(date: ISODate): YearMonth {
  return date.slice(0, 7);
}

/** Steps a year-month by `n` months. Rolls the year over in both directions. */
export function shiftMonth(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  if (y === undefined || m === undefined) throw new Error(`not a year-month: ${ym}`);
  // Day 1 rather than the current day: stepping from the 31st would otherwise skid
  // into the month after a short one.
  const d = new Date(y, m - 1 + n, 1);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}`;
}

/** Every date in the month, in order. */
export function monthDates(ym: YearMonth): ISODate[] {
  const n = daysInMonth(ym);
  const out: ISODate[] = [];
  for (let d = 1; d <= n; d++) out.push(`${ym}-${pad(d)}`);
  return out;
}

/** Inclusive range, ascending. */
export function rangeDates(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday-to-Sunday week containing `date`. Weeks end Sunday, which is when the
 *  review runs. */
export function weekRange(date: ISODate): { from: ISODate; to: ISODate } {
  const d = parseISO(date);
  const mondayOffset = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  const from = addDays(date, -mondayOffset);
  return { from, to: addDays(from, 6) };
}

/**
 * ISO-8601 week key, 'YYYY-Www'.
 *
 * Delegated to date-fns rather than hand-rolled: the ISO year is not the calendar
 * year at the boundaries — 2027-01-01 is 2026-W53 and 2024-12-30 is 2025-W01 — and
 * this is the one calculation here whose edge cases are easy to get confidently
 * wrong.
 */
export function weekKey(date: ISODate): ISOWeek {
  const d = parseISO(date);
  return `${pad(getISOWeekYear(d), 4)}-W${pad(getISOWeek(d))}`;
}

/**
 * SPEC.md §8 bars editing days "older than 7 days", so a day exactly 7 days old is
 * still editable and the eighth is not. Future days are never editable.
 *
 * This is a UI guard only. System-driven carry expiry writes to entries of any age
 * and must never consult it (ARCHITECTURE.md §1, q7).
 */
export function isWithinEditWindow(date: ISODate, today: ISODate): boolean {
  const age = diffDays(date, today);
  return age >= 0 && age <= 7;
}
