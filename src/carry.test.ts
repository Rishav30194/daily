import { describe, expect, test } from 'vitest';

import {
  CARRY_LIMIT_MESSAGE,
  canCarry,
  carriedInto,
  carriesInWindow,
  carryItem,
  completeCarried,
  settle,
} from './carry';
import { addDays } from './dates';
import { gradeDay } from './grading';
import { entry, perfect } from './testing';
import type { DoingItemId } from './types';

const NOW = new Date('2026-08-17T20:00:00.000Z');
const TODAY = '2026-08-17';

/** A day whose given item is carried to the following day. */
function carried(date: string, item: DoingItemId) {
  return entry(date, { [item]: { status: 'carried', dueOn: addDays(date, 1) } });
}

describe('canCarry — the control is hidden, not disabled', () => {
  test('an already-carried item hides the control', () => {
    // Hidden rather than disabled: a greyed-out control invites a second attempt,
    // an absent one closes the question.
    const day = carried(TODAY, 'cert');
    expect(canCarry('cert', day, [], TODAY)).toEqual({ kind: 'hidden' });
  });

  test('an expired item hides the control', () => {
    const day = entry(TODAY, { cert: { status: 'expired', dueOn: '2026-08-16' } });
    expect(canCarry('cert', day, [], TODAY)).toEqual({ kind: 'hidden' });
  });

  test('a completed item hides the control', () => {
    const day = entry(TODAY, { cert: { status: 'done' } });
    expect(canCarry('cert', day, [], TODAY)).toEqual({ kind: 'hidden' });
  });

  test('a pending item allows it', () => {
    expect(canCarry('cert', entry(TODAY), [], TODAY)).toEqual({ kind: 'allowed' });
  });
});

describe('canCarry — the rolling window', () => {
  test('one carry in the window still allows another', () => {
    const window = [carried('2026-08-15', 'cert')];
    expect(canCarry('office', entry(TODAY), window, TODAY)).toEqual({ kind: 'allowed' });
  });

  test('two carries in the window disable the control with the exact message', () => {
    const window = [carried('2026-08-14', 'cert'), carried('2026-08-15', 'office')];
    expect(canCarry('systemDesign', entry(TODAY), window, TODAY)).toEqual({
      kind: 'disabled',
      message: 'Two carries this week already. Do it today or take the miss.',
    });
  });

  test('the message constant is not reworded', () => {
    expect(CARRY_LIMIT_MESSAGE).toBe(
      'Two carries this week already. Do it today or take the miss.',
    );
  });

  test('two carries on the same day still fill the window', () => {
    const both = entry('2026-08-15', {
      cert: { status: 'carried', dueOn: '2026-08-16' },
      office: { status: 'carried', dueOn: '2026-08-16' },
    });
    expect(canCarry('systemDesign', entry(TODAY), [both], TODAY).kind).toBe('disabled');
  });
});

describe('carriesInWindow', () => {
  test('counts the seven calendar days ending today, inclusive', () => {
    // Day 7 back is inside the window; day 8 is not.
    const inside = carried('2026-08-11', 'cert');
    const outside = carried('2026-08-10', 'cert');
    expect(carriesInWindow([inside], TODAY)).toBe(1);
    expect(carriesInWindow([outside], TODAY)).toBe(0);
  });

  test('today counts', () => {
    expect(carriesInWindow([carried(TODAY, 'cert')], TODAY)).toBe(1);
  });

  test('an expired carry still consumes a slot', () => {
    // Letting expiry free the slot back up would reward failing.
    const expired = entry('2026-08-15', {
      cert: { status: 'expired', dueOn: '2026-08-16' },
    });
    expect(carriesInWindow([expired], TODAY)).toBe(1);
  });

  test('done and missed items consume nothing', () => {
    const day = entry('2026-08-15', {
      cert: { status: 'done' },
      office: { status: 'missed' },
    });
    expect(carriesInWindow([day], TODAY)).toBe(0);
  });

  test('an expired carry keeps the window full', () => {
    const window = [
      entry('2026-08-14', { cert: { status: 'expired', dueOn: '2026-08-15' } }),
      carried('2026-08-16', 'office'),
    ];
    expect(canCarry('systemDesign', entry(TODAY), window, TODAY).kind).toBe('disabled');
  });
});

describe('carryItem', () => {
  test('marks the item carried and due the next day', () => {
    const result = carryItem('cert', entry(TODAY), NOW);
    expect(result.cert).toEqual({ status: 'carried', dueOn: '2026-08-18' });
  });

  test('does not mutate the input', () => {
    const original = entry(TODAY);
    carryItem('cert', original, NOW);
    expect(original.cert.status).toBe('pending');
  });
});

describe('settle — expiry', () => {
  test('expires a carry whose due day has passed', () => {
    const day = carried('2026-08-15', 'cert'); // due 2026-08-16
    const changed = settle([day], TODAY, NOW);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.cert.status).toBe('expired');
  });

  test('leaves a carry due today alone', () => {
    const day = entry('2026-08-16', { cert: { status: 'carried', dueOn: TODAY } });
    expect(settle([day], TODAY, NOW)).toEqual([]);
  });

  test('leaves a carry due tomorrow alone', () => {
    const day = carried(TODAY, 'cert'); // due 2026-08-18
    expect(settle([day], TODAY, NOW)).toEqual([]);
  });

  test('returns only the entries that changed', () => {
    const days = [perfect('2026-08-14'), carried('2026-08-15', 'cert'), perfect('2026-08-16')];
    expect(settle(days, TODAY, NOW)).toHaveLength(1);
  });

  test('expires several items on one day in a single entry', () => {
    const day = entry('2026-08-15', {
      cert: { status: 'carried', dueOn: '2026-08-16' },
      office: { status: 'carried', dueOn: '2026-08-16' },
    });
    const changed = settle([day], TODAY, NOW);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.cert.status).toBe('expired');
    expect(changed[0]?.office.status).toBe('expired');
  });

  test('does not mutate the input', () => {
    const day = carried('2026-08-15', 'cert');
    settle([day], TODAY, NOW);
    expect(day.cert.status).toBe('carried');
  });

  test('writes to an entry far older than the edit lock', () => {
    // The 7-day lock guards user edits only; system-driven expiry ignores it.
    const old = entry('2026-07-01', { cert: { status: 'carried', dueOn: '2026-07-02' } });
    const changed = settle([old], TODAY, NOW);
    expect(changed[0]?.cert.status).toBe('expired');
  });
});

describe('settle — the retroactive downgrade', () => {
  // 2026-08-13 is a Thursday: certification and the office target, so a carry on
  // either one costs a grade. A weekend date would drop the office target and test
  // something else.
  const THU = '2026-08-13';

  test('expiry turns the original day from green to amber', () => {
    const day = perfect(THU, { cert: { status: 'carried', dueOn: '2026-08-14' } });
    expect(gradeDay(day)).toBe('green');

    const [settled] = settle([day], TODAY, NOW);
    expect(gradeDay(settled ?? null)).toBe('amber');
  });

  test('expiry of two items turns green into red', () => {
    const day = perfect(THU, {
      cert: { status: 'carried', dueOn: '2026-08-14' },
      office: { status: 'carried', dueOn: '2026-08-14' },
    });
    expect(gradeDay(day)).toBe('green');

    const [settled] = settle([day], TODAY, NOW);
    expect(gradeDay(settled ?? null)).toBe('red');
  });

  test('a weekend day ignores an expired office carry entirely', () => {
    // Office does not apply on Saturday, so its expiry cannot cost a grade.
    const sat = perfect('2026-08-15', {
      office: { status: 'carried', dueOn: '2026-08-16' },
    });
    const [settled] = settle([sat], TODAY, NOW);
    expect(gradeDay(settled ?? null)).toBe('green');
  });

  test('settling twice is idempotent', () => {
    const day = carried('2026-08-15', 'cert');
    const [once] = settle([day], TODAY, NOW);
    expect(settle([once ?? null], TODAY, NOW)).toEqual([]);
  });
});

describe('carriedInto', () => {
  test('lists items carried in from the previous day', () => {
    const previous = carried('2026-08-17', 'cert'); // due 2026-08-18
    expect(carriedInto(previous, '2026-08-18')).toEqual([
      { item: 'cert', from: '2026-08-17', done: false },
    ]);
  });

  test('ignores a carry due on another day', () => {
    const previous = carried('2026-08-17', 'cert');
    expect(carriedInto(previous, '2026-08-19')).toEqual([]);
  });

  test('ignores an expired carry', () => {
    const previous = entry('2026-08-17', {
      cert: { status: 'expired', dueOn: '2026-08-18' },
    });
    expect(carriedInto(previous, '2026-08-18')).toEqual([]);
  });

  test('keeps a completed carry in the list, flagged done', () => {
    // Otherwise the row vanishes the moment it is ticked, and the tap reads as lost.
    const previous = entry('2026-08-17', {
      cert: { status: 'done', dueOn: '2026-08-18' },
    });
    expect(carriedInto(previous, '2026-08-18')).toEqual([
      { item: 'cert', from: '2026-08-17', done: true },
    ]);
  });

  test('ignores an item done on the previous day that was never carried', () => {
    const previous = entry('2026-08-17', { cert: { status: 'done' } });
    expect(carriedInto(previous, '2026-08-18')).toEqual([]);
  });

  test('lists several items carried into the same day', () => {
    const previous = entry('2026-08-17', {
      systemDesign: { status: 'carried', dueOn: '2026-08-18' },
      office: { status: 'carried', dueOn: '2026-08-18' },
    });
    expect(carriedInto(previous, '2026-08-18').map((c) => c.item)).toEqual([
      'systemDesign',
      'office',
    ]);
  });

  test('no previous day means nothing carried in', () => {
    expect(carriedInto(null, '2026-08-18')).toEqual([]);
  });
});

describe('completeCarried', () => {
  const ORIGIN = '2026-08-16';

  test('writes the completion to the origin day, keeping dueOn', () => {
    const origin = carried(ORIGIN, 'cert'); // due 2026-08-17
    const result = completeCarried('cert', origin, true, NOW);
    expect(result.cert).toEqual({ status: 'done', dueOn: TODAY });
  });

  test('un-completing puts it back to carried', () => {
    const origin = entry(ORIGIN, { cert: { status: 'done', dueOn: TODAY } });
    const result = completeCarried('cert', origin, false, NOW);
    expect(result.cert).toEqual({ status: 'carried', dueOn: TODAY });
  });

  test('does not touch the rest of the origin day', () => {
    const origin = perfect(ORIGIN, { cert: { status: 'carried', dueOn: TODAY } });
    const result = completeCarried('cert', origin, true, NOW);
    expect(result.systemDesign).toEqual(origin.systemDesign);
    expect(result.office).toEqual(origin.office);
    expect(result.phone).toBe(origin.phone);
  });

  test('does not mutate the input', () => {
    const origin = carried(ORIGIN, 'cert');
    completeCarried('cert', origin, true, NOW);
    expect(origin.cert.status).toBe('carried');
  });

  test('a landed carry survives settlement that would otherwise expire it', () => {
    // The carry was due yesterday and completed then; settling today must leave it.
    const origin = entry('2026-08-15', { cert: { status: 'carried', dueOn: '2026-08-16' } });
    const done = completeCarried('cert', origin, true, NOW);
    expect(settle([done], TODAY, NOW)).toEqual([]);
  });

  test('completing a carry restores the origin day from red to green', () => {
    // 2026-08-13 is a Thursday: phone, certification, office target.
    const origin = perfect('2026-08-13', {
      cert: { status: 'missed' },
      office: { status: 'missed' },
    });
    expect(gradeDay(origin)).toBe('red');

    const carriedDay = carryItem('cert', origin, NOW);
    expect(gradeDay(carriedDay)).toBe('amber'); // provisional pass while outstanding

    const settled = completeCarried('cert', carriedDay, true, NOW);
    expect(gradeDay(settled)).toBe('amber'); // office is still a real miss

    expect(gradeDay(completeCarried('office', carryItem('office', settled, NOW), true, NOW))).toBe(
      'green',
    );
  });
});
