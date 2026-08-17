import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { todayISO } from './dates';
import { Today } from './views/Today';

/**
 * No router: three views behind component state.
 *
 * The app runs standalone, with no browser chrome and no back button, so URL-based
 * navigation buys nothing it can use — deep links cannot be shared, history cannot
 * be navigated, and iOS relaunches at `start_url` regardless (ARCHITECTURE.md §7).
 *
 * Only the day view exists so far. The view switch itself arrives in phase 5, with
 * the second view.
 */
export function App() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // Read once per mount. The app is opened, used and closed; it does not need to
  // notice midnight passing while it sits open.
  const [focused] = useState(() => todayISO());

  return (
    <>
      <Today date={focused} />

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
