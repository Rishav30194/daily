import { useEffect, useRef, useState } from 'react';

import { Heatmap } from '../components/Heatmap';
import { addDays, parseISO, rangeDates, weekKey, weekRange, weekStart } from '../dates';
import { gradeDay, mostMissed } from '../grading';
import { StorageWriteError, getAllReviews, getRange, getReview, saveReview } from '../storage';
import { ITEM_LABELS, type ISODate } from '../types';

interface WeeklyReviewProps {
  today: ISODate;
  onOpenToday: () => void;
}

/** '17–23 August', or '31 August – 6 September' when the week straddles two. */
function rangeLabel(from: ISODate, to: ISODate): string {
  const a = parseISO(from);
  const b = parseISO(to);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'long' });

  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}

/**
 * Sunday's screen. It exists to convert a week's pattern into **one concrete
 * change** — not to reflect in general (SPEC.md §7).
 *
 * So the failing item is named outright — *"Coding was missed 3 days this week."* —
 * rather than softened into "consider reviewing coding" (ARCHITECTURE.md §11). A
 * diagnosis you have to infer is one you can decline to read.
 *
 * The answer saves on blur, which is what makes the "Today's entry" link safe: a tap
 * fires blur before click, so the save lands before this view goes away
 * (ARCHITECTURE.md §7).
 */
export function WeeklyReview({ today, onOpenToday }: WeeklyReviewProps) {
  const week = weekKey(today);
  const { from, to } = weekRange(today);

  const [change, setChange] = useState(() => getReview(week)?.change ?? '');
  const [storageError, setStorageError] = useState<string | null>(null);
  const saved = useRef(change);

  // Read once at mount: nothing else writes reviews while this view is open.
  const [history] = useState(() =>
    getAllReviews().filter((r) => r.week !== week && r.change.trim() !== ''),
  );

  function save() {
    if (change === saved.current) return;
    try {
      saveReview(week, { week, change, updatedAt: new Date().toISOString() });
      saved.current = change;
      setStorageError(null);
    } catch (err) {
      if (err instanceof StorageWriteError) setStorageError(err.message);
      else throw err;
    }
  }

  // Blur covers the "Today's entry" link, but not the app being swiped away
  // mid-sentence — on iOS a backgrounded PWA can be discarded without ever firing
  // blur, and this field holds the week's one answer.
  const latest = useRef(save);
  latest.current = save;

  useEffect(() => {
    const flush = () => latest.current();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      flush(); // and once more on unmount, for the view switch
    };
  }, []);

  const days = getRange(from, to);
  const worst = mostMissed(days);

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-8">
      <header className="mb-6">
        {/* Always visible, and above the fold: the review must be one tap from the
            day's entry, and it must not be possible to skip it silently
            (ARCHITECTURE.md §1, q4). */}
        <button
          type="button"
          onClick={onOpenToday}
          className="mb-4 min-h-11 text-sm text-muted underline underline-offset-4"
        >
          Today's entry
        </button>

        <h1 className="font-serif text-2xl text-ink">The week</h1>
        <p className="mt-1 text-xs text-faint">{rangeLabel(from, to)}</p>
      </header>

      {storageError && (
        <p role="alert" className="mb-6 rounded-lg border border-ink px-4 py-3 text-sm text-ink">
          {storageError}
        </p>
      )}

      <div className="grid gap-7">
        <Heatmap
          cells={rangeDates(from, to).map((date, i) => ({
            date,
            grade: gradeDay(days[i] ?? null),
          }))}
          leadingBlanks={0}
          marked={today}
        />

        <p className="text-base text-ink">
          {worst
            ? `${ITEM_LABELS[worst.item.item]} was missed ${worst.missed} ${
                worst.missed === 1 ? 'day' : 'days'
              } this week.`
            : 'Nothing was missed this week.'}
        </p>

        <section className="border-t border-line pt-5">
          <label htmlFor="change" className="mb-3 block text-sm font-medium text-ink">
            What change are you making next week?
          </label>
          <textarea
            id="change"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            onBlur={save}
            rows={3}
            placeholder="One thing."
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint"
          />
        </section>

        {history.length > 0 && (
          <section className="mt-2 border-t border-line pt-6">
            <h2 className="mb-4 text-sm text-muted">Earlier weeks</h2>
            <div className="grid gap-5">
              {history.map((review) => (
                <div key={review.week}>
                  <p className="text-xs text-faint">
                    {rangeLabel(weekStart(review.week), addDays(weekStart(review.week), 6))}
                  </p>
                  <p className="mt-1 text-sm text-muted">{review.change}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
