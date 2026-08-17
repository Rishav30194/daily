import { useEffect, useState } from 'react';

import { BinaryControl } from '../components/BinaryControl';
import { ChoiceControl } from '../components/ChoiceControl';
import { EnglishGroup } from '../components/EnglishGroup';
import { PhoneControl } from '../components/PhoneControl';
import { SlotControl } from '../components/SlotControl';
import { UrgeInput } from '../components/UrgeInput';
import { appliesOn } from '../grading';
import { StorageFullError, getDay, saveDay } from '../storage';
import type { DayEntry, ISODate } from '../types';

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
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(getDay(date) ?? blank(date));
  }, [date]);

  function update(patch: Partial<DayEntry>) {
    const next = { ...entry, ...patch };
    setEntry(next);
    try {
      saveDay(date, next);
      setStorageError(null);
    } catch (err) {
      // The only storage error the user ever sees, because the only remedy is
      // to export.
      if (err instanceof StorageFullError) setStorageError(err.message);
      else throw err;
    }
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

      <div className="grid gap-7">
        <Section title="Phone">
          <PhoneControl value={entry.phone} onChange={(phone) => update({ phone })} />
        </Section>

        <Section title="System design" note="45 min during the workday">
          <SlotControl
            value={entry.systemDesign}
            onChange={(systemDesign) => update({ systemDesign })}
          />
        </Section>

        <Section title="Coding / certification" note="45 min, one or the other">
          <ChoiceControl value={entry.coding} onChange={(coding) => update({ coding })} />
        </Section>

        {/* Weekends drop the office target entirely — not rendered, not counted,
            not shown as failed (SPEC.md §5). */}
        {officeApplies && (
          <Section title="Office target" note="did you finish what you set out to do">
            <BinaryControl value={entry.office} onChange={(office) => update({ office })} />
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
