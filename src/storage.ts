import { monthDates, rangeDates, toISO, weekKey, weekStart } from './dates';
import type {
  DayEntry,
  ISODate,
  ISOWeek,
  ItemState,
  ItemStatus,
  Meta,
  Slot,
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

const SCHEMA = 2 as const;

/** A write the device refused. Views catch this base class, so a new reason for a
 *  refusal cannot escape as an unhandled throw out of a click handler. */
export class StorageWriteError extends Error {}

/** Out of room. The only remedy is to export, so that is what the message says. */
export class StorageFullError extends StorageWriteError {
  constructor() {
    super('Storage is full. Export your data from settings to avoid losing entries.');
    this.name = 'StorageFullError';
  }
}

/**
 * Storage exists but refuses writes — private mode, blocked cookies, a locked-down
 * browser.
 *
 * Reads already treat this as "nothing stored" rather than throwing. Writes have to
 * match: crashing the tree on the first tap is worse than saying plainly that
 * nothing is being kept.
 */
export class StorageUnavailableError extends StorageWriteError {
  constructor() {
    super('This browser is not saving data, so entries will be lost. Check private browsing.');
    this.name = 'StorageUnavailableError';
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
    // A malformed value reads as absent. A day that does not parse is a blank cell,
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
    throw new StorageUnavailableError();
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function itemState(v: unknown): { status: ItemStatus; dueOn?: ISODate } {
  const statuses = ['pending', 'done', 'missed', 'carried', 'expired'] as const;
  if (!isObject(v)) return { status: 'pending' };

  const status = statuses.find((s) => s === v['status']) ?? 'pending';

  // Only a real date survives. `dueOn` is read back by `parseISO` and `diffDays`,
  // both of which throw on anything else — in settlement during startup, and in the
  // carried line on Today. A corrupt value has to be dropped at the boundary, not
  // met halfway through a render.
  const raw = v['dueOn'];
  const dueOn = typeof raw === 'string' && isISODate(raw) ? raw : undefined;

  // Half a carry is still a carry, and it must never read as a pass or as a free
  // slot. Two halves can go missing, and both resolve to `expired`:
  //
  //   no readable date — `settle` skips a carry without a `dueOn` and `itemPasses`
  //   counts `carried` as a pass, so the day would stay green for ever while holding
  //   a slot in the rolling window;
  //
  //   a date with no status to match it — `dueOn` is only ever written alongside a
  //   carry, and only `carried`, `done` and `expired` can carry one. Anything else
  //   holding a date is a carry whose status was lost or corrupted; reading it as
  //   `pending` would free its slot and put the carry control back on an item that
  //   was already carried, which is both hard limits in SPEC.md §4 gone at once.
  //
  // `expired` is the honest reading of both: a carry happened, and nothing says it
  // landed.
  const canHoldDueOn = status === 'carried' || status === 'done' || status === 'expired';
  const brokenCarry =
    (status === 'carried' && dueOn === undefined) || (dueOn !== undefined && !canHoldDueOn);

  if (brokenCarry) return { status: 'expired' };

  return dueOn === undefined ? { status } : { status, dueOn };
}

const SLOTS = ['19:00', '21:00'] as const;

/**
 * Schema 1 recorded the workday slots, 11:00 and 3:00, before the study hour moved
 * to the evening. Early maps to early, so the month view's split keeps its history
 * rather than restarting from an empty chart.
 */
const SLOT_V1: Record<string, Slot> = { '11:00': '19:00', '15:00': '21:00' };

function readSlot(v: unknown): Slot | undefined {
  const raw = isObject(v) ? v['slot'] : undefined;
  const current = SLOTS.find((s) => s === raw);
  if (current) return current;
  return typeof raw === 'string' ? SLOT_V1[raw] : undefined;
}

/**
 * Schema 1 held one `coding` item carrying a choice of 'coding' or 'cert'; schema 2
 * splits it into two items that are scheduled on different days.
 *
 * `choice: 'coding'` always meant LLD, so that is where it lands — including when
 * the choice is missing entirely, which is every day the item was pending, missed
 * or carried without being finished.
 *
 * The item's status travels with it. A v1 carry has to arrive as a carry on exactly
 * one of the two items, or settlement will never expire it and its slot in the
 * rolling window is held for good.
 */
function migrateCoding(v: Record<string, unknown>): { cert: ItemState; lld: ItemState } {
  const state = itemState(v['coding']);
  const raw = isObject(v['coding']) ? v['coding'] : {};
  const blank: ItemState = { status: 'pending' };
  return raw['choice'] === 'cert' ? { cert: state, lld: blank } : { cert: blank, lld: state };
}

/**
 * Parses an unknown value into a DayEntry, or null if it is not one.
 *
 * Missing optional fields are filled with their blank values, but `urges` is only
 * ever a number or null — an absent or non-numeric urge count reads as null (not
 * recorded), never as 0.
 *
 * Schema 1 entries are migrated on read. Nothing rewrites them in place: a v1 day
 * older than the edit window is never saved again, and reading it as v2 every time
 * costs nothing.
 */
function parseDay(v: unknown, date: ISODate): DayEntry | null {
  if (!isObject(v)) return null;

  const phones = ['clean', 'slip', 'lost'] as const;

  const sd = itemState(v['systemDesign']);
  const slot = readSlot(v['systemDesign']);

  const split =
    'cert' in v || 'lld' in v
      ? { cert: itemState(v['cert']), lld: itemState(v['lld']) }
      : migrateCoding(v);

  const english = isObject(v['english']) ? v['english'] : {};

  return {
    schema: SCHEMA,
    // The key an entry is filed under is the truth, never the `date` inside it. They
    // disagree only in a hand-edited or corrupt export, and trusting the record would
    // let it overwrite a different day than the one the merge compared.
    date,
    phone: phones.find((p) => p === v['phone']) ?? null,
    systemDesign: slot === undefined ? sd : { ...sd, slot },
    cert: split.cert,
    lld: split.lld,
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
    // The key wins, as it does for days. `weekStart` throws on anything that is not
    // 'YYYY-Www', and the review list renders every stored week — so one bad value
    // taken from a record would crash the view the app opens on every Sunday.
    week,
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
    .map((k) => k.slice(REVIEW.length))
    // Filtered here as well as on import, because a key written before that check
    // existed would otherwise still reach `weekStart` and throw mid-render.
    .filter(isISOWeek)
    .map(getReview)
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
  const settled = v['lastSettledOn'];
  return {
    schema: SCHEMA,
    // Validated for the same reason `dueOn` is: settlement feeds this straight into
    // `diffDays`, which throws on a non-date. That happens inside App's state
    // initialiser, during render, where a throw is a blank page on every launch with
    // no way back. Unreadable reads as "never settled", which is always safe — the
    // 14-day floor still runs.
    lastSettledOn: typeof settled === 'string' && isISODate(settled) ? settled : null,
    // Validated too, and for a nastier reason than it looks: the reminder compares
    // `now - lastExportAt` against 30 days, and arithmetic on an unparseable date is
    // NaN, which fails every comparison. An unreadable value would switch off the
    // only defence against iOS clearing site data — silently, for ever.
    lastExportAt: isTimestamp(v['lastExportAt']) ? v['lastExportAt'] : null,
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
  /** Records skipped because the stored copy is newer or identical, or the key was
   *  not a date. */
  skipped: number;
  ok: boolean;
  error?: string;
  /** Oldest day the document touched, or null if it contained none. Callers settle
   *  from here: a restored backup can hold carries that fell due long ago, and they
   *  have to expire on arrival rather than sit as passes for ever. */
  oldestDay: ISODate | null;
}

/** A string `Date` can actually parse. Anything else turns into NaN in arithmetic,
 *  and NaN fails every comparison silently rather than loudly. */
function isTimestamp(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
}

/** 'YYYY-MM-DD' and a real calendar date. An import key that is neither is not a day
 *  and must not become a storage key. */
function isISODate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toISO(d) === v;
}

/**
 * 'YYYY-Www', and a week that year actually has. Same reason as `isISODate`:
 * `weekStart` throws on anything else, and it is called while rendering the review
 * history.
 *
 * Checked by round trip rather than by range, because most years have 52 weeks and
 * a bare 01–53 test lets `2025-W53` through — `weekStart` resolves it to 29 December
 * 2025, which is really `2026-W01`, so the history would show two rows covering the
 * same dates.
 */
function isISOWeek(v: string): boolean {
  if (!/^\d{4}-W\d{2}$/.test(v)) return false;
  try {
    return weekKey(weekStart(v)) === v;
  } catch {
    return false;
  }
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
    // Filtered on the way out as well as on the way in. A key that is not a date
    // cannot be re-imported, so copying it into the backup only buys a permanent,
    // unexplained "1 skipped" on every future restore.
    if (!isISODate(date)) continue;
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
 *
 * `dryRun` counts without writing. The summary has to be shown *before* anything is
 * committed (ARCHITECTURE.md §4), and the only honest way to produce those numbers
 * is to run the same merge that runs for real — a second implementation of the rule
 * living in the UI is a rule that can disagree with itself.
 */
export function importAll(json: string, dryRun = false): ImportResult {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, ok: true, oldestDay: null };

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
    const incoming = isISODate(date) ? parseDay(raw, date) : null;
    if (!incoming) {
      result.skipped++;
      continue;
    }

    if (result.oldestDay === null || date < result.oldestDay) result.oldestDay = date;

    const existing = getDay(date);
    if (!existing) {
      if (!dryRun) writeDayRaw(incoming);
      result.added++;
    } else if (incoming.updatedAt > existing.updatedAt) {
      if (!dryRun) writeDayRaw(incoming);
      result.updated++;
    } else {
      result.skipped++;
    }
  }

  const reviews = doc['reviews'];
  if (isObject(reviews)) {
    for (const [week, raw] of Object.entries(reviews)) {
      const incoming = isISOWeek(week) ? parseReview(raw, week) : null;
      if (!incoming) {
        result.skipped++;
        continue;
      }

      const existing = getReview(week);
      if (!existing) {
        if (!dryRun) write(REVIEW + week, incoming);
        result.added++;
      } else if (incoming.updatedAt > existing.updatedAt) {
        if (!dryRun) write(REVIEW + week, incoming);
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
