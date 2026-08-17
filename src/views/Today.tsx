import { useEffect, useMemo, useState } from 'react';

import { BinaryControl } from '../components/BinaryControl';
import { CarriedInBanner } from '../components/CarriedInBanner';
import { CarryControl } from '../components/CarryControl';
import { ChoiceControl } from '../components/ChoiceControl';
import { EnglishGroup } from '../components/EnglishGroup';
import { PhoneControl } from '../components/PhoneControl';
import { SlotControl } from '../components/SlotControl';
import { UrgeInput } from '../components/UrgeInput';
import { CARRY_WINDOW_DAYS, canCarry, carriedInto, carryItem, completeCarried } from '../carry';
import { addDays, todayISO } from '../dates';
import { appliesOn } from '../grading';
import { StorageFullError, getDay, getRange, saveDay } from '../storage';
import type { DayEntry, DoingItemId, ISODate } from '../types';

interface TodayProps {
  date: ISODate;
}

function blank(date: ISODate): DayEntry {
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
    updatedAt: new Date(0).toISOString(),
  };
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-1 text-sm font-medium text-ink">{title}</h2>
      {note && <p className="mb-3 text-xs text-faint">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

/**
 * The default screen, and the whole ninety seconds: four states, one number, and
 * optionally a line of text.
 *
 * Saves run straight through on every change — no debounce and no autosave timer.
 * The app is open for a minute and a half; a dropped write is far worse than a
 * redundant one.
 */
export function Today({ date }: TodayProps) {
  const [entry, setEntry] = useState<DayEntry>(() => getDay(date) ?? blank(date));
  // Held separately because the carry banner writes to it: completing a carried
  // item lands on the day it came from, not on this one.
  const [previous, setPrevious] = useState<DayEntry | null>(() => getDay(addDays(date, -1)));
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(getDay(date) ?? blank(date));
    setPrevious(getDay(addDays(date, -1)));
  }, [date]);

  /** Every write in this view goes through here — there is exactly one place a full
   *  disk can surface, and one message for it. */
  function persist(target: ISODate, next: DayEntry): void {
    try {
      saveDay(target, next);
      setStorageError(null);
    } catch (err) {
      // The only storage error the user ever sees, because the only remedy is
      // to export.
      if (err instanceof StorageFullError) setStorageError(err.message);
      else throw err;
    }
  }

  function update(patch: Partial<DayEntry>) {
    const next = { ...entry, ...patch };
    setEntry(next);
    persist(date, next);
  }

  const today = todayISO();
  // Deferring is a decision about the day you are in. On any other date the control
  // is absent: carrying from a day already gone is either an instant expiry or a
  // retroactive rescue, and both are ways round "do it today or take the miss".
  const isToday = date === today;

  // Days older than yesterday cannot change while this view is open — settlement
  // already ran, and nothing here writes that far back — so they are read once.
  const older = useMemo(
    () => getRange(addDays(date, -(CARRY_WINDOW_DAYS - 1)), addDays(date, -2)),
    [date],
  );
  const carryWindow = [...older, previous, entry];

  function carry(item: DoingItemId) {
    const next = carryItem(item, entry, new Date());
    setEntry(next);
    persist(date, next);
  }

  function carryControl(item: DoingItemId) {
    if (!isToday) return null;
    return (
      <CarryControl
        verdict={canCarry(item, entry, carryWindow, today)}
        onCarry={() => carry(item)}
      />
    );
  }

  function toggleCarriedIn(item: DoingItemId, done: boolean) {
    if (!previous) return;
    const next = completeCarried(item, previous, done, new Date());
    setPrevious(next);
    persist(next.date, next);
  }

  const { office: officeApplies } = appliesOn(date);

  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-8">
      <header className="mb-7">
        <h1 className="font-serif text-2xl text-ink">{weekday}</h1>
        {!officeApplies && (
          <p className="mt-1 text-xs text-faint">
            Weekend — the office target does not apply today.
          </p>
        )}
      </header>

      {storageError && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-ink px-4 py-3 text-sm text-ink"
        >
          {storageError}
        </p>
      )}

      {/* Yesterday's debt sits above today's own work, because it is owed first. */}
      {isToday && (
        <CarriedInBanner items={carriedInto(previous, date)} onToggle={toggleCarriedIn} />
      )}

      <div className="grid gap-7">
        {/* No carry control here, ever: the phone item cannot be carried, which is
            why it is not a DoingItemId (SPEC.md §4). */}
        <Section title="Phone">
          <PhoneControl value={entry.phone} onChange={(phone) => update({ phone })} />
        </Section>

        <Section title="System design" note="45 min during the workday">
          <SlotControl
            value={entry.systemDesign}
            onChange={(systemDesign) => update({ systemDesign })}
          />
          {carryControl('systemDesign')}
        </Section>

        <Section title="Coding / certification" note="45 min, one or the other">
          <ChoiceControl value={entry.coding} onChange={(coding) => update({ coding })} />
          {carryControl('coding')}
        </Section>

        {/* Weekends drop the office target entirely — not rendered, not counted,
            not shown as failed (SPEC.md §5). */}
        {officeApplies && (
          <Section title="Office target" note="did you finish what you set out to do">
            <BinaryControl value={entry.office} onChange={(office) => update({ office })} />
            {carryControl('office')}
          </Section>
        )}

        <Section title="Urges">
          <UrgeInput value={entry.urges} onChange={(urges) => update({ urges })} />
        </Section>

        <Section title="Note" note="what broke, or what helped">
          <input
            type="text"
            value={entry.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="Optional"
            className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint"
          />
        </Section>

        {/* Set apart below the core four, and after the note, because it does not
            count toward the day's colour. */}
        <div className="mt-2 border-t border-line pt-6">
          <EnglishGroup value={entry.english} onChange={(english) => update({ english })} />
        </div>
      </div>
    </div>
  );
}
