import type { CarriedIn } from '../carry';
import { parseISO } from '../dates';
import type { DoingItemId } from '../types';
import { OptionButton } from './OptionButton';

interface CarriedInBannerProps {
  items: CarriedIn[];
  onToggle: (item: DoingItemId, done: boolean) => void;
}

const LABELS: Record<DoingItemId, string> = {
  systemDesign: 'System design',
  coding: 'Coding / certification',
  office: 'Office target',
};

function shortDate(date: string): string {
  return parseISO(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Yesterday's outstanding debt, at the top of today, before anything of today's own.
 *
 * Ticking one of these writes to the day it was carried *from*, not to today: the
 * carry buys back yesterday's grade, and today's own instance of the same item is
 * untouched and still owed. That is what makes "do it today or take the miss" mean
 * something (ARCHITECTURE.md §3).
 *
 * There is no dismiss, snooze, or "missed" action here. The only two outcomes are
 * completing it and letting it expire, and expiry happens on its own.
 */
export function CarriedInBanner({ items, onToggle }: CarriedInBannerProps) {
  const [first] = items;
  if (!first) return null;

  return (
    // Bordered rather than filled, and neutral: green, amber and red belong to the
    // heatmap alone (ARCHITECTURE.md §8).
    <section
      aria-label="Carried from yesterday"
      className="mb-7 rounded-lg border border-ink px-4 py-4"
    >
      <h2 className="text-sm font-medium text-ink">Due today</h2>
      <p className="mb-3 text-xs text-muted">
        Carried from {shortDate(first.from)}. Not done today, it becomes a miss on that day.
      </p>

      <div className="flex flex-col gap-2">
        {items.map(({ item, done }) => (
          <OptionButton
            key={item}
            label={LABELS[item]}
            hint={done ? 'done' : 'still owed'}
            selected={done}
            onClick={() => onToggle(item, !done)}
          />
        ))}
      </div>
    </section>
  );
}
