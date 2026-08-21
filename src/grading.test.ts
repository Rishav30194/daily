import { describe, expect, test } from 'vitest';

import {
  doingItemsOn,
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

// The week of Monday 17 August 2026.
const MON = '2026-08-17'; // certification
const TUE = '2026-08-18'; // certification
const WED = '2026-08-19'; // system design
const THU = '2026-08-20'; // certification
const FRI = '2026-08-21'; // LLD
const SAT = '2026-08-22'; // all three
const SUN = '2026-08-23'; // all three

describe('doingItemsOn', () => {
  test('a weekday is the day subject plus the office target', () => {
    expect(doingItemsOn(MON)).toEqual(['cert', 'office']);
    expect(doingItemsOn(WED)).toEqual(['systemDesign', 'office']);
    expect(doingItemsOn(FRI)).toEqual(['lld', 'office']);
  });

  test('a weekend is all three subjects and no office target', () => {
    expect(doingItemsOn(SAT)).toEqual(['cert', 'systemDesign', 'lld']);
  });
});

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

describe('gradeDay — thresholds on a weekday', () => {
  test('three of three is green', () => {
    expect(gradeDay(perfect(MON))).toBe('green');
  });

  test('two of three is amber', () => {
    expect(gradeDay(perfect(MON, { cert: { status: 'missed' } }))).toBe('amber');
  });

  test('one of three is red', () => {
    expect(
      gradeDay(perfect(MON, { cert: { status: 'missed' }, office: { status: 'missed' } })),
    ).toBe('red');
  });

  test('none is red', () => {
    expect(gradeDay(entry(MON))).toBe('red');
  });

  test('no entry is blank, not red', () => {
    expect(gradeDay(null)).toBeNull();
  });
});

describe('gradeDay — a subject the day did not ask for', () => {
  // The whole reason the schedule exists: one hour a weekday buys one subject, so
  // the other two are absent rather than failed. Grading them would make every
  // weekday amber and drain the colour of its meaning.
  test('missing an unscheduled subject cannot spoil a weekday', () => {
    const day = perfect(MON, {
      systemDesign: { status: 'missed' },
      lld: { status: 'missed' },
    });
    expect(gradeDay(day)).toBe('green');
  });

  test('a weekday needs only its own subject', () => {
    const wed = entry(WED, {
      phone: 'clean',
      systemDesign: { status: 'done', slot: '19:00' },
      office: { status: 'done' },
    });
    expect(gradeDay(wed)).toBe('green');

    const fri = entry(FRI, {
      phone: 'clean',
      lld: { status: 'done' },
      office: { status: 'done' },
    });
    expect(gradeDay(fri)).toBe('green');
  });

  test('doing the wrong subject does not discharge the scheduled one', () => {
    // Monday asks for the certification. An LLD hour is not a substitute, and there
    // is no control on Monday's screen to record one — the easy subject must not be
    // able to win every evening.
    const day = perfect(MON, { cert: { status: 'missed' }, lld: { status: 'done' } });
    expect(gradeDay(day)).toBe('amber');
  });
});

describe('gradeDay — weekend shape', () => {
  test('the office target is dropped entirely, not counted as failed', () => {
    expect(gradeDay(perfect(SAT, { office: { status: 'pending' } }))).toBe('green');
  });

  test('a completed office target does not add a fifth pass', () => {
    expect(gradeDay(perfect(SUN))).toBe('green');
  });

  test('three of four is amber on a weekend', () => {
    expect(gradeDay(perfect(SAT, { lld: { status: 'missed' } }))).toBe('amber');
  });

  test('two of four is red on a weekend', () => {
    const day = perfect(SAT, { lld: { status: 'missed' }, cert: { status: 'missed' } });
    expect(gradeDay(day)).toBe('red');
  });

  test('one of four is red on a weekend', () => {
    expect(gradeDay(entry(SAT, { phone: 'clean' }))).toBe('red');
  });

  test('the same failures grade differently on a weekday and a weekend', () => {
    const missing = {
      cert: { status: 'missed' as const },
      systemDesign: { status: 'missed' as const },
      office: { status: 'pending' as const },
    };
    // Monday never asked for system design, so only the certification is short.
    expect(gradeDay(perfect(MON, missing))).toBe('red'); // 1 of 3 — office is missing too
    expect(gradeDay(perfect(SAT, missing))).toBe('red'); // 2 of 4
    expect(gradeDay(perfect(TUE, { systemDesign: { status: 'missed' } }))).toBe('green');
  });
});

describe('gradeDay — carried and expired', () => {
  test('a carried item is a provisional pass', () => {
    const day = perfect(MON, { cert: { status: 'carried', dueOn: TUE } });
    expect(gradeDay(day)).toBe('green');
  });

  test('an expired carry is a failure', () => {
    const day = perfect(MON, { cert: { status: 'expired', dueOn: TUE } });
    expect(gradeDay(day)).toBe('amber');
  });

  test('the same day grades differently before and after expiry', () => {
    const before = perfect(MON, { cert: { status: 'carried', dueOn: TUE } });
    const after = { ...before, cert: { status: 'expired' as const, dueOn: TUE } };
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
    const days = [perfect(MON), perfect(TUE, { phone: 'lost' }), entry(WED), null];
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

  test('each subject counts only the days it was scheduled', () => {
    // A full week. Certification runs five days, system design three, LLD three.
    const week = [MON, TUE, WED, THU, FRI, SAT, SUN].map((d) => perfect(d));
    const rates = itemRates(week);
    expect(rates.find((r) => r.item === 'cert')?.applicable).toBe(5);
    expect(rates.find((r) => r.item === 'systemDesign')?.applicable).toBe(3);
    expect(rates.find((r) => r.item === 'lld')?.applicable).toBe(3);
    expect(rates.find((r) => r.item === 'office')?.applicable).toBe(5);
    expect(rates.find((r) => r.item === 'phone')?.applicable).toBe(7);
  });

  test('a subject is not marked down on a day it was never scheduled', () => {
    // LLD left pending all week is not a miss until Friday.
    const days = [perfect(MON, { lld: { status: 'pending' } }), perfect(TUE, { lld: { status: 'pending' } })];
    const lld = itemRates(days).find((r) => r.item === 'lld');
    expect(lld).toMatchObject({ applicable: 0, passed: 0, rate: null });
  });

  test('names the failing item across a set of days', () => {
    const days = [
      perfect(MON, { cert: { status: 'missed' } }),
      perfect(TUE, { cert: { status: 'missed' } }),
      perfect(THU),
    ];
    const cert = itemRates(days).find((r) => r.item === 'cert');
    expect(cert).toMatchObject({ applicable: 3, passed: 1, rate: 1 / 3 });
  });

  test('a carried item counts as passed, an expired one does not', () => {
    const days = [
      perfect(MON, { cert: { status: 'carried', dueOn: TUE } }),
      perfect(TUE, { cert: { status: 'expired', dueOn: WED } }),
    ];
    const cert = itemRates(days).find((r) => r.item === 'cert');
    expect(cert).toMatchObject({ applicable: 2, passed: 1 });
  });
});

describe('slotSplit', () => {
  test('counts only completed system design blocks', () => {
    const days = [
      perfect(WED, { systemDesign: { status: 'done', slot: '19:00' } }),
      perfect(SAT, { systemDesign: { status: 'done', slot: '21:00' } }),
      perfect(SUN, { systemDesign: { status: 'done', slot: '19:00' } }),
      perfect(WED, { systemDesign: { status: 'missed' } }),
      // A carry records no slot, because nothing happened.
      perfect(WED, { systemDesign: { status: 'carried', dueOn: THU } }),
    ];
    expect(slotSplit(days)).toEqual({ '19:00': 2, '21:00': 1 });
  });
});

describe('englishRate', () => {
  test('counts sub-checks, three per recorded day', () => {
    const days = [
      entry(MON, { english: { standup: true, rewrite: true, drill: false } }),
      entry(TUE, { english: { standup: true, rewrite: false, drill: false } }),
      null,
    ];
    expect(englishRate(days)).toEqual({ completed: 3, applicable: 6, rate: 0.5 });
  });
});

describe('urgeSeries — blank is not zero', () => {
  const dates = [MON, TUE, WED];

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
    expect(streak([perfect(MON, { phone: 'lost' }), perfect(TUE), perfect(WED)])).toBe(3);
  });

  test('a red day stops it', () => {
    expect(streak([perfect(MON), entry(TUE), perfect(WED)])).toBe(1);
  });

  test('a blank day neither extends nor breaks it', () => {
    expect(streak([perfect(MON), null, perfect(WED)])).toBe(2);
  });

  test('is zero when the most recent graded day is red', () => {
    expect(streak([perfect(MON), entry(TUE)])).toBe(0);
  });
});

describe('mostMissed', () => {
  test('names the item with the most misses', () => {
    const days = [
      perfect(MON, { cert: { status: 'missed' } }),
      perfect(TUE, { cert: { status: 'missed' } }),
      perfect(THU, { cert: { status: 'missed' } }),
      perfect(WED, { office: { status: 'missed' } }),
    ];
    expect(mostMissed(days)).toMatchObject({ missed: 3, item: { item: 'cert' } });
  });

  test('counts a subject only on the days it was owed', () => {
    // LLD missed on its one scheduled day beats the certification missed on none.
    const days = [perfect(FRI, { lld: { status: 'missed' } }), perfect(MON)];
    expect(mostMissed(days)).toMatchObject({ missed: 1, item: { item: 'lld' } });
  });

  test('is null when nothing was missed', () => {
    expect(mostMissed([perfect(MON), perfect(TUE)])).toBeNull();
  });
});
