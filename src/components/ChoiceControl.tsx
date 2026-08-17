import type { CodeChoice, CodingState, ItemStatus } from '../types';
import { OptionButton } from './OptionButton';

interface ChoiceControlProps {
  value: CodingState;
  onChange: (next: CodingState) => void;
}

/**
 * Coding or Claude certification — one or the other per day, his choice, and the app
 * records which (SPEC.md §2.1).
 *
 * Unlike the system-design slots these two are genuine equals: neither is a fallback,
 * so they are rendered side by side with the same weight.
 */
export function ChoiceControl({ value, onChange }: ChoiceControlProps) {
  const set = (status: ItemStatus, choice?: CodeChoice) => {
    const same = value.status === status && value.choice === choice;
    if (same) {
      onChange({ status: 'pending' });
      return;
    }
    onChange(choice === undefined ? { status } : { status, choice });
  };

  const done = (choice: CodeChoice) => value.status === 'done' && value.choice === choice;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <OptionButton
          label="Coding"
          selected={done('coding')}
          onClick={() => set('done', 'coding')}
        />
        <OptionButton
          label="Certification"
          selected={done('cert')}
          onClick={() => set('done', 'cert')}
        />
      </div>

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
