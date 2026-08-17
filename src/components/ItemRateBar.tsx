interface ItemRateBarProps {
  label: string;
  passed: number;
  applicable: number;
  /** 0–1, or null when the item never applied in this range. */
  rate: number | null;
}

/**
 * One item's completion rate for the month.
 *
 * This is the diagnostic the day colour cannot give: red says the day broke, this
 * says which item is breaking (SPEC.md §6). So the bars are read as a set — four
 * lengths compared against each other — which is why they are identical neutral
 * fills and not colour-coded by how good the number is.
 */
export function ItemRateBar({ label, passed, applicable, rate }: ItemRateBarProps) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <span className="text-sm text-ink">{label}</span>
        <span className="font-serif text-sm tabular-nums text-muted">
          {rate === null ? '—' : `${passed}/${applicable} · ${Math.round(rate * 100)}%`}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full bg-ink" style={{ width: `${(rate ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}
