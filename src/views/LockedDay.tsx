import { doingItemsOn } from '../grading';
import { ITEM_LABELS, type DayEntry, type ItemState, type PhoneState } from '../types';

interface LockedDayProps {
  entry: DayEntry;
  /** Why it cannot be edited. Stated plainly; there is no way to override it. */
  reason: string;
}

const PHONE: Record<PhoneState, string> = {
  clean: 'Clean',
  slip: 'Slip caught',
  lost: 'Lost',
};

function itemValue(state: ItemState, done: string): string {
  switch (state.status) {
    case 'done':
      return done;
    case 'missed':
      return 'Missed';
    case 'carried':
      return 'Carried forward';
    case 'expired':
      // The word the grade uses. A carry that lapsed is a miss, and softening it here
      // would make the day's colour look unexplained.
      return 'Carried, then missed';
    default:
      return '—';
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-line py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm text-ink">{value}</span>
    </div>
  );
}

/**
 * A day that can be read and not changed: older than 7 days, or not yet happened
 * (SPEC.md §8).
 *
 * Rendered as plain values rather than disabled controls. A greyed-out row of
 * buttons reads as broken and invites tapping at it; a list of recorded values reads
 * as a record, which is what it is (ARCHITECTURE.md §7).
 *
 * The lock is a UI guard only. Carry expiry still writes to days of any age, and
 * must — that rule lives in settlement, not here (ARCHITECTURE.md §1, q7).
 */
export function LockedDay({ entry, reason }: LockedDayProps) {
  const english = [entry.english.standup, entry.english.rewrite, entry.english.drill].filter(
    Boolean,
  ).length;

  // No invented detail. A carry completed from the next day's banner is `done` with
  // no slot recorded, and showing "Done at 7:00" for it would put a slot in the
  // record that was never used — and disagree with the month view, whose
  // 7:00-vs-9:00 split skips exactly those entries.
  const slot =
    entry.systemDesign.slot === '21:00'
      ? 'Done at 9:00'
      : entry.systemDesign.slot === '19:00'
        ? 'Done at 7:00'
        : 'Done';

  return (
    <div>
      <p className="mb-5 text-xs text-faint">{reason}</p>

      <div>
        <Row label={ITEM_LABELS.phone} value={entry.phone ? PHONE[entry.phone] : '—'} />
        {/* Only the items the day asked for. A subject that was never on this date
            has nothing to report, and a row reading "Missed" for it would be a
            record of work that was never owed. */}
        {doingItemsOn(entry.date).map((item) => (
          <Row
            key={item}
            label={ITEM_LABELS[item]}
            value={itemValue(entry[item], item === 'systemDesign' ? slot : 'Done')}
          />
        ))}

        {/* Blank is not zero, so it is written out rather than shown as a dash that
            could be read as a zero (SPEC.md §2.3). */}
        <Row
          label="Urges"
          value={entry.urges === null ? 'Not recorded' : String(entry.urges)}
        />
        <Row label="Note" value={entry.note || '—'} />
        <Row label="English" value={`${english}/3`} />
      </div>
    </div>
  );
}
