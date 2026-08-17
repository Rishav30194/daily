interface UrgeInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
}

/**
 * How many times he wanted to open a feed today, whether or not he did.
 *
 * Optional, and **blank is not zero**. An empty field means "not recorded"; a typed
 * 0 means "recorded, and it was zero" — a genuinely good day. The two stay distinct
 * in storage, in the chart and in every average, so this component must never
 * substitute one for the other (SPEC.md §2.3).
 *
 * That is why the input is left uncontrolled-ish: an empty string maps to null, and
 * only a parseable number maps to a number.
 */
export function UrgeInput({ value, onChange, readOnly = false }: UrgeInputProps) {
  function handleChange(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange(null);
      return;
    }
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 0 && n < 1000) onChange(n);
  }

  return (
    <div>
      <label
        htmlFor="urges"
        className="mb-2 block text-sm text-muted"
      >
        Urge count
      </label>

      <div className="flex items-center gap-3">
        <input
          id="urges"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value === null ? '' : String(value)}
          disabled={readOnly}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="—"
          className="min-h-11 w-24 rounded-lg border border-line bg-paper px-3 py-2 text-center font-serif text-xl tabular-nums text-ink placeholder:text-faint disabled:opacity-60"
        />
        {value === null && (
          <span className="text-xs text-faint">
            Leave blank if you did not count. Blank is not zero.
          </span>
        )}
      </div>
    </div>
  );
}
