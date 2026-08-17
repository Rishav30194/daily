import type { CarryVerdict } from '../carry';

interface CarryControlProps {
  verdict: CarryVerdict;
  onCarry: () => void;
}

/**
 * The escape hatch, and the rule most likely to be gamed (SPEC.md §4).
 *
 * Three verdicts, rendered three ways, and the difference between two of them is the
 * whole point:
 *
 * - `hidden` returns null. The control is *removed from the DOM*, not disabled. An
 *   item cannot be carried twice, and a greyed-out control invites a second attempt
 *   while an absent one closes the question.
 * - `disabled` stays visible and states the limit verbatim, so a full window reads as
 *   a rule rather than a bug.
 *
 * Deliberately the quietest thing in its section: smaller than the item's own
 * controls, below them, no fill. Deferring is allowed, not offered.
 */
export function CarryControl({ verdict, onCarry }: CarryControlProps) {
  if (verdict.kind === 'hidden') return null;

  const disabled = verdict.kind === 'disabled';

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onCarry}
        className="min-h-11 text-sm text-muted underline underline-offset-4 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
      >
        Carry to tomorrow
      </button>

      {/* Rendered from the constant, never retyped: the wording is the deterrent. */}
      {disabled && <p className="text-xs text-faint">{verdict.message}</p>}
    </div>
  );
}
