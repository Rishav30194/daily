import { beforeEach, describe, expect, test } from 'vitest';

import { gradeDay } from './grading';
import { runSettlement, settleFrom } from './settlement';
import { getDay, getMeta, importAll, saveMeta, writeDayRaw } from './storage';
import { entry, installStorage, perfect } from './testing';

const NOW = new Date('2026-08-17T20:00:00.000Z');
const TODAY = '2026-08-17';

beforeEach(() => {
  installStorage();
});

/** A day whose coding item was carried to the day after and never finished. */
function outstanding(date: string, dueOn: string) {
  return perfect(date, { coding: { status: 'carried', dueOn } });
}

describe('runSettlement', () => {
  test('expires a carry that fell due and downgrades the day', () => {
    writeDayRaw(outstanding('2026-08-14', '2026-08-15')); // Friday, due Saturday
    expect(gradeDay(getDay('2026-08-14'))).toBe('green');

    runSettlement(TODAY, NOW);

    expect(getDay('2026-08-14')?.coding.status).toBe('expired');
    expect(gradeDay(getDay('2026-08-14'))).toBe('amber');
  });

  test('leaves a carry that is still due today', () => {
    writeDayRaw(outstanding('2026-08-16', TODAY));
    runSettlement(TODAY, NOW);
    expect(getDay('2026-08-16')?.coding.status).toBe('carried');
  });

  test('stamps lastSettledOn', () => {
    runSettlement(TODAY, NOW);
    expect(getMeta().lastSettledOn).toBe(TODAY);
  });

  test('writes past the 7-day edit lock', () => {
    // The lock guards user edits only; expiry is system-driven (ARCHITECTURE §1 q7).
    writeDayRaw(outstanding('2026-08-05', '2026-08-06'));
    runSettlement(TODAY, NOW);
    expect(getDay('2026-08-05')?.coding.status).toBe('expired');
  });

  test('does not reach a carry older than the lookback', () => {
    // Documents the limit that `settleFrom` exists to cover after an import.
    writeDayRaw(outstanding('2026-07-01', '2026-07-02'));
    runSettlement(TODAY, NOW);
    expect(getDay('2026-07-01')?.coding.status).toBe('carried');
  });

  test('is idempotent across repeated opens', () => {
    writeDayRaw(outstanding('2026-08-14', '2026-08-15'));
    expect(runSettlement(TODAY, NOW)).toBe(1);
    expect(runSettlement(TODAY, NOW)).toBe(0);
  });
});

describe('settleFrom — restored backups', () => {
  const oldDay = '2026-05-01';

  function backup() {
    return JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: { [oldDay]: outstanding(oldDay, '2026-05-02') },
      reviews: {},
    });
  }

  test('an ancient carry restored from a backup still expires', () => {
    // The bug this covers: lastSettledOn is stamped to today on every open, so the
    // startup pass never looks further back than 14 days and a restored carry would
    // sit as a pass for ever.
    saveMeta({ schema: 1, lastSettledOn: TODAY, lastExportAt: null });

    const result = importAll(backup());
    expect(getDay(oldDay)?.coding.status).toBe('carried');

    expect(result.oldestDay).toBe(oldDay);
    settleFrom(result.oldestDay!, TODAY, NOW);

    expect(getDay(oldDay)?.coding.status).toBe('expired');
    expect(gradeDay(getDay(oldDay))).toBe('amber');
  });

  test('a later startup pass leaves the settled day alone', () => {
    importAll(backup());
    settleFrom(oldDay, TODAY, NOW);
    expect(runSettlement(TODAY, NOW)).toBe(0);
  });
});

describe('settleFrom never settles past the real today', () => {
  // `settleFrom` expires every carry due before the date it is handed, and expiry
  // has no undo — so a caller handing it a future date destroys live carries. The
  // app once did exactly that, passing the *focused* day, which follows whatever
  // heatmap cell was last tapped. The date is clamped rather than trusted.
  test('a future date cannot expire a carry that is still live', () => {
    writeDayRaw(outstanding(TODAY, '2026-08-18')); // created today, due tomorrow

    settleFrom(TODAY, '2026-08-25', NOW);

    expect(getDay(TODAY)?.coding.status).toBe('carried');
  });

  test('a future date does not stamp the future into meta', () => {
    settleFrom(TODAY, '2026-08-25', NOW);
    expect(getMeta().lastSettledOn).toBe(TODAY);
  });

  test('the real today leaves that same carry alone', () => {
    writeDayRaw(outstanding(TODAY, '2026-08-18'));

    settleFrom(TODAY, TODAY, NOW);

    expect(getDay(TODAY)?.coding.status).toBe('carried');
  });

  test('a lapsed carry still expires when the date is clamped', () => {
    writeDayRaw(outstanding('2026-08-14', '2026-08-15'));

    settleFrom('2026-08-14', '2026-08-25', NOW);

    expect(getDay('2026-08-14')?.coding.status).toBe('expired');
  });

  test('a past date never reaches the days that needed settling', () => {
    writeDayRaw(outstanding('2026-08-14', '2026-08-15'));

    settleFrom('2026-08-10', '2026-08-12', NOW);

    expect(getDay('2026-08-14')?.coding.status).toBe('carried');
  });
});

describe('settlement never invents entries', () => {
  test('days with no entry stay absent', () => {
    writeDayRaw(entry('2026-08-16'));
    runSettlement(TODAY, NOW);
    expect(getDay('2026-08-15')).toBeNull();
    expect(getDay(TODAY)).toBeNull();
  });
});
