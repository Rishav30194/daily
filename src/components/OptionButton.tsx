interface OptionButtonProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** `primary` is the intended choice, `secondary` a deliberately lesser one,
   *  `quiet` the way out (missed). The weights are behavioural, not decorative —
   *  see SlotControl. */
  weight?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  hint?: string;
}

const WEIGHTS = {
  primary: 'w-full px-4 py-3 text-base',
  secondary: 'w-full px-4 py-2.5 text-sm',
  quiet: 'px-3 py-2 text-sm',
} as const;

/**
 * One tappable state in a small set. Selection is carried by fill and border, never
 * by hue: no control in this app is colour-coded.
 *
 * Tapping the selected option clears it, so a mis-tap is undone with a second tap
 * rather than a reset control.
 */
export function OptionButton({
  label,
  selected,
  onClick,
  weight = 'primary',
  disabled = false,
  hint,
}: OptionButtonProps) {
  const base =
    'min-h-11 rounded-lg border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  const state = selected
    ? 'border-ink bg-ink text-paper'
    : 'border-line bg-paper text-ink hover:bg-fill';

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${WEIGHTS[weight]} ${state}`}
    >
      <span className={weight === 'secondary' && !selected ? 'text-muted' : undefined}>
        {label}
      </span>
      {hint && (
        <span className={`block text-xs ${selected ? 'text-paper/70' : 'text-faint'}`}>{hint}</span>
      )}
    </button>
  );
}
