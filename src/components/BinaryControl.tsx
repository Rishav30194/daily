import type { ItemState } from '../types';
import { OptionButton } from './OptionButton';

interface BinaryControlProps {
  value: ItemState;
  onChange: (next: ItemState) => void;
  doneLabel?: string;
}

/** Done or not. Used for the office work target, which is binary by definition:
 *  did you finish what you set out to do at work (SPEC.md §2.1). */
export function BinaryControl({
  value,
  onChange,
  doneLabel = 'Done',
}: BinaryControlProps) {
  const set = (status: ItemState['status']) => {
    onChange({ status: value.status === status ? 'pending' : status });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <OptionButton
        label={doneLabel}
        selected={value.status === 'done'}
        onClick={() => set('done')}
      />
      <OptionButton
        label="Missed"
        selected={value.status === 'missed'}
        onClick={() => set('missed')}
      />
    </div>
  );
}
