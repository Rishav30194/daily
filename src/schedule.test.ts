import { describe, expect, test } from 'vitest';

import { isScheduled, scheduledOn } from './schedule';

// 2026-08-17 is a Monday, so this week runs Mon 17 to Sun 23.
const MON = '2026-08-17';
const TUE = '2026-08-18';
const WED = '2026-08-19';
const THU = '2026-08-20';
const FRI = '2026-08-21';
const SAT = '2026-08-22';
const SUN = '2026-08-23';

describe('scheduledOn', () => {
  test('gives a weekday exactly one subject', () => {
    expect(scheduledOn(MON)).toEqual(['cert']);
    expect(scheduledOn(TUE)).toEqual(['cert']);
    expect(scheduledOn(WED)).toEqual(['systemDesign']);
    expect(scheduledOn(THU)).toEqual(['cert']);
    expect(scheduledOn(FRI)).toEqual(['lld']);
  });

  test('gives both weekend days all three, in running order', () => {
    expect(scheduledOn(SAT)).toEqual(['cert', 'systemDesign', 'lld']);
    expect(scheduledOn(SUN)).toEqual(['cert', 'systemDesign', 'lld']);
  });

  test('gives the certification the most weekday hours', () => {
    const weekdays = [MON, TUE, WED, THU, FRI];
    const certDays = weekdays.filter((d) => isScheduled('cert', d));
    expect(certDays).toEqual([MON, TUE, THU]);
  });

  test('returns a fresh array, so a caller cannot edit the schedule', () => {
    const first = scheduledOn(MON);
    first.push('lld');
    expect(scheduledOn(MON)).toEqual(['cert']);
  });

  test('rejects a value that is not a date', () => {
    expect(() => scheduledOn('not-a-date')).toThrow();
  });
});

describe('isScheduled', () => {
  test('is false for a subject the day does not ask for', () => {
    // Doing LLD on a Monday does not discharge Monday's certification hour, and
    // Monday never counts LLD as a miss — it is not part of that day.
    expect(isScheduled('lld', MON)).toBe(false);
    expect(isScheduled('systemDesign', MON)).toBe(false);
  });

  test('is true for every subject at the weekend', () => {
    for (const item of ['cert', 'systemDesign', 'lld'] as const) {
      expect(isScheduled(item, SAT)).toBe(true);
    }
  });
});
