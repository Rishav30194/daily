// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { addDays, todayISO } from '../dates';
import { writeDayRaw } from '../storage';
import { entry, installStorage } from '../testing';
import { Today } from './Today';

/**
 * The wiring tests. Every bug these cover was found by review rather than by the
 * suite, because each one lived in the join between a correct domain rule and the
 * controls on top of it — which is exactly the seam unit tests cannot see.
 *
 * The clock is pinned, because which sections exist now depends on the weekday: a
 * Wednesday asks for system design and a Monday asks for the certification. Left on
 * the real clock these tests would pass or fail according to the day they ran.
 */

/** Wednesday 19 August 2026 — system design, then the office target. */
const WED = new Date(2026, 7, 19, 20, 0, 0);
/** Monday 17 August 2026 — the certification, then the office target. */
const MON = new Date(2026, 7, 17, 20, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(WED);
  installStorage();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const noop = () => {};

function show(date: string) {
  render(<Today date={date} onOpenMonth={noop} />);
}

/** One item's section, so a question about system design cannot be answered by the
 *  office controls sitting further down the page. */
function section(title: string) {
  const heading = screen.getByRole('heading', { name: title, level: 2 });
  const el = heading.closest('section');
  if (!el) throw new Error(`no section around ${title}`);
  return within(el);
}

describe('the day renders what the schedule asked for', () => {
  test('a weekday shows its one subject and the office target', () => {
    show(todayISO());

    expect(screen.getByRole('heading', { name: 'System design', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Office target', level: 2 })).toBeTruthy();
    // Wednesday's hour is spent. There is no control here to record the others, so
    // the easy subject cannot quietly take the evening.
    expect(screen.queryByRole('heading', { name: 'Certification', level: 2 })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'LLD', level: 2 })).toBeNull();
  });

  test('a different weekday shows a different subject', () => {
    vi.setSystemTime(MON);
    show(todayISO());

    expect(screen.getByRole('heading', { name: 'Certification', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'System design', level: 2 })).toBeNull();
  });

  test('a weekend shows all three subjects and no office target', () => {
    // Saturday just gone, not the one coming: a future day is locked and would
    // render the read-only record instead of controls.
    const sat = addDays(todayISO(), -4);
    show(sat);

    for (const title of ['Certification', 'System design', 'LLD']) {
      expect(screen.getByRole('heading', { name: title, level: 2 })).toBeTruthy();
    }
    expect(screen.queryByRole('heading', { name: 'Office target', level: 2 })).toBeNull();
  });
});

describe('a carried item cannot be withdrawn', () => {
  test('its own controls are gone, not merely disabled', () => {
    // The controls replace the whole item state, so leaving them on screen let
    // "Missed" overwrite {status:'carried', dueOn} — erasing the carry, freeing its
    // slot in the rolling window, and bringing the carry control back. Carry,
    // un-carry, carry again, for ever.
    const today = todayISO();
    writeDayRaw(
      entry(today, { systemDesign: { status: 'carried', dueOn: addDays(today, 1) } }),
    );

    show(today);
    const sd = section('System design');

    expect(sd.queryAllByRole('button')).toHaveLength(0);
    expect(sd.getByText(/Carried to/)).toBeTruthy();

    // The other items are untouched — the lock is per item, not per screen.
    expect(section('Office target').getAllByRole('button').length).toBeGreaterThan(0);
  });

  test('an expired carry cannot be edited back into a pass', () => {
    // Expiry has no undo, so the same hole in the other direction has to be shut.
    vi.setSystemTime(MON);
    const today = todayISO();
    writeDayRaw(entry(today, { cert: { status: 'expired', dueOn: today } }));

    show(today);
    const cert = section('Certification');

    expect(cert.queryAllByRole('button')).toHaveLength(0);
    expect(cert.getByText(/Carried, then missed/)).toBeTruthy();
  });

  test('an ordinary pending item keeps its controls', () => {
    // The guard above must not swallow the normal case.
    show(todayISO());

    expect(screen.getByRole('button', { name: /Done at 7:00/ })).toBeTruthy();
  });
});

describe('the seven-day edit lock', () => {
  const old = () => addDays(todayISO(), -10);

  test('a day older than seven days offers no control at all', () => {
    writeDayRaw(entry(old(), { phone: 'slip', urges: 0, note: 'long day' }));

    show(old());

    // Values, not disabled inputs: a greyed-out control reads as broken.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Done at 7:00/ })).toBeNull();
    expect(screen.getByText('Slip caught')).toBeTruthy();
    expect(screen.getByText('long day')).toBeTruthy();
  });

  test('a recorded zero reads as zero, and blank reads as not recorded', () => {
    // The distinction the whole urge chart depends on, at the one place it is
    // rendered as words.
    writeDayRaw(entry(old(), { urges: 0 }));
    show(old());
    expect(screen.getByText('0')).toBeTruthy();

    cleanup();

    writeDayRaw(entry(old(), { urges: null }));
    show(old());
    expect(screen.getByText('Not recorded')).toBeTruthy();
  });

  test('a completed carry does not invent a slot it never used', () => {
    // A carry finished from the next day's banner is `done` with no slot recorded.
    // Rendering it as "Done at 7:00" put a slot in the record that never happened,
    // and contradicted the month view, which skips exactly those entries.
    writeDayRaw(
      entry(old(), { systemDesign: { status: 'done', dueOn: addDays(old(), 1) } }),
    );

    show(old());

    expect(screen.queryByText(/Done at 7:00/)).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  test('a locked day lists only the items it asked for', () => {
    // The read-only record has to agree with the schedule too. A row saying "Missed"
    // for a subject that day never owed would be a record of work never owed.
    const wed = addDays(todayISO(), -14); // a Wednesday, ten days is not enough
    writeDayRaw(entry(wed, { phone: 'clean' }));

    show(wed);

    expect(screen.getByText('System design')).toBeTruthy();
    expect(screen.queryByText('LLD')).toBeNull();
  });

  test('a future day is read-only too', () => {
    show(addDays(todayISO(), 3));
    expect(screen.getByText(/has not happened yet/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
