import type { ItemStatus, Slot, SystemDesignState } from '../types';
import { OptionButton } from './OptionButton';

interface SlotControlProps {
  value: SystemDesignState;
  onChange: (next: SystemDesignState) => void;
}

/**
 * System design, and the one control where visual hierarchy is behaviour rather
 * than taste.
 *
 * Two slots exist so an unpredictable workday cannot force a miss, but they also
 * create a second chance to defer. So 11:00 is a full-width primary control and 3:00
 * is smaller, quieter and stacked *beneath* it — never a two-up pair of equal
 * buttons, at any width (SPEC.md §2.1).
 *
 * The app records which slot was used, not merely that it happened, because the
 * month view's 11:00-versus-3:00 split is what reveals a slot that is not real.
 */
export function SlotControl({ value, onChange }: SlotControlProps) {
  const set = (status: ItemStatus, slot?: Slot) => {
    const same = value.status === status && value.slot === slot;
    if (same) {
      onChange({ status: 'pending' });
      return;
    }
    onChange(slot === undefined ? { status } : { status, slot });
  };

  const done = (slot: Slot) => value.status === 'done' && value.slot === slot;

  return (
    // Deliberately a single column. A grid here would make 3:00 an equal sibling.
    <div className="flex flex-col gap-2">
      <OptionButton
        label="Done at 11:00"
        hint="where it is meant to happen"
        selected={done('11:00')}
        onClick={() => set('done', '11:00')}
      />

      <OptionButton
        label="Done at 3:00 — fallback"
        hint="only when 11:00 genuinely was not possible"
        weight="secondary"
        selected={done('15:00')}
        onClick={() => set('done', '15:00')}
      />

      <div className="flex">
        <OptionButton
          label="Missed"
          weight="quiet"
          selected={value.status === 'missed'}
          onClick={() => set('missed')}
        />
      </div>
    </div>
  );
}
