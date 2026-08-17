interface ExportReminderProps {
  onOpenSettings: () => void;
  onDismiss: () => void;
}

/**
 * The only nagging the app is allowed, and it exists for one reason: iOS can clear
 * site data after a long gap, and there is no server-side copy to fall back on
 * (SPEC.md §9).
 *
 * It is not a notification, a badge, or a streak. It states a fact, offers the
 * action, and goes away for the session when dismissed — it returns next launch
 * because the risk it names has not gone anywhere.
 */
export function ExportReminder({ onOpenSettings, onDismiss }: ExportReminderProps) {
  return (
    <div className="mb-6 rounded-lg border border-line px-4 py-3">
      <p className="text-sm text-muted">
        It has been a while since you exported. This data only exists on this device.
      </p>
      <div className="mt-2 flex gap-4">
        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-11 text-sm text-ink underline underline-offset-4"
        >
          Export now
        </button>
        <button type="button" onClick={onDismiss} className="min-h-11 text-sm text-faint">
          Not now
        </button>
      </div>
    </div>
  );
}
