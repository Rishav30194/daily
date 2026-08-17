import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Phase 0 is the deploy skeleton: one line of text, plus the service-worker update
 * prompt. Nothing else renders until phase 3. See IMPLEMENTATION_PHASES.md.
 */
export function App() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <main className="min-h-dvh bg-paper text-ink flex items-center justify-center p-6">
      <p className="text-sm tracking-wide">daily</p>

      {needRefresh && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 flex items-center justify-between gap-4 border-t border-stone-300 bg-paper p-4 text-sm"
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
    </main>
  );
}
