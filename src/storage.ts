import { monthDates, rangeDates } from './dates';
import type {
  DayEntry,
  ISODate,
  ISOWeek,
  Meta,
  WeeklyReview,
  YearMonth,
} from './types';

/**
 * The only module in the app that names `localStorage`. No component, view, or hook
 * touches it directly — swapping in IndexedDB or a remote backend later has to touch
 * one file.
 *
 * One key per day rather than a single blob: a save writes ~300 bytes instead of
 * rewriting the whole history, and a corrupted value costs one day rather than the
 * archive.
 */

const PREFIX = 'daily:v1:';
const DAY = `${PREFIX}day:`;
const REVIEW = `${PREFIX}review:`;
const META = `${PREFIX}meta`;

const SCHEMA = 1 as const;

/** Thrown when the device refuses a write. The only storage error the user ever
 *  sees, because the only remedy is to export. */
export class StorageFullError extends Error {
  constructor() {
    super('Storage is full. Export your data from settings to avoid losing entries.');
    this.name = 'StorageFullError';
  }
}

function read(key: string): unknown {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null; // storage disabled entirely (private mode, blocked cookies)
  }
  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // A malformed value reads as absent. A day that will not parse is a blank cell,
    // never an error thrown into the UI.
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof Error && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      throw new StorageFullError();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function itemState(v: unknown): { status: DayEntry['coding']['status']; dueOn?: ISODate } {
  const statuses = ['pending', 'done', 'missed', 'carried', 'expired'] as const;
  if (!isObject(v)) return { status: 'pending' };

  const status = statuses.find((s) => s === v['status']) ?? 'pending';
  const dueOn = typeof v['dueOn'] === 'string' ? v['dueOn'] : undefined;
  return dueOn === undefined ? { status } : { status, dueOn };
}

/**
 * Parses an unknown value into a DayEntry, or null if it is not one.
 *
 * Missing optional fields are filled with their blank values, but `urges` is only
 * ever a number or null — an absent or non-numeric urge count reads as null (not
 * recorded), never as 0.
 */
function parseDay(v: unknown, date: ISODate): DayEntry | null {
  if (!isObject(v)) return null;

  const phones = ['clean', 'slip', 'lost'] as const;
  const slots = ['11:00', '15:00'] as const;
  const choices = ['coding', 'cert'] as const;

  const sd = itemState(v['systemDesign']);
  const rawSd = isObject(v['systemDesign']) ? v['systemDesign'] : {};
  const slot = slots.find((s) => s === rawSd['slot']);

  const cd = itemState(v['coding']);
  const rawCd = isObject(v['coding']) ? v['coding'] : {};
  const choice = choices.find((c) => c === rawCd['choice']);

  const english = isObject(v['english']) ? v['english'] : {};

  return {
    schema: SCHEMA,
    date: typeof v['date'] === 'string' ? v['date'] : date,
    phone: phones.find((p) => p === v['phone']) ?? null,
    systemDesign: slot === undefined ? sd : { ...sd, slot },
    coding: choice === undefined ? cd : { ...cd, choice },
    office: itemState(v['office']),
    english: {
      standup: english['standup'] === true,
      rewrite: english['rewrite'] === true,
      drill: english['drill'] === true,
    },
    urges: typeof v['urges'] === 'number' && Number.isFinite(v['urges']) ? v['urges'] : null,
    note: typeof v['note'] === 'string' ? v['note'] : '',
    updatedAt: typeof v['updatedAt'] === 'string' ? v['updatedAt'] : new Date(0).toISOString(),
  };
}

function parseReview(v: unknown, week: ISOWeek): WeeklyReview | null {
  if (!isObject(v)) return null;
  return {
    week: typeof v['week'] === 'string' ? v['week'] : week,
    change: typeof v['change'] === 'string' ? v['change'] : '',
    updatedAt: typeof v['updatedAt'] === 'string' ? v['updatedAt'] : new Date(0).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export function getDay(date: ISODate): DayEntry | null {
  return parseDay(read(DAY + date), date);
}

/** User-driven save. Stamps `updatedAt`, which import merging depends on. */
export function saveDay(date: ISODate, entry: DayEntry, now: Date = new Date()): void {
  write(DAY + date, { ...entry, schema: SCHEMA, date, updatedAt: now.toISOString() });
}

/**
 * Writes an entry keeping its existing `updatedAt`.
 *
 * Used by settlement and import, where the timestamp is either already correct or is
 * the very thing being compared. Separate from `saveDay` so the ordinary save path
 * can never forget to stamp.
 */
export function writeDayRaw(entry: DayEntry): void {
  write(DAY + entry.date, { ...entry, schema: SCHEMA });
}

/** Index 0 is the 1st of the month. Absent days are null. */
export function getMonth(ym: YearMonth): (DayEntry | null)[] {
  return monthDates(ym).map(getDay);
}

/**
 * Inclusive date range, one slot per date, absent days null.
 *
 * The carry window and the weekly review both need "the last N days" and both
 * routinely cross a month boundary, which `getMonth` cannot express without the
 * caller stitching two months together.
 */
export function getRange(from: ISODate, to: ISODate): (DayEntry | null)[] {
  return rangeDates(from, to).map(getDay);
}

// ---------------------------------------------------------------------------
// Weekly reviews
// ---------------------------------------------------------------------------

export function getReview(week: ISOWeek): WeeklyReview | null {
  return parseReview(read(REVIEW + week), week);
}

export function saveReview(week: ISOWeek, review: WeeklyReview, now: Date = new Date()): void {
  write(REVIEW + week, { ...review, week, updatedAt: now.toISOString() });
}

/** Every stored review, newest week first. */
export function getAllReviews(): WeeklyReview[] {
  return keysWithPrefix(REVIEW)
    .map((k) => getReview(k.slice(REVIEW.length)))
    .filter((r): r is WeeklyReview => r !== null)
    .sort((a, b) => b.week.localeCompare(a.week));
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const BLANK_META: Meta = { schema: SCHEMA, lastSettledOn: null, lastExportAt: null };

export function getMeta(): Meta {
  const v = read(META);
  if (!isObject(v)) return { ...BLANK_META };
  return {
    schema: SCHEMA,
    lastSettledOn: typeof v['lastSettledOn'] === 'string' ? v['lastSettledOn'] : null,
    lastExportAt: typeof v['lastExportAt'] === 'string' ? v['lastExportAt'] : null,
  };
}

export function saveMeta(meta: Meta): void {
  write(META, { ...meta, schema: SCHEMA });
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export interface ExportDocument {
  schema: typeof SCHEMA;
  exportedAt: string;
  days: Record<ISODate, DayEntry>;
  reviews: Record<ISOWeek, WeeklyReview>;
  meta: Meta;
}

export interface ImportResult {
  added: number;
  updated: number;
  /** Records skipped because the stored copy is newer or identical. */
  skipped: number;
  ok: boolean;
  error?: string;
}

function keysWithPrefix(prefix: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(prefix)) out.push(key);
    }
  } catch {
    return [];
  }
  return out;
}

export function exportAll(now: Date = new Date()): string {
  const days: Record<ISODate, DayEntry> = {};
  for (const key of keysWithPrefix(DAY)) {
    const date = key.slice(DAY.length);
    const day = getDay(date);
    if (day) days[date] = day;
  }

  const reviews: Record<ISOWeek, WeeklyReview> = {};
  for (const review of getAllReviews()) reviews[review.week] = review;

  const doc: ExportDocument = {
    schema: SCHEMA,
    exportedAt: now.toISOString(),
    days,
    reviews,
    meta: getMeta(),
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Merges an export document into whatever is already stored, resolving each record
 * by `updatedAt` — newest wins.
 *
 * Merge rather than replace, because a restore onto a device that has been used
 * since the export must not silently discard the newer entries. There is no sync
 * and no server-side copy; a clobbering import would be unrecoverable.
 */
export function importAll(json: string): ImportResult {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, ok: true };

  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return { ...result, ok: false, error: 'That file is not valid JSON.' };
  }

  if (!isObject(doc) || !isObject(doc['days'])) {
    return { ...result, ok: false, error: 'That file is not a daily export.' };
  }

  for (const [date, raw] of Object.entries(doc['days'])) {
    const incoming = parseDay(raw, date);
    if (!incoming) {
      result.skipped++;
      continue;
    }

    const existing = getDay(date);
    if (!existing) {
      writeDayRaw(incoming);
      result.added++;
    } else if (incoming.updatedAt > existing.updatedAt) {
      writeDayRaw(incoming);
      result.updated++;
    } else {
      result.skipped++;
    }
  }

  const reviews = doc['reviews'];
  if (isObject(reviews)) {
    for (const [week, raw] of Object.entries(reviews)) {
      const incoming = parseReview(raw, week);
      if (!incoming) {
        result.skipped++;
        continue;
      }

      const existing = getReview(week);
      if (!existing) {
        write(REVIEW + week, incoming);
        result.added++;
      } else if (incoming.updatedAt > existing.updatedAt) {
        write(REVIEW + week, incoming);
        result.updated++;
      } else {
        result.skipped++;
      }
    }
  }

  // Meta is deliberately left alone. An import is not an export, and `lastSettledOn`
  // must not be adopted from another device — settlement recomputes it on next open.
  return result;
}

/** Records that an export was taken, which drives the monthly reminder banner. */
export function markExported(now: Date = new Date()): void {
  saveMeta({ ...getMeta(), lastExportAt: now.toISOString() });
}
