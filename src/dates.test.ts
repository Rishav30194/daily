import { describe, expect, test } from 'vitest';

import {
  addDays,
  diffDays,
  daysInMonth,
  isWeekend,
  isWithinEditWindow,
  monthDates,
  rangeDates,
  shiftMonth,
  toISO,
  weekKey,
  weekRange,
} from './dates';

describe('addDays', () => {
  test('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('lands on the next calendar date across a DST change', () => {
    // US DST starts 2026-03-08 and ends 2026-11-01. Working in local date
    // components rather than epoch ms is what keeps these exact.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('diffDays', () => {
  test('counts whole days, signed', () => {
    expect(diffDays('2026-08-10', '2026-08-17')).toBe(7);
    expect(diffDays('2026-08-17', '2026-08-10')).toBe(-7);
    expect(diffDays('2026-08-17', '2026-08-17')).toBe(0);
  });

  test('is exact across a DST boundary', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('isWeekend', () => {
  test('Saturday and Sunday only', () => {
    expect(isWeekend('2026-08-15')).toBe(true); // Sat
    expect(isWeekend('2026-08-16')).toBe(true); // Sun
    expect(isWeekend('2026-08-17')).toBe(false); // Mon
    expect(isWeekend('2026-08-21')).toBe(false); // Fri
  });
});

describe('daysInMonth / monthDates', () => {
  test('february in leap and non-leap years', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-04')).toBe(30);
  });

  test('monthDates spans the whole month in order', () => {
    const days = monthDates('2026-02');
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2026-02-01');
    expect(days[27]).toBe('2026-02-28');
  });
});

describe('shiftMonth', () => {
  test('steps forward and back within a year', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
    expect(shiftMonth('2026-08', 0)).toBe('2026-08');
  });

  test('rolls the year over in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-06', -12)).toBe('2025-06');
  });

  test('stepping from a long month into a short one keeps the month', () => {
    // Naive Date arithmetic on the 31st lands in the month after February.
    expect(shiftMonth('2026-01', 1)).toBe('2026-02');
    expect(shiftMonth('2026-03', -1)).toBe('2026-02');
  });
});

describe('rangeDates', () => {
  test('is inclusive at both ends', () => {
    expect(rangeDates('2026-08-15', '2026-08-18')).toEqual([
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
    ]);
  });

  test('a single day is a range of one', () => {
    expect(rangeDates('2026-08-17', '2026-08-17')).toEqual(['2026-08-17']);
  });
});

describe('weekRange', () => {
  test('runs Monday to Sunday', () => {
    // 2026-08-17 is a Monday.
    expect(weekRange('2026-08-17')).toEqual({ from: '2026-08-17', to: '2026-08-23' });
    // Sunday belongs to the week that started six days earlier, not the next one —
    // the review runs at the end of its own week.
    expect(weekRange('2026-08-23')).toEqual({ from: '2026-08-17', to: '2026-08-23' });
  });
});

describe('weekKey', () => {
  test('the ISO year is not always the calendar year', () => {
    expect(weekKey('2027-01-01')).toBe('2026-W53');
    expect(weekKey('2024-12-30')).toBe('2025-W01');
    expect(weekKey('2021-01-01')).toBe('2020-W53');
  });

  test('ordinary weeks', () => {
    expect(weekKey('2026-08-17')).toBe('2026-W34');
    expect(weekKey('2026-01-01')).toBe('2026-W01');
  });

  test('every day of one week shares a key', () => {
    const keys = rangeDates('2026-08-17', '2026-08-23').map(weekKey);
    expect(new Set(keys).size).toBe(1);
  });
});

describe('isWithinEditWindow', () => {
  const today = '2026-08-17';

  test('today and the seven days before it are editable', () => {
    // SPEC.md §8 bars days "older than 7 days", so day 7 is still in.
    expect(isWithinEditWindow('2026-08-17', today)).toBe(true);
    expect(isWithinEditWindow('2026-08-10', today)).toBe(true);
  });

  test('the eighth day back is locked', () => {
    expect(isWithinEditWindow('2026-08-09', today)).toBe(false);
    expect(isWithinEditWindow('2026-07-17', today)).toBe(false);
  });

  test('future days are never editable', () => {
    expect(isWithinEditWindow('2026-08-18', today)).toBe(false);
  });
});

describe('toISO', () => {
  test('pads month and day', () => {
    expect(toISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
