import { useRef, useState } from 'react';

import { todayISO } from '../dates';
import { settleFrom } from '../settlement';
import {
  type ImportResult,
  StorageWriteError,
  exportAll,
  getMeta,
  importAll,
  markExported,
} from '../storage';

interface SettingsProps {
  onBack: () => void;
}

interface Pending {
  json: string;
  name: string;
  preview: ImportResult;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function summarise(r: ImportResult): string {
  return `${r.added} added · ${r.updated} updated · ${r.skipped} skipped`;
}

/**
 * Export, import, and the truth about where the data lives.
 *
 * Reachable from Month and never from Today: nothing competes with the ninety
 * seconds (ARCHITECTURE.md §7).
 *
 * The import is two steps on purpose. `importAll` merges by `updatedAt` and cannot
 * be undone, so the counts are produced by a dry run and shown before anything is
 * written — a restore onto a device that has been used since the export is the case
 * that has to not go wrong (ARCHITECTURE.md §4).
 */
export function Settings({ onBack }: SettingsProps) {
  // Read the clock here rather than take the app's focused date. Settlement expires
  // every carry due before the date it is given, so a focused day of next Tuesday
  // would expire carries that have not lapsed — and expiry has no undo. The focused
  // date is wherever the user last tapped in the heatmap; it is not today.
  const today = todayISO();

  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState(() => getMeta().lastExportAt);

  /** Import is the most storage-hungry thing the app does, so it is the likeliest
   *  place to be refused — and an uncaught throw out of a click handler unmounts the
   *  app on top of a half-applied import. */
  function onWriteError(err: unknown) {
    if (err instanceof StorageWriteError) setMessage(err.message);
    else throw err;
  }

  function exportNow() {
    const json = exportAll();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));

    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-${today}.json`;
    // In the document and revoked later, not immediately: Safari needs the anchor to
    // be a real node, and revoking on the next line can cancel the transfer before
    // the file is written. A stamped `lastExportAt` silences the backup reminder for
    // 30 days, so it must not be stamped for an export that never landed.
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 30_000);

    try {
      markExported();
      setLastExport(getMeta().lastExportAt);
      setMessage('Exported.');
    } catch (err) {
      onWriteError(err);
    }
  }

  async function choose(file: File) {
    const json = await file.text();
    const preview = importAll(json, true);

    if (!preview.ok) {
      setPending(null);
      setMessage(preview.error ?? 'That file could not be read.');
      return;
    }

    setMessage(null);
    setPending({ json, name: file.name, preview });
  }

  function commit() {
    if (!pending) return;

    // Taken from the preview, not the result, so it survives a write that fails
    // halfway: the days already written keep their carries either way, and those
    // carries are older than settlement's 14-day floor ever reaches again.
    const oldest = pending.preview.oldestDay;

    let imported: ImportResult | null = null;
    try {
      imported = importAll(pending.json);
    } catch (err) {
      onWriteError(err);
    }

    // Settled in its own step, whatever happened above. A restored backup can hold
    // carries that fell due months ago; without this they sit as passes for ever and
    // "expiry is automatic and retroactive" quietly stops being true. It runs even
    // after a failed merge, because the days written before the failure are as far
    // out of settlement's 14-day reach.
    if (oldest) {
      try {
        settleFrom(oldest, today);
      } catch (err) {
        // Reported only if the merge itself did not already report something — one
        // storage message is the useful amount.
        if (imported) onWriteError(err);
      }
    }

    // A merge that landed is reported as landed, even if settlement then failed. The
    // restore is the thing the user is anxious about; leaving the confirmation card
    // up with stale counts reads as "nothing happened".
    if (imported) {
      setPending(null);
      setMessage(`Imported. ${summarise(imported)}.`);
    }
  }

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
        <h1 className="font-serif text-2xl text-ink">Settings</h1>
      </header>

      {message && (
        <p role="status" className="mb-6 text-sm text-muted">
          {message}
        </p>
      )}

      <div className="grid gap-7">
        <Section title="Export">
          <p className="mb-3 text-sm text-muted">
            Every entry and every weekly review, as one JSON file.
          </p>
          <button
            type="button"
            onClick={exportNow}
            className="min-h-11 rounded-lg border border-ink bg-ink px-4 py-3 text-sm text-paper"
          >
            Export to a file
          </button>
          <p className="mt-2 text-xs text-faint">
            {lastExport
              ? `Last exported ${new Date(lastExport).toLocaleDateString()}.`
              : 'Never exported.'}
          </p>
        </Section>

        <Section title="Import">
          <p className="mb-3 text-sm text-muted">
            Merges into what is already here. Where both copies have the same day, the
            one edited most recently wins — nothing is replaced wholesale.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void choose(file);
              e.target.value = ''; // so picking the same file twice still fires
            }}
          />

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm text-ink"
          >
            Choose a file
          </button>

          {pending && (
            <div className="mt-4 rounded-lg border border-ink px-4 py-4">
              <p className="text-sm text-ink">{pending.name}</p>
              <p className="mt-1 font-serif text-sm tabular-nums text-muted">
                {summarise(pending.preview)}
              </p>
              <p className="mt-2 text-xs text-faint">
                Nothing has been written yet. Skipped records are days this device already
                has a newer copy of.
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={commit}
                  className="min-h-11 rounded-lg border border-ink bg-ink px-4 py-2 text-sm text-paper"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* SPEC.md §9 requires these in the app itself, not only the README. They are
            the reason export exists at all. */}
        <Section title="Where this data lives">
          <ul className="grid gap-2 text-sm text-muted">
            <li>
              On this device, in this browser, and nowhere else. The installed app and the
              same address in a browser tab are separate stores.
            </li>
            <li>There is no sync and no account. That is deliberate, not a missing feature.</li>
            <li>
              iOS can clear site data after long periods of not opening the app. Daily use
              makes it unlikely, and the export above is the answer if it happens.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
