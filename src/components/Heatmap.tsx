import { parseISO } from '../dates';
import type { Grade, ISODate } from '../types';

export interface HeatmapCell {
  date: ISODate;
  /** null = no entry. A blank cell, never a red one. */
  grade: Grade | null;
}

interface HeatmapProps {
  cells: HeatmapCell[];
  /** Empty slots before the first cell, so the 1st lands under its weekday. */
  leadingBlanks: number;
  /** `year` is the twelve-per-page size the year overview renders at. */
  size?: 'month' | 'year';
  /** The day to outline — normally today. */
  marked?: ISODate;
  onSelect?: (date: ISODate) => void;
  /** Rendered above the grid, only at month size. */
  showWeekdays?: boolean;
}

const FILL: Record<Grade, string> = {
  green: 'bg-green',
  amber: 'bg-amber',
  red: 'bg-red',
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function label(date: ISODate, grade: Grade | null): string {
  const day = parseISO(date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${day} — ${grade ?? 'no entry'}`;
}

/**
 * The whole month at a glance, and the only place in the app where colour is
 * saturated (ARCHITECTURE.md §8).
 *
 * Monday-first, because weeks end Sunday and Sunday is when the review runs.
 *
 * Every cell states its grade in its accessible name. Colour is never the sole
 * carrier of meaning here — a cell that reads only as a shade is unusable to anyone
 * who cannot separate the three, and the whole screen is cells.
 */
export function Heatmap({
  cells,
  leadingBlanks,
  size = 'month',
  marked,
  onSelect,
  showWeekdays = size === 'month',
}: HeatmapProps) {
  // 4px gaps rather than 6: at 375px wide with the page's px-5, this is what keeps a
  // cell at 44px square and the grid inside the tap-target rule (ARCHITECTURE.md §8).
  const gap = size === 'month' ? 'gap-1' : 'gap-0.5';
  const radius = size === 'month' ? 'rounded-md' : 'rounded-xs';

  return (
    <div>
      {showWeekdays && (
        <div className={`mb-1.5 grid grid-cols-7 ${gap}`} aria-hidden="true">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-xs text-faint">
              {d}
            </div>
          ))}
        </div>
      )}

      <div className={`grid grid-cols-7 ${gap}`}>
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {cells.map(({ date, grade }) => {
          const fill = grade ? FILL[grade] : 'bg-fill';
          // The marker is an outline rather than a fourth fill: today is a position,
          // not a grade, and it must not read as one.
          const mark = date === marked ? 'outline outline-1 outline-offset-1 outline-muted' : '';
          const shape = `aspect-square w-full ${radius} ${fill} ${mark}`;

          // A cell with nowhere to go is not a control. Rendering it as a disabled
          // button would announce it as one and swallow clicks meant for whatever
          // wraps the grid — which is exactly how Year makes a whole month tappable.
          if (!onSelect) {
            return (
              <div
                key={date}
                className={shape}
                // At year size the month around it carries the name; 366 individually
                // announced cells is not a way through a screen.
                {...(size === 'year'
                  ? { 'aria-hidden': true }
                  : { role: 'img', 'aria-label': label(date, grade) })}
              />
            );
          }

          return (
            <button
              key={date}
              type="button"
              aria-label={label(date, grade)}
              onClick={() => onSelect(date)}
              className={shape}
            />
          );
        })}
      </div>
    </div>
  );
}
