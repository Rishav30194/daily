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

/**
 * Minimal in-memory `localStorage`, installed on globalThis by the storage tests.
 *
 * Injecting a backend into storage.ts would be an abstraction with exactly one real
 * implementation, so the tests supply the global instead.
 */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  /** Set to throw on the next write, to exercise the quota path. */
  failNextWrite: 'quota' | null = null;

  get length(): number {
    return this.map.size;
  }

  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }

  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }

  setItem(k: string, v: string): void {
    if (this.failNextWrite === 'quota') {
      this.failNextWrite = null;
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(k, v);
  }

  removeItem(k: string): void {
    this.map.delete(k);
  }

  clear(): void {
    this.map.clear();
  }
}

/** Installs a fresh store and returns it. */
export function installStorage(): MemoryStorage {
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
  return store;
}
