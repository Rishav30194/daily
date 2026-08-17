import type { DayEntry, ItemStatus, PhoneState } from './types';

/** Test-only entry factory. Defaults to a blank day so each test states only the
 *  fields its rule depends on. */
export function entry(date: string, over: Partial<DayEntry> = {}): DayEntry {
  return {
    schema: 1,
    date,
    phone: null,
    systemDesign: { status: 'pending' },
    coding: { status: 'pending' },
    office: { status: 'pending' },
    english: { standup: false, rewrite: false, drill: false },
    urges: null,
    note: '',
    updatedAt: '2026-08-17T20:00:00.000Z',
    ...over,
  };
}

/** A day where every core item passes, for tests that vary one thing. */
export function perfect(date: string, over: Partial<DayEntry> = {}): DayEntry {
  return entry(date, {
    phone: 'clean',
    systemDesign: { status: 'done', slot: '11:00' },
    coding: { status: 'done', choice: 'coding' },
    office: { status: 'done' },
    ...over,
  });
}

export function withStatus(status: ItemStatus, dueOn?: string) {
  return dueOn === undefined ? { status } : { status, dueOn };
}

export const phones: PhoneState[] = ['clean', 'slip', 'lost'];
