import { describe, expect, test } from 'vitest';

import {
  englishRate,
  gradeCounts,
  gradeDay,
  itemRates,
  mostMissed,
  slotSplit,
  streak,
  urgeSeries,
} from './grading';
import { entry, perfect } from './testing';

// 2026-08-17 is a Monday; 2026-08-15 a Saturday; 2026-08-16 a Sunday.
const MON = '2026-08-17';
const SAT = '2026-08-15';
const SUN = '2026-08-16';

describe('gradeDay — the phone item', () => {
  test('slip caught counts as a pass', () => {
    expect(gradeDay(perfect(MON, { phone: 'slip' }))).toBe('green');
  });

  test('clean counts as a pass', () => {
    expect(gradeDay(perfect(MON, { phone: 'clean' }))).toBe('green');
  });

  test('lost does not count as a pass', () => {
    expect(gradeDay(perfect(MON, { phone: 'lost' }))).toBe('amber');
  });

  test('unanswered does not count as a pass', () => {
    expect(gradeDay(perfect(MON, { phone: null }))).toBe('amber');
  });
});

describe('gradeDay — thresholds', () => {
  test('four of four is green on a weekday', () => {
    expect(gradeDay(perfect(MON))).toBe('green');
  });

  test('three of four is amber', () => {
    expect(gradeDay(perfect(MON, { coding: { status: 'missed' } }))).toBe('amber');
  });

  test('two of four is red', () => {
    expect(
      gradeDay(perfect(MON, { coding: { status: 'missed' }, office: { status: 'missed' } })),
    ).toBe('red');
  });

  test('none is red', () => {
    expect(gradeDay(entry(MON))).toBe('red');
  });

  test('no entry is blank, not red', () => {
    expect(gradeDay(null)).toBeNull();
  });
});

describe('gradeDay — weekend shape', () => {
  test('the office target is dropped entirely, not counted as failed', () => {
    // Three passes with office left pending is a full weekend day.
    const day = perfect(SAT, { office: { status: 'pending' } });
    expect(gradeDay(day)).toBe('green');
  });

  test('a completed office target does not add a fourth pass', () => {
    expect(gradeDay(perfect(SUN))).toBe('green');
  });

  test('two of three is amber on a weekend', () => {
    expect(gradeDay(perfect(SAT, { coding: { status: 'missed' }, office: { status: 'pending' } }))).toBe(
      'amber',
    );
  });

  test('one of three is red on a weekend', () => {
    const day = entry(SAT, { phone: 'clean' });
    expect(gradeDay(day)).toBe('red');
  });

  test('the same failures grade differently on a weekday and a weekend', () => {
    const missing = { coding: { status: 'missed' as const }, office: { status: 'pending' as const } };
    expect(gradeDay(perfect(MON, missing))).toBe('red'); // 2 of 4
    expect(gradeDay(perfect(SAT, missing))).toBe('amber'); // 2 of 3
  });
});

describe('gradeDay — carried and expired', () => {
  test('a carried item is a provisional pass', () => {
    const day = perfect(MON, { coding: { status: 'carried', dueOn: '2026-08-18' } });
    expect(gradeDay(day)).toBe('green');
  });

  test('an expired carry is a failure', () => {
    const day = perfect(MON, { coding: { status: 'expired', dueOn: '2026-08-18' } });
    expect(gradeDay(day)).toBe('amber');
  });

  test('the same day grades differently before and after expiry', () => {
    const before = perfect(MON, { coding: { status: 'carried', dueOn: '2026-08-18' } });
    const after = { ...before, coding: { status: 'expired' as const, dueOn: '2026-08-18' } };
    expect(gradeDay(before)).toBe('green');
    expect(gradeDay(after)).toBe('amber');
  });
});

describe('gradeDay — english never affects the colour', () => {
  test('all three sub-checks done cannot rescue a day', () => {
    const day = entry(MON, { english: { standup: true, rewrite: true, drill: true } });
    expect(gradeDay(day)).toBe('red');
  });

  test('none done cannot spoil a day', () => {
    const day = perfect(MON, { english: { standup: false, rewrite: false, drill: false } });
    expect(gradeDay(day)).toBe('green');
  });
});

describe('gradeDay — the urge count never affects the colour', () => {
  test('a high count cannot spoil a day', () => {
    expect(gradeDay(perfect(MON, { urges: 40 }))).toBe('green');
  });

  test('a blank count cannot spoil a day', () => {
    expect(gradeDay(perfect(MON, { urges: null }))).toBe('green');
  });
});

describe('gradeCounts', () => {
  test('tallies grades and ignores blank days', () => {
    const days = [perfect(MON), perfect(MON, { phone: 'lost' }), entry(MON), null];
    expect(gradeCounts(days)).toEqual({
      green: 1,
      amber: 1,
      red: 1,
      graded: 3,
      percentGreen: 1 / 3,
    });
  });

  test('percentGreen is null when nothing is graded', () => {
    expect(gradeCounts([null, null]).percentGreen).toBeNull();
  });
});

describe('itemRates', () => {
  test('office is not applicable on weekends', () => {
    const rates = itemRates([perfect(MON), perfect(SAT)]);
    const office = rates.find((r) => r.item === 'office');
    expect(office?.applicable).toBe(1);
    expect(office?.passed).toBe(1);
  });

  test('names the failing item across a set of days', () => {
    const days = [
      perfect(MON, { coding: { status: 'missed' } }),
      perfect(MON, { coding: { status: 'missed' } }),
      perfect(MON),
    ];
    const coding = itemRates(days).find((r) => r.item === 'coding');
    expect(coding).toMatchObject({ applicable: 3, passed: 1, rate: 1 / 3 });
  });

  test('a carried item counts as passed, an expired one does not', () => {
    const days = [
      perfect(MON, { coding: { status: 'carried', dueOn: '2026-08-18' } }),
      perfect(MON, { coding: { status: 'expired', dueOn: '2026-08-18' } }),
    ];
    const coding = itemRates(days).find((r) => r.item === 'coding');
    expect(coding).toMatchObject({ applicable: 2, passed: 1 });
  });
});

describe('slotSplit', () => {
  test('counts only completed system design blocks', () => {
    const days = [
      perfect(MON, { systemDesign: { status: 'done', slot: '11:00' } }),
      perfect(MON, { systemDesign: { status: 'done', slot: '15:00' } }),
      perfect(MON, { systemDesign: { status: 'done', slot: '11:00' } }),
      perfect(MON, { systemDesign: { status: 'missed' } }),
      // A carry records no slot, because nothing happened.
      perfect(MON, { systemDesign: { status: 'carried', dueOn: '2026-08-18' } }),
    ];
    expect(slotSplit(days)).toEqual({ '11:00': 2, '15:00': 1 });
  });
});

describe('englishRate', () => {
  test('counts sub-checks, three per recorded day', () => {
    const days = [
      entry(MON, { english: { standup: true, rewrite: true, drill: false } }),
      entry(MON, { english: { standup: true, rewrite: false, drill: false } }),
      null,
    ];
    expect(englishRate(days)).toEqual({ completed: 3, applicable: 6, rate: 0.5 });
  });
});

describe('urgeSeries — blank is not zero', () => {
  const dates = ['2026-08-17', '2026-08-18', '2026-08-19'];

  test('a blank day is a gap, a zero day is a point', () => {
    const days = [entry(dates[0]!, { urges: 4 }), entry(dates[1]!, { urges: null }), entry(dates[2]!, { urges: 0 })];
    const series = urgeSeries(days, dates);
    expect(series.map((p) => p.count)).toEqual([4, null, 0]);
  });

  test('blank days are excluded from the average, zero days are included', () => {
    const blank = urgeSeries(
      [entry(dates[0]!, { urges: 4 }), entry(dates[1]!, { urges: null })],
      dates.slice(0, 2),
    );
    const zero = urgeSeries(
      [entry(dates[0]!, { urges: 4 }), entry(dates[1]!, { urges: 0 })],
      dates.slice(0, 2),
    );
    // Blank leaves the mean at 4; a recorded zero halves it. Coercing blank to zero
    // would make an unlogged day look like a perfect one.
    expect(blank[1]?.average).toBe(4);
    expect(zero[1]?.average).toBe(2);
  });

  test('a missing entry is blank, not zero', () => {
    const series = urgeSeries([entry(dates[0]!, { urges: 6 }), null, null], dates);
    expect(series.map((p) => p.count)).toEqual([6, null, null]);
    expect(series[2]?.average).toBe(6);
  });

  test('the average is null when nothing in the window was recorded', () => {
    const series = urgeSeries([null, null, null], dates);
    expect(series.every((p) => p.average === null)).toBe(true);
  });

  test('the average is a trailing seven-day window', () => {
    const many = Array.from({ length: 10 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    const days = many.map((d, i) => entry(d, { urges: i }));
    const series = urgeSeries(days, many);
    // Day index 9 averages counts 3..9.
    expect(series[9]?.average).toBe((3 + 4 + 5 + 6 + 7 + 8 + 9) / 7);
  });

  test('rejects misaligned input rather than silently mismatching dates', () => {
    expect(() => urgeSeries([null], dates)).toThrow();
  });
});

describe('streak', () => {
  test('counts consecutive non-red days from the end', () => {
    expect(streak([perfect(MON, { phone: 'lost' }), perfect(MON), perfect(MON)])).toBe(3);
  });

  test('a red day stops it', () => {
    expect(streak([perfect(MON), entry(MON), perfect(MON)])).toBe(1);
  });

  test('a blank day neither extends nor breaks it', () => {
    expect(streak([perfect(MON), null, perfect(MON)])).toBe(2);
  });

  test('is zero when the most recent graded day is red', () => {
    expect(streak([perfect(MON), entry(MON)])).toBe(0);
  });
});

describe('mostMissed', () => {
  test('names the item with the most misses', () => {
    const days = [
      perfect(MON, { coding: { status: 'missed' } }),
      perfect(MON, { coding: { status: 'missed' } }),
      perfect(MON, { coding: { status: 'missed' } }),
      perfect(MON, { office: { status: 'missed' } }),
    ];
    expect(mostMissed(days)).toMatchObject({ missed: 3, item: { item: 'coding' } });
  });

  test('is null when nothing was missed', () => {
    expect(mostMissed([perfect(MON), perfect(MON)])).toBeNull();
  });
});
