import { Heatmap } from '../components/Heatmap';
import { monthDates, parseISO, todayISO } from '../dates';
import { gradeDay } from '../grading';
import { getMonth } from '../storage';
import type { YearMonth } from '../types';

interface YearProps {
  year: number;
  onChangeYear: (year: number) => void;
  onSelectMonth: (ym: YearMonth) => void;
  onBack: () => void;
}

/**
 * The outer limit of history, and deliberately the thinnest screen in the app.
 *
 * Twelve heatmaps and nothing else — no annual totals, no best month, no "you were
 * 62% green this year". It answers one question, how much of the year held, and a
 * second number on this page turns the answer into a dashboard
 * (IMPLEMENTATION_PHASES.md, phase 7).
 *
 * Cells are inert here. A month is the tap target, because a day is not a useful
 * thing to aim at 20px wide and the day's detail lives one screen down anyway.
 */
export function Year({ year, onChangeYear, onSelectMonth, onBack }: YearProps) {
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));

  const months = Array.from({ length: 12 }, (_, i) => {
    const ym: YearMonth = `${year}-${String(i + 1).padStart(2, '0')}`;
    const days = getMonth(ym);
    const dates = monthDates(ym);

    return {
      ym,
      name: parseISO(`${ym}-01`).toLocaleDateString(undefined, { month: 'long' }),
      leadingBlanks: (parseISO(`${ym}-01`).getDay() + 6) % 7, // Monday = 0
      cells: dates.map((date, d) => ({ date, grade: gradeDay(days[d] ?? null) })),
    };
  });

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-8">
      <header className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 min-h-11 text-sm text-muted underline underline-offset-4"
        >
          Back
        </button>

        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-2xl text-ink">{year}</h1>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => onChangeYear(year - 1)}
              className="min-h-11 px-3 text-lg text-muted"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next year"
              disabled={year >= thisYear}
              onClick={() => onChangeYear(year + 1)}
              className="min-h-11 px-3 text-lg text-muted disabled:text-faint/40"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      {/* Two columns on a phone. Three would put a cell near 13px, at which point it
          stops reading as anything. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        {months.map(({ ym, name, leadingBlanks, cells }) => (
          <button
            key={ym}
            type="button"
            aria-label={`${name} ${year}`}
            onClick={() => onSelectMonth(ym)}
            className="text-left"
          >
            <span className="mb-1.5 block text-xs text-muted">{name}</span>
            <Heatmap cells={cells} leadingBlanks={leadingBlanks} size="year" marked={today} />
          </button>
        ))}
      </div>
    </div>
  );
}
