import type { PhoneState } from '../types';
import { OptionButton } from './OptionButton';

interface PhoneControlProps {
  value: PhoneState | null;
  onChange: (value: PhoneState | null) => void;
}

/**
 * Three states, never a checkbox.
 *
 * `Slip caught` sits between the other two and is worded as a catch, not a lapse,
 * because it grades as a pass: stopping mid-scroll is the skill being trained, and
 * presenting it as a failure is what turns one slip into a lost day (SPEC.md §2.1).
 *
 * The three are rendered as equal siblings. Unlike the system-design slots there is
 * no fallback here — these are outcomes, not choices.
 */
export function PhoneControl({ value, onChange }: PhoneControlProps) {
  const states: { state: PhoneState; label: string; hint: string }[] = [
    { state: 'clean', label: 'Clean', hint: 'no feed video at all' },
    { state: 'slip', label: 'Slip caught', hint: 'opened it, stopped within a minute' },
    { state: 'lost', label: 'Lost', hint: 'a real session' },
  ];

  return (
    <div className="grid gap-2">
      {states.map(({ state, label, hint }) => (
        <OptionButton
          key={state}
          label={label}
          hint={hint}
          selected={value === state}
          onClick={() => onChange(value === state ? null : state)}
        />
      ))}
    </div>
  );
}
