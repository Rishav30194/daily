/** 'YYYY-MM-DD', a local calendar date. Dates cross module boundaries as these,
 *  never as `Date` — a Date carries a time and a timezone that nothing else wants. */
export type ISODate = string;

/** 'YYYY-MM' */
export type YearMonth = string;

/** 'YYYY-Www', ISO week. Weeks end Sunday, which is when the review runs. */
export type ISOWeek = string;

/** Three states, never a checkbox. `slip` is a pass: stopping mid-scroll is the
 *  skill being trained, and grading it as failure turns one slip into a lost day. */
export type PhoneState = 'clean' | 'slip' | 'lost';

/** 7:00 is where system design is meant to happen; 9:00 exists only so an
 *  unpredictable evening doesn't force a miss. The app records which was used. */
export type Slot = '19:00' | '21:00';

export type Grade = 'green' | 'amber' | 'red';

/**
 * The three study subjects. One of them is scheduled on a weekday and all three at
 * the weekend (`schedule.ts`).
 *
 * `cert` is a slot rather than a particular certification: whichever one is in
 * flight lives here, and passing one and starting the next is not a change to this
 * app. Which certification it is belongs in a weekly review note, not in the data.
 */
export type StudyItemId = 'systemDesign' | 'cert' | 'lld';

/** The items that can be carried — the study subjects plus the office target. Phone
 *  is deliberately absent: "the phone can never be carried" is enforced by this type,
 *  not by a runtime check. */
export type DoingItemId = StudyItemId | 'office';

/**
 * How each item is named wherever it is named — the month view, the carry banner,
 * the weekly review's "LLD was missed 3 days this week."
 *
 * It lives next to the type that fixes the list because there is exactly one list
 * and no UI for creating, renaming, hiding or reordering it. Three views naming the
 * same item three ways is how that stops being true.
 */
export const ITEM_LABELS: Record<DoingItemId | 'phone', string> = {
  phone: 'Phone',
  systemDesign: 'System design',
  cert: 'Certification',
  lld: 'LLD',
  office: 'Office target',
};

export type ItemStatus =
  | 'pending'
  | 'done'
  | 'missed'
  | 'carried'
  | 'expired';

export interface ItemState {
  status: ItemStatus;
  /** Set when carried: the day it must be completed on. */
  dueOn?: ISODate;
}

export interface SystemDesignState extends ItemState {
  slot?: Slot;
}

export interface EnglishState {
  standup: boolean;
  rewrite: boolean;
  drill: boolean;
}

export interface DayEntry {
  schema: 2;
  date: ISODate;
  phone: PhoneState | null;
  /** Present on every entry, scheduled or not. An item the day did not ask for is
   *  never rendered and never graded, so it simply stays `pending`. */
  systemDesign: SystemDesignState;
  cert: ItemState;
  lld: ItemState;
  /** Ignored entirely on weekends — not counted, not shown as failed. */
  office: ItemState;
  english: EnglishState;
  /** null = deliberately blank, which is *not* zero. Blank means "not recorded";
   *  zero means "recorded, and it was zero" — a genuinely good day. Never coalesce. */
  urges: number | null;
  note: string;
  updatedAt: string;
}

export interface WeeklyReview {
  week: ISOWeek;
  change: string;
  updatedAt: string;
}

export interface Meta {
  schema: 2;
  lastSettledOn: ISODate | null;
  lastExportAt: string | null;
}
