import type { UrgePoint } from '../grading';

interface UrgeChartProps {
  points: UrgePoint[];
}

const W = 320;
const H = 110;
const PAD_X = 4;
const PAD_TOP = 10;
const PAD_BOTTOM = 12;

/** Runs of consecutive indices whose value is recorded. A run is one polyline; the
 *  space between two runs is the gap that a blank day has to leave. */
function runs(values: (number | null)[]): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];

  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) out.push(current);
      current = [];
      return;
    }
    current.push({ i, v });
  });

  if (current.length) out.push(current);
  return out;
}

/**
 * Daily urge count with its 7-day trailing average.
 *
 * Hand-rolled SVG, no chart library (ARCHITECTURE.md §11) — and the reason is this
 * component specifically. A blank day must be a **gap in the line** and a zero day a
 * **point at zero**, which is a distinction most charting libraries erase by default
 * and all of them make you fight for. Here it is the shape of the data structure:
 * `runs()` breaks the line at every null, and a recorded zero is just a dot sitting
 * on the baseline.
 *
 * Neutral throughout. Green, amber and red belong to the heatmap alone.
 */
export function UrgeChart({ points }: UrgeChartProps) {
  const counts = points.map((p) => p.count);
  const recorded = counts.filter((c): c is number => c !== null);

  if (recorded.length === 0) {
    return <p className="text-sm text-faint">No urge counts recorded this month.</p>;
  }

  const averages = points.map((p) => p.average);
  const max = Math.max(1, ...recorded, ...averages.filter((a): a is number => a !== null));

  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - PAD_X * 2));
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOTTOM);

  const path = (run: { i: number; v: number }[]) =>
    run.map(({ i, v }) => `${x(i)},${y(v)}`).join(' ');

  const mean = recorded.reduce((a, b) => a + b, 0) / recorded.length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Urge counts. ${recorded.length} of ${n} days recorded, mean ${mean.toFixed(
          1,
        )}, highest ${Math.max(...recorded)}.`}
      >
        {/* Baseline at zero, so a recorded zero has something to sit on. */}
        <line
          x1={PAD_X}
          y1={y(0)}
          x2={W - PAD_X}
          y2={y(0)}
          className="stroke-line"
          strokeWidth="1"
        />

        {runs(averages).map((run, k) => (
          <polyline
            key={`avg-${k}`}
            points={path(run)}
            fill="none"
            className="stroke-faint"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}

        {runs(counts).map((run, k) => (
          <polyline
            key={`count-${k}`}
            points={path(run)}
            fill="none"
            className="stroke-ink"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ))}

        {/* A dot per recorded day: without it a single recorded day between two
            blanks would be a zero-length line and draw nothing at all. */}
        {counts.map((c, i) =>
          c === null ? null : <circle key={i} cx={x(i)} cy={y(c)} r="1.8" className="fill-ink" />,
        )}
      </svg>

      <div className="mt-2 flex items-baseline justify-between text-xs text-faint">
        <span>solid: per day · dashed: 7-day average</span>
        <span className="font-serif tabular-nums">
          {recorded.length}/{n} days recorded
        </span>
      </div>
    </div>
  );
}
