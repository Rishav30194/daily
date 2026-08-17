import { Heatmap } from '../components/Heatmap';
import { ItemRateBar } from '../components/ItemRateBar';
import { UrgeChart } from '../components/UrgeChart';
import { monthDates, monthOf, parseISO, shiftMonth, todayISO } from '../dates';
import {
  englishRate,
  gradeCounts,
  gradeDay,
  itemRates,
  slotSplit,
  urgeSeries,
} from '../grading';
import { getMonth } from '../storage';
import { ITEM_LABELS, type ISODate, type YearMonth } from '../types';

interface MonthProps {
  ym: YearMonth;
  onChangeMonth: (ym: YearMonth) => void;
  onSelectDay: (date: ISODate) => void;
  onToday: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-4 text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/**
 * The diagnostic screen. The day colour says a day broke; this says which item is
 * breaking, which is the whole reason the month view exists (SPEC.md §6).
 *
 * Ordered by how much each part answers that question: the heatmap first for shape,
 * the per-item bars next because they are the actual diagnosis, then the urge trend.
 * English sits below a divider at the end — tracked, never part of a grade.
 */
export function Month({ ym, onChangeMonth, onSelectDay, onToday }: MonthProps) {
  const dates = monthDates(ym);
  const days = getMonth(ym);

  const counts = gradeCounts(days);
  const rates = itemRates(days);
  const slots = slotSplit(days);
  const english = englishRate(days);

  const today = todayISO();
  // Nothing lives in the future, so there is nothing to page forward into.
  const atCurrentMonth = ym >= monthOf(today);

  const first = dates[0] ?? `${ym}-01`;
  const leadingBlanks = (parseISO(first).getDay() + 6) % 7; // Monday = 0

  const title = parseISO(first).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-8">
      <header className="mb-6">
        <button
          type="button"
          onClick={onToday}
          className="mb-4 min-h-11 text-sm text-muted underline underline-offset-4"
        >
          Today's entry
        </button>

        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-2xl text-ink">{title}</h1>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => onChangeMonth(shiftMonth(ym, -1))}
              className="min-h-11 px-3 text-lg text-muted"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={atCurrentMonth}
              onClick={() => onChangeMonth(shiftMonth(ym, 1))}
              className="min-h-11 px-3 text-lg text-muted disabled:text-faint/40"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-7">
        <Heatmap
          cells={dates.map((date, i) => ({ date, grade: gradeDay(days[i] ?? null) }))}
          leadingBlanks={leadingBlanks}
          marked={today}
          onSelect={onSelectDay}
        />

        {/* The counts restate the heatmap as text, so the grades are readable
            without separating three hues (ARCHITECTURE.md §8). */}
        <p className="font-serif text-sm tabular-nums text-muted">
          {counts.green} green · {counts.amber} amber · {counts.red} red ·{' '}
          {percent(counts.percentGreen)} green
        </p>

        <Section title="Per item">
          <div className="grid gap-4">
            {rates.map((rate) => (
              <ItemRateBar
                key={rate.item}
                label={ITEM_LABELS[rate.item]}
                passed={rate.passed}
                applicable={rate.applicable}
                rate={rate.rate}
              />
            ))}
          </div>

          {/* If 3:00 is winning over a month, 11:00 is not a real slot and should be
              moved rather than defended (SPEC.md §2.1). */}
          <p className="mt-4 font-serif text-sm tabular-nums text-muted">
            System design at 11:00 — {slots['11:00']} · at 3:00 — {slots['15:00']}
          </p>
        </Section>

        <Section title="Urges">
          <UrgeChart points={urgeSeries(days, dates)} />
        </Section>

        {/* Below the divider and last, because it never touches a day's colour. */}
        <section className="mt-2 border-t border-line pt-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted">English</span>
            <span className="font-serif text-sm tabular-nums text-muted">
              {english.completed}/{english.applicable} · {percent(english.rate)}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
