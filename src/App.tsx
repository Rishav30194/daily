import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { settle } from './carry';
import { addDays, diffDays, isSunday, monthOf, todayISO } from './dates';
import { getMeta, getRange, saveMeta, writeDayRaw } from './storage';
import type { ISODate } from './types';
import { Month } from './views/Month';
import { Today } from './views/Today';
import { WeeklyReview } from './views/WeeklyReview';

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

type View = 'today' | 'month' | 'review';

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

  // Without a router there is no navigation to reset the scroll position, so a tap
  // on a heatmap cell would otherwise land halfway down the day's entry.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, focused, ym]);

  function openMonth() {
    setYm(monthOf(focused));
    setView('month');
  }

  function openDay(date: ISODate) {
    setFocused(date);
    setView('today');
  }

  return (
    <>
      {view === 'today' && <Today date={focused} onOpenMonth={openMonth} />}

      {view === 'month' && (
        <Month
          ym={ym}
          onChangeMonth={setYm}
          onSelectDay={openDay}
          onToday={() => openDay(todayISO())}
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
