import type { EnglishState } from '../types';

interface EnglishGroupProps {
  value: EnglishState;
  onChange: (next: EnglishState) => void;
}

const CHECKS: { key: keyof EnglishState; label: string }[] = [
  { key: 'standup', label: 'Standup note written out before speaking' },
  { key: 'rewrite', label: 'One message rewritten 30% shorter' },
  { key: 'drill', label: 'Sentence architecture drill (10 min)' },
];

/**
 * Three sub-checks, shown as n/3.
 *
 * Tracked, and given its own completion rate in the month view, but it **never**
 * affects the day's colour (SPEC.md §2.2). It is set apart from the core four in
 * Today.tsx for exactly that reason — its position on the page is the only thing
 * telling the user it does not count.
 */
export function EnglishGroup({ value, onChange }: EnglishGroupProps) {
  const done = CHECKS.filter(({ key }) => value[key]).length;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-muted">English</span>
        <span className="font-serif text-sm tabular-nums text-muted">{done}/3</span>
      </div>

      <div className="grid gap-1">
        {CHECKS.map(({ key, label }) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-fill"
          >
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              className="size-5 shrink-0 accent-ink"
            />
            <span className={value[key] ? 'text-ink' : 'text-muted'}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
