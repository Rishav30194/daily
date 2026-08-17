import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { settle } from './carry';
import { ExportReminder } from './components/ExportReminder';
import { addDays, diffDays, isSunday, monthOf, todayISO } from './dates';
import { getMeta, getRange, saveMeta, writeDayRaw } from './storage';
import type { ISODate, YearMonth } from './types';
import { Month } from './views/Month';
import { Settings } from './views/Settings';
import { Today } from './views/Today';
import { WeeklyReview } from './views/WeeklyReview';
import { Year } from './views/Year';

/** How far back a first run looks for outstanding carries. Nothing older can still
 *  be due: a carry lives one day. */
const FIRST_RUN_LOOKBACK = 14;

/**
 * Expires carries whose day has passed, once per app open.
 *
 * Lazy rather than scheduled (ARCHITECTURE.md §1, q2): there is no background
 * process and no timer, so a day's colour can change between two openings. That is
 * expected — the user opens the app and yesterday is already red.
 *
 * Nothing here announces itself. No toast, no prompt, no undo. An interaction to
 * acknowledge expiry is an interaction that can be gamed (SPEC.md §4).
 *
 * Writes through `writeDayRaw` rather than `saveDay` so the timestamp `settle` chose
 * survives: `saveDay` re-stamps on write, and settlement's own stamp is the one that
 * an import merge should compare. It ignores the 7-day edit lock by design
 * (ARCHITECTURE.md §1, q7).
 */
function runSettlement(today: ISODate): void {
  const meta = getMeta();
  const firstRun = addDays(today, -FIRST_RUN_LOOKBACK);
  // A 14-day floor rather than trusting `lastSettledOn` exactly. It costs at most
  // fourteen reads, and it means a clock change or a partial import cannot leave a
  // carry outstanding for good.
  const from =
    meta.lastSettledOn && diffDays(firstRun, meta.lastSettledOn) < 0
      ? meta.lastSettledOn
      : firstRun;

  for (const changed of settle(getRange(from, today), today, new Date())) {
    writeDayRaw(changed);
  }

  saveMeta({ ...meta, lastSettledOn: today });
}

type View = 'today' | 'month' | 'year' | 'review' | 'settings';

/** How long an export stays fresh before the banner mentions it. */
const EXPORT_REMINDER_DAYS = 30;

/**
 * Whether to nag about exporting.
 *
 * Never having exported counts only once there is something to lose: a fresh install
 * with no entries has no reason to be told about backups. "Something to lose" is
 * read as recent use rather than a full scan — the case this protects against is a
 * device that has been in daily use and never backed up.
 */
function exportOverdue(today: ISODate, now: Date): boolean {
  const { lastExportAt } = getMeta();

  if (!lastExportAt) {
    return getRange(addDays(today, -EXPORT_REMINDER_DAYS), today).some(Boolean);
  }

  const age = (now.getTime() - new Date(lastExportAt).getTime()) / 86_400_000;
  return age >= EXPORT_REMINDER_DAYS;
}

/**
 * No router: the views live behind component state.
 *
 * The app runs standalone, with no browser chrome and no back button, so URL-based
 * navigation buys nothing it can use — deep links cannot be shared, history cannot
 * be navigated, and iOS relaunches at `start_url` regardless (ARCHITECTURE.md §7).
 * Back navigation is an explicit control on each screen.
 */
export function App() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // Read once per mount. The app is opened, used and closed; it does not need to
  // notice midnight passing while it sits open.
  //
  // Settlement runs in the initialiser, not an effect, because it must finish before
  // any view reads a day — otherwise the first paint shows a grade that is about to
  // change. It is idempotent, so StrictMode's double invoke is harmless.
  const [focused, setFocused] = useState(() => {
    const today = todayISO();
    runSettlement(today);
    return today;
  });

  // Sunday opens on the review, every other day on the entry. The review is not
  // reachable from anywhere else: it arrives when the week is over, and it is not a
  // screen to go and look at (ARCHITECTURE.md §7).
  const [view, setView] = useState<View>(() => (isSunday(focused) ? 'review' : 'today'));
  const [ym, setYm] = useState(() => monthOf(focused));
  const [year, setYear] = useState(() => Number(focused.slice(0, 4)));

  // Dismissed for the session only. The risk it names — iOS clearing site data —
  // has not gone away just because the banner was closed, so it returns next launch.
  const [remindExport, setRemindExport] = useState(() => exportOverdue(focused, new Date()));

  // Without a router there is no navigation to reset the scroll position, so a tap
  // on a heatmap cell would otherwise land halfway down the day's entry.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, focused, ym, year]);

  function openMonth() {
    setYm(monthOf(focused));
    setView('month');
  }

  function openDay(date: ISODate) {
    setFocused(date);
    setView('today');
  }

  function openMonthOf(next: YearMonth) {
    setYm(next);
    setView('month');
  }

  return (
    <>
      {view === 'today' && (
        <>
          {remindExport && (
            <div className="mx-auto w-full max-w-lg px-5 pt-8">
              <ExportReminder
                onOpenSettings={() => {
                  setRemindExport(false);
                  setView('settings');
                }}
                onDismiss={() => setRemindExport(false)}
              />
            </div>
          )}
          <Today date={focused} onOpenMonth={openMonth} />
        </>
      )}

      {view === 'month' && (
        <Month
          ym={ym}
          onChangeMonth={setYm}
          onSelectDay={openDay}
          onToday={() => openDay(todayISO())}
          onOpenYear={() => {
            setYear(Number(ym.slice(0, 4)));
            setView('year');
          }}
          onOpenSettings={() => setView('settings')}
        />
      )}

      {view === 'settings' && <Settings onBack={() => setView('month')} />}

      {view === 'year' && (
        <Year
          year={year}
          onChangeYear={setYear}
          onSelectMonth={openMonthOf}
          onBack={() => setView('month')}
        />
      )}

      {view === 'review' && (
        <WeeklyReview today={focused} onOpenToday={() => openDay(focused)} />
      )}

      {needRefresh && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 flex items-center justify-between gap-4 border-t border-line bg-paper p-4 text-sm"
        >
          <span>A new version is ready.</span>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="min-h-11 px-4 underline underline-offset-4"
          >
            Reload
          </button>
        </div>
      )}
    </>
  );
}
