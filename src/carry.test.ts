import { describe, expect, test } from 'vitest';

import {
  CARRY_LIMIT_MESSAGE,
  canCarry,
  carriedInto,
  carriesInWindow,
  carryItem,
  settle,
} from './carry';
import { addDays } from './dates';
import { gradeDay } from './grading';
import { entry, perfect } from './testing';

const NOW = new Date('2026-08-17T20:00:00.000Z');
const TODAY = '2026-08-17';

/** A day whose given item is carried to the following day. */
function carried(date: string, item: 'systemDesign' | 'coding' | 'office') {
  return entry(date, { [item]: { status: 'carried', dueOn: addDays(date, 1) } });
}

describe('canCarry — the control is hidden, not disabled', () => {
  test('an already-carried item hides the control', () => {
    // Hidden rather than disabled: a greyed-out control invites a second attempt,
    // an absent one closes the question.
    const day = carried(TODAY, 'coding');
    expect(canCarry('coding', day, [], TODAY)).toEqual({ kind: 'hidden' });
  });

  test('an expired item hides the control', () => {
    const day = entry(TODAY, { coding: { status: 'expired', dueOn: '2026-08-16' } });
    expect(canCarry('coding', day, [], TODAY)).toEqual({ kind: 'hidden' });
  });

  test('a completed item hides the control', () => {
    const day = entry(TODAY, { coding: { status: 'done', choice: 'coding' } });
    expect(canCarry('coding', day, [], TODAY)).toEqual({ kind: 'hidden' });
  });

  test('a pending item allows it', () => {
    expect(canCarry('coding', entry(TODAY), [], TODAY)).toEqual({ kind: 'allowed' });
  });
});

describe('canCarry — the rolling window', () => {
  test('one carry in the window still allows another', () => {
    const window = [carried('2026-08-15', 'coding')];
    expect(canCarry('office', entry(TODAY), window, TODAY)).toEqual({ kind: 'allowed' });
  });

  test('two carries in the window disable the control with the exact message', () => {
    const window = [carried('2026-08-14', 'coding'), carried('2026-08-15', 'office')];
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
      coding: { status: 'carried', dueOn: '2026-08-16' },
      office: { status: 'carried', dueOn: '2026-08-16' },
    });
    expect(canCarry('systemDesign', entry(TODAY), [both], TODAY).kind).toBe('disabled');
  });
});

describe('carriesInWindow', () => {
  test('counts the seven calendar days ending today, inclusive', () => {
    // Day 7 back is inside the window; day 8 is not.
    const inside = carried('2026-08-11', 'coding');
    const outside = carried('2026-08-10', 'coding');
    expect(carriesInWindow([inside], TODAY)).toBe(1);
    expect(carriesInWindow([outside], TODAY)).toBe(0);
  });

  test('today counts', () => {
    expect(carriesInWindow([carried(TODAY, 'coding')], TODAY)).toBe(1);
  });

  test('an expired carry still consumes a slot', () => {
    // Letting expiry free the slot back up would reward failing.
    const expired = entry('2026-08-15', {
      coding: { status: 'expired', dueOn: '2026-08-16' },
    });
    expect(carriesInWindow([expired], TODAY)).toBe(1);
  });

  test('done and missed items consume nothing', () => {
    const day = entry('2026-08-15', {
      coding: { status: 'done', choice: 'cert' },
      office: { status: 'missed' },
    });
    expect(carriesInWindow([day], TODAY)).toBe(0);
  });

  test('an expired carry keeps the window full', () => {
    const window = [
      entry('2026-08-14', { coding: { status: 'expired', dueOn: '2026-08-15' } }),
      carried('2026-08-16', 'office'),
    ];
    expect(canCarry('systemDesign', entry(TODAY), window, TODAY).kind).toBe('disabled');
  });
});

describe('carryItem', () => {
  test('marks the item carried and due the next day', () => {
    const result = carryItem('coding', entry(TODAY), NOW);
    expect(result.coding).toEqual({ status: 'carried', dueOn: '2026-08-18' });
  });

  test('does not mutate the input', () => {
    const original = entry(TODAY);
    carryItem('coding', original, NOW);
    expect(original.coding.status).toBe('pending');
  });
});

describe('settle — expiry', () => {
  test('expires a carry whose due day has passed', () => {
    const day = carried('2026-08-15', 'coding'); // due 2026-08-16
    const changed = settle([day], TODAY, NOW);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.coding.status).toBe('expired');
  });

  test('leaves a carry due today alone', () => {
    const day = entry('2026-08-16', { coding: { status: 'carried', dueOn: TODAY } });
    expect(settle([day], TODAY, NOW)).toEqual([]);
  });

  test('leaves a carry due tomorrow alone', () => {
    const day = carried(TODAY, 'coding'); // due 2026-08-18
    expect(settle([day], TODAY, NOW)).toEqual([]);
  });

  test('returns only the entries that changed', () => {
    const days = [perfect('2026-08-14'), carried('2026-08-15', 'coding'), perfect('2026-08-16')];
    expect(settle(days, TODAY, NOW)).toHaveLength(1);
  });

  test('expires several items on one day in a single entry', () => {
    const day = entry('2026-08-15', {
      coding: { status: 'carried', dueOn: '2026-08-16' },
      office: { status: 'carried', dueOn: '2026-08-16' },
    });
    const changed = settle([day], TODAY, NOW);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.coding.status).toBe('expired');
    expect(changed[0]?.office.status).toBe('expired');
  });

  test('does not mutate the input', () => {
    const day = carried('2026-08-15', 'coding');
    settle([day], TODAY, NOW);
    expect(day.coding.status).toBe('carried');
  });

  test('writes to an entry far older than the edit lock', () => {
    // The 7-day lock guards user edits only; system-driven expiry ignores it.
    const old = entry('2026-07-01', { coding: { status: 'carried', dueOn: '2026-07-02' } });
    const changed = settle([old], TODAY, NOW);
    expect(changed[0]?.coding.status).toBe('expired');
  });
});

describe('settle — the retroactive downgrade', () => {
  // 2026-08-13 is a Thursday, so all four core items apply. A weekend date would
  // quietly drop the office target and test something else.
  const THU = '2026-08-13';

  test('expiry turns the original day from green to amber', () => {
    const day = perfect(THU, { coding: { status: 'carried', dueOn: '2026-08-14' } });
    expect(gradeDay(day)).toBe('green');

    const [settled] = settle([day], TODAY, NOW);
    expect(gradeDay(settled ?? null)).toBe('amber');
  });

  test('expiry of two items turns green into red', () => {
    const day = perfect(THU, {
      coding: { status: 'carried', dueOn: '2026-08-14' },
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
    const day = carried('2026-08-15', 'coding');
    const [once] = settle([day], TODAY, NOW);
    expect(settle([once ?? null], TODAY, NOW)).toEqual([]);
  });
});

describe('carriedInto', () => {
  test('lists items carried in from the previous day', () => {
    const previous = carried('2026-08-17', 'coding'); // due 2026-08-18
    expect(carriedInto(previous, '2026-08-18')).toEqual(['coding']);
  });

  test('ignores a carry due on another day', () => {
    const previous = carried('2026-08-17', 'coding');
    expect(carriedInto(previous, '2026-08-19')).toEqual([]);
  });

  test('ignores an expired carry', () => {
    const previous = entry('2026-08-17', {
      coding: { status: 'expired', dueOn: '2026-08-18' },
    });
    expect(carriedInto(previous, '2026-08-18')).toEqual([]);
  });

  test('no previous day means nothing carried in', () => {
    expect(carriedInto(null, '2026-08-18')).toEqual([]);
  });
});
