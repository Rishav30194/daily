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

/** 11:00 is where system design is meant to happen; 15:00 exists only so an
 *  unpredictable workday doesn't force a miss. The app records which was used. */
export type Slot = '11:00' | '15:00';

export type CodeChoice = 'coding' | 'cert';

export type Grade = 'green' | 'amber' | 'red';

/** The three items that can be carried. Phone is deliberately absent: "the phone
 *  can never be carried" is enforced by this type, not by a runtime check. */
export type DoingItemId = 'systemDesign' | 'coding' | 'office';

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

export interface CodingState extends ItemState {
  choice?: CodeChoice;
}

export interface EnglishState {
  standup: boolean;
  rewrite: boolean;
  drill: boolean;
}

export interface DayEntry {
  schema: 1;
  date: ISODate;
  phone: PhoneState | null;
  systemDesign: SystemDesignState;
  coding: CodingState;
  /** Ignored entirely on weekends — not counted, not shown as failed. */
  office: ItemState;
  english: EnglishState;
  /** null = deliberately blank, which is NOT zero. Blank means "not recorded";
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
  schema: 1;
  lastSettledOn: ISODate | null;
  lastExportAt: string | null;
}
