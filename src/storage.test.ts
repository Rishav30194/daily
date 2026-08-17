import { beforeEach, describe, expect, test } from 'vitest';

import { gradeDay } from './grading';
import {
  StorageFullError,
  exportAll,
  getAllReviews,
  getDay,
  getMeta,
  getMonth,
  getRange,
  getReview,
  importAll,
  markExported,
  saveDay,
  saveMeta,
  saveReview,
  writeDayRaw,
} from './storage';
import { entry, installStorage, perfect, type MemoryStorage } from './testing';

const NOW = new Date('2026-08-17T20:00:00.000Z');

let store: MemoryStorage;
beforeEach(() => {
  store = installStorage();
});

describe('days', () => {
  test('round-trips an entry', () => {
    const day = perfect('2026-08-17', { urges: 3, note: 'held it' });
    saveDay('2026-08-17', day, NOW);

    const read = getDay('2026-08-17');
    expect(read).toMatchObject({
      date: '2026-08-17',
      phone: 'clean',
      urges: 3,
      note: 'held it',
    });
    expect(read?.systemDesign).toEqual({ status: 'done', slot: '11:00' });
    expect(read?.coding).toEqual({ status: 'done', choice: 'coding' });
  });

  test('an absent day is null, not an empty entry', () => {
    expect(getDay('2026-08-17')).toBeNull();
  });

  test('saveDay stamps updatedAt and the schema', () => {
    saveDay('2026-08-17', entry('2026-08-17'), NOW);
    const read = getDay('2026-08-17');
    expect(read?.updatedAt).toBe(NOW.toISOString());
    expect(read?.schema).toBe(1);
  });

  test('writeDayRaw preserves updatedAt', () => {
    const day = entry('2026-08-17', { updatedAt: '2020-01-01T00:00:00.000Z' });
    writeDayRaw(day);
    expect(getDay('2026-08-17')?.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  test('a carried item keeps its dueOn through a round trip', () => {
    const day = entry('2026-08-17', { coding: { status: 'carried', dueOn: '2026-08-18' } });
    saveDay('2026-08-17', day, NOW);
    expect(getDay('2026-08-17')?.coding).toEqual({ status: 'carried', dueOn: '2026-08-18' });
  });
});

describe('days — blank is not zero', () => {
  test('a blank urge count round-trips as null', () => {
    saveDay('2026-08-17', entry('2026-08-17', { urges: null }), NOW);
    expect(getDay('2026-08-17')?.urges).toBeNull();
  });

  test('a zero urge count round-trips as zero', () => {
    saveDay('2026-08-17', entry('2026-08-17', { urges: 0 }), NOW);
    expect(getDay('2026-08-17')?.urges).toBe(0);
  });

  test('a missing urges field reads as null, never zero', () => {
    store.setItem('daily:v1:day:2026-08-17', JSON.stringify({ date: '2026-08-17' }));
    expect(getDay('2026-08-17')?.urges).toBeNull();
  });

  test('a non-numeric urges value reads as null', () => {
    store.setItem('daily:v1:day:2026-08-17', JSON.stringify({ date: '2026-08-17', urges: 'lots' }));
    expect(getDay('2026-08-17')?.urges).toBeNull();
  });
});

describe('defensive reads', () => {
  test('unparseable JSON reads as an absent day rather than throwing', () => {
    store.setItem('daily:v1:day:2026-08-17', '{not json');
    expect(() => getDay('2026-08-17')).not.toThrow();
    expect(getDay('2026-08-17')).toBeNull();
  });

  test('a non-object value reads as absent', () => {
    store.setItem('daily:v1:day:2026-08-17', '42');
    expect(getDay('2026-08-17')).toBeNull();
  });

  test('an unknown item status falls back to pending', () => {
    store.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify({ date: '2026-08-17', coding: { status: 'sort-of' } }),
    );
    expect(getDay('2026-08-17')?.coding.status).toBe('pending');
  });

  test('an unknown phone state falls back to unanswered', () => {
    store.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify({ date: '2026-08-17', phone: 'mostly-clean' }),
    );
    expect(getDay('2026-08-17')?.phone).toBeNull();
  });

  test('one corrupt day does not affect its neighbours', () => {
    saveDay('2026-08-16', perfect('2026-08-16'), NOW);
    store.setItem('daily:v1:day:2026-08-17', 'corrupt');
    saveDay('2026-08-18', perfect('2026-08-18'), NOW);

    const range = getRange('2026-08-16', '2026-08-18');
    expect(range.map((d) => d !== null)).toEqual([true, false, true]);
  });
});

describe('getMonth and getRange', () => {
  test('getMonth is indexed from the 1st and pads absent days', () => {
    saveDay('2026-02-03', perfect('2026-02-03'), NOW);
    const month = getMonth('2026-02');
    expect(month).toHaveLength(28);
    expect(month[0]).toBeNull();
    expect(month[2]?.date).toBe('2026-02-03');
  });

  test('getRange crosses a month boundary, which getMonth cannot', () => {
    saveDay('2026-07-31', perfect('2026-07-31'), NOW);
    saveDay('2026-08-01', perfect('2026-08-01'), NOW);

    const range = getRange('2026-07-30', '2026-08-02');
    expect(range).toHaveLength(4);
    expect(range.map((d) => d?.date ?? null)).toEqual([
      null,
      '2026-07-31',
      '2026-08-01',
      null,
    ]);
  });
});

describe('reviews', () => {
  test('round-trips and stamps updatedAt', () => {
    saveReview('2026-W34', { week: '2026-W34', change: 'move coding earlier', updatedAt: '' }, NOW);
    const read = getReview('2026-W34');
    expect(read?.change).toBe('move coding earlier');
    expect(read?.updatedAt).toBe(NOW.toISOString());
  });

  test('getAllReviews returns newest week first', () => {
    for (const w of ['2026-W32', '2026-W34', '2026-W33']) {
      saveReview(w, { week: w, change: w, updatedAt: '' }, NOW);
    }
    expect(getAllReviews().map((r) => r.week)).toEqual(['2026-W34', '2026-W33', '2026-W32']);
  });

  test('an absent review is null', () => {
    expect(getReview('2026-W34')).toBeNull();
  });
});

describe('meta', () => {
  test('defaults are blank, not undefined', () => {
    expect(getMeta()).toEqual({ schema: 1, lastSettledOn: null, lastExportAt: null });
  });

  test('round-trips', () => {
    saveMeta({ schema: 1, lastSettledOn: '2026-08-17', lastExportAt: null });
    expect(getMeta().lastSettledOn).toBe('2026-08-17');
  });

  test('markExported records the time', () => {
    markExported(NOW);
    expect(getMeta().lastExportAt).toBe(NOW.toISOString());
  });
});

describe('export / import round trip', () => {
  function seed() {
    saveDay('2026-08-16', perfect('2026-08-16', { urges: 0 }), NOW);
    saveDay('2026-08-17', entry('2026-08-17', { urges: null, note: 'rough' }), NOW);
    saveReview('2026-W34', { week: '2026-W34', change: 'earlier', updatedAt: '' }, NOW);
    markExported(NOW);
  }

  test('exports valid JSON with a schema', () => {
    seed();
    const doc = JSON.parse(exportAll(NOW));
    expect(doc.schema).toBe(1);
    expect(doc.exportedAt).toBe(NOW.toISOString());
    expect(Object.keys(doc.days)).toHaveLength(2);
  });

  test('is lossless through export, wipe and import', () => {
    seed();
    const before = exportAll(NOW);

    installStorage(); // a clean device
    const result = importAll(before);
    expect(result.ok).toBe(true);
    expect(result.added).toBe(3); // two days and one review

    // Re-exporting produces the same document, modulo the export timestamp.
    const after = exportAll(NOW);
    expect(JSON.parse(after).days).toEqual(JSON.parse(before).days);
    expect(JSON.parse(after).reviews).toEqual(JSON.parse(before).reviews);
  });

  test('preserves the blank/zero distinction across a round trip', () => {
    seed();
    const doc = exportAll(NOW);

    installStorage();
    importAll(doc);
    expect(getDay('2026-08-16')?.urges).toBe(0);
    expect(getDay('2026-08-17')?.urges).toBeNull();
  });
});

describe('import merges rather than clobbers', () => {
  const older = '2026-08-01T00:00:00.000Z';
  const newer = '2026-08-20T00:00:00.000Z';

  function docWith(updatedAt: string, note: string) {
    return JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: { '2026-08-17': { ...entry('2026-08-17', { note }), updatedAt } },
      reviews: {},
    });
  }

  test('a newer incoming record wins', () => {
    writeDayRaw(entry('2026-08-17', { note: 'stored', updatedAt: older }));
    const result = importAll(docWith(newer, 'incoming'));

    expect(result.updated).toBe(1);
    expect(getDay('2026-08-17')?.note).toBe('incoming');
  });

  test('an older incoming record is skipped, not applied', () => {
    // A restore onto a device used since the export must not discard newer entries.
    writeDayRaw(entry('2026-08-17', { note: 'stored', updatedAt: newer }));
    const result = importAll(docWith(older, 'incoming'));

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(getDay('2026-08-17')?.note).toBe('stored');
  });

  test('an identical timestamp is skipped', () => {
    writeDayRaw(entry('2026-08-17', { note: 'stored', updatedAt: newer }));
    importAll(docWith(newer, 'incoming'));
    expect(getDay('2026-08-17')?.note).toBe('stored');
  });

  test('records absent locally are added', () => {
    const result = importAll(docWith(newer, 'incoming'));
    expect(result).toMatchObject({ added: 1, updated: 0, skipped: 0 });
  });

  test('untouched days survive an import', () => {
    saveDay('2026-08-10', perfect('2026-08-10'), NOW);
    importAll(docWith(newer, 'incoming'));
    expect(getDay('2026-08-10')).not.toBeNull();
  });
});

describe('import dry run', () => {
  const older = '2026-08-01T00:00:00.000Z';
  const newer = '2026-08-20T00:00:00.000Z';

  const doc = JSON.stringify({
    schema: 1,
    exportedAt: NOW.toISOString(),
    days: {
      '2026-08-17': { ...entry('2026-08-17', { note: 'incoming' }), updatedAt: newer },
      '2026-08-18': { ...entry('2026-08-18', { note: 'new day' }), updatedAt: newer },
      '2026-08-19': { ...entry('2026-08-19', { note: 'stale' }), updatedAt: older },
    },
    reviews: { '2026-W34': { week: '2026-W34', change: 'incoming', updatedAt: newer } },
  });

  function seed() {
    writeDayRaw(entry('2026-08-17', { note: 'stored', updatedAt: older }));
    writeDayRaw(entry('2026-08-19', { note: 'stored', updatedAt: newer }));
  }

  test('writes nothing', () => {
    seed();
    importAll(doc, true);

    expect(getDay('2026-08-17')?.note).toBe('stored');
    expect(getDay('2026-08-18')).toBeNull();
    expect(getReview('2026-W34')).toBeNull();
  });

  test('returns the same counts the real import then produces', () => {
    seed();
    // The numbers shown before the commit have to be the numbers the commit makes
    // true, which is why this runs the same merge rather than a second one.
    const preview = importAll(doc, true);
    const applied = importAll(doc);

    expect(preview).toEqual({
      added: 2,
      updated: 1,
      skipped: 1,
      ok: true,
      oldestDay: '2026-08-17',
    });
    expect(applied).toEqual(preview);
    expect(getDay('2026-08-17')?.note).toBe('incoming');
  });

  test('reports a bad file without touching storage', () => {
    seed();
    expect(importAll('{oops', true).ok).toBe(false);
    expect(getDay('2026-08-17')?.note).toBe('stored');
  });
});

describe('import trusts the key, not the record', () => {
  test('a record whose inner date disagrees with its key is filed under the key', () => {
    // Otherwise a hand-edited export overwrites a day the merge never compared.
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: {
        '2026-08-17': { ...entry('2026-01-01', { note: 'lying' }), date: '2026-01-01' },
      },
      reviews: {},
    });

    importAll(doc);
    expect(getDay('2026-08-17')?.note).toBe('lying');
    expect(getDay('2026-08-17')?.date).toBe('2026-08-17');
    expect(getDay('2026-01-01')).toBeNull();
  });

  test('a newer local entry survives a record filed under someone else s date', () => {
    writeDayRaw(entry('2026-01-01', { note: 'mine', updatedAt: '2026-08-20T00:00:00.000Z' }));
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: {
        '2026-08-17': {
          ...entry('2026-01-01', { note: 'theirs' }),
          date: '2026-01-01',
          updatedAt: '2026-08-25T00:00:00.000Z',
        },
      },
      reviews: {},
    });

    importAll(doc);
    expect(getDay('2026-01-01')?.note).toBe('mine');
  });

  test('a key that is not a date is skipped, not written', () => {
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: { 'not-a-date': entry('2026-08-17'), '2026-02-30': entry('2026-08-17') },
      reviews: {},
    });

    const result = importAll(doc);
    expect(result).toMatchObject({ added: 0, skipped: 2, oldestDay: null });
    expect(localStorage.getItem('daily:v1:day:not-a-date')).toBeNull();
  });

  test('reports the oldest day it touched, for settlement', () => {
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: { '2026-08-17': entry('2026-08-17'), '2025-03-04': entry('2025-03-04') },
      reviews: {},
    });

    expect(importAll(doc, true).oldestDay).toBe('2025-03-04');
  });
});

describe('reviews are keyed by their key, not their contents', () => {
  test('a record whose inner week disagrees with its key is filed under the key', () => {
    // `weekStart` throws on anything that is not 'YYYY-Www', and the review history
    // renders every stored week — so one bad value crashes the Sunday screen.
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: {},
      reviews: { '2026-W33': { week: 'nonsense', change: 'x', updatedAt: NOW.toISOString() } },
    });

    importAll(doc);
    expect(getReview('2026-W33')?.week).toBe('2026-W33');
  });

  test('a key that is not a week is skipped', () => {
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: {},
      reviews: {
        nonsense: { change: 'x', updatedAt: NOW.toISOString() },
        '2026-W99': { change: 'x', updatedAt: NOW.toISOString() },
        // 2025 has 52 weeks, so W53 is not a week that year — it resolves to
        // 2026-W01 and would sit in the history as a duplicate of it.
        '2025-W53': { change: 'x', updatedAt: NOW.toISOString() },
        '': { change: 'x', updatedAt: NOW.toISOString() },
      },
    });

    expect(importAll(doc)).toMatchObject({ added: 0, skipped: 4 });
    expect(getAllReviews()).toEqual([]);
  });

  test('a year that really has 53 weeks keeps its last one', () => {
    const doc = JSON.stringify({
      schema: 1,
      exportedAt: NOW.toISOString(),
      days: {},
      reviews: { '2026-W53': { change: 'real', updatedAt: NOW.toISOString() } },
    });

    expect(importAll(doc)).toMatchObject({ added: 1, skipped: 0 });
    expect(getReview('2026-W53')?.change).toBe('real');
  });

  test('a week key stored before the check existed is not returned', () => {
    localStorage.setItem(
      'daily:v1:review:nonsense',
      JSON.stringify({ week: 'nonsense', change: 'x', updatedAt: NOW.toISOString() }),
    );
    saveReview('2026-W33', { week: '2026-W33', change: 'real', updatedAt: '' }, NOW);

    expect(getAllReviews().map((r) => r.week)).toEqual(['2026-W33']);
  });
});

describe('dueOn is a date or it is nothing', () => {
  test('a carry with a corrupt dueOn reads as lapsed, never as a pass', () => {
    // The date is fed to parseISO and diffDays, both of which throw, so it has to go.
    // But dropping it alone would leave `carried` with no due date — which `settle`
    // skips and `itemPasses` counts as a pass, so the day would stay green for ever.
    localStorage.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify(entry('2026-08-17', { coding: { status: 'carried', dueOn: 'tomorrow' } })),
    );

    expect(getDay('2026-08-17')?.coding).toEqual({ status: 'expired' });
    expect(gradeDay(getDay('2026-08-17'))).not.toBe('green');
  });

  test('the same is true when dueOn is missing entirely', () => {
    localStorage.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify(entry('2026-08-17', { coding: { status: 'carried' } })),
    );

    expect(getDay('2026-08-17')?.coding.status).toBe('expired');
  });

  test('a real dueOn survives', () => {
    writeDayRaw(entry('2026-08-17', { coding: { status: 'carried', dueOn: '2026-08-18' } }));
    expect(getDay('2026-08-17')?.coding.dueOn).toBe('2026-08-18');
  });

  test('an impossible date is dropped', () => {
    localStorage.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify(entry('2026-08-17', { coding: { status: 'carried', dueOn: '2026-02-30' } })),
    );

    expect(getDay('2026-08-17')?.coding.dueOn).toBeUndefined();
  });

  test('a date with an unreadable status reads as lapsed, not as a free slot', () => {
    // The mirror of the case above. `dueOn` is only ever written alongside a carry,
    // so a record holding one with no status to match it is a corrupted carry.
    // Falling back to `pending` would free its slot in the rolling window and put the
    // carry control back on an item that was already carried.
    localStorage.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify({
        date: '2026-08-17',
        coding: { status: 'carried ', dueOn: '2026-08-18' }, // note the trailing space
      }),
    );

    expect(getDay('2026-08-17')?.coding).toEqual({ status: 'expired' });
  });

  test('a pending item has no business holding a due date', () => {
    localStorage.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify(entry('2026-08-17', { coding: { status: 'pending', dueOn: '2026-08-18' } })),
    );

    expect(getDay('2026-08-17')?.coding.status).toBe('expired');
  });

  test('a done item keeps its shape when dueOn is corrupt', () => {
    // Only `carried` is coerced. A completed carry is already a pass on its merits.
    localStorage.setItem(
      'daily:v1:day:2026-08-17',
      JSON.stringify(entry('2026-08-17', { coding: { status: 'done', dueOn: 'tomorrow' } })),
    );

    expect(getDay('2026-08-17')?.coding).toEqual({ status: 'done' });
  });
});

describe('meta survives corruption', () => {
  test('an unreadable lastSettledOn reads as never settled', () => {
    // Settlement feeds it to diffDays during App's render; a throw there is a blank
    // page on every launch.
    localStorage.setItem(
      'daily:v1:meta',
      JSON.stringify({ schema: 1, lastSettledOn: 'nonsense', lastExportAt: null }),
    );

    expect(getMeta().lastSettledOn).toBeNull();
  });

  test('a real lastSettledOn survives', () => {
    saveMeta({ schema: 1, lastSettledOn: '2026-08-17', lastExportAt: null });
    expect(getMeta().lastSettledOn).toBe('2026-08-17');
  });

  test('an unreadable lastExportAt reads as never exported', () => {
    // Date arithmetic on it yields NaN, and NaN >= 30 is false — so an unreadable
    // value would switch the backup reminder off for ever, silently.
    localStorage.setItem(
      'daily:v1:meta',
      JSON.stringify({ schema: 1, lastSettledOn: null, lastExportAt: 'whenever' }),
    );

    expect(getMeta().lastExportAt).toBeNull();
  });

  test('a real lastExportAt survives', () => {
    markExported(NOW);
    expect(getMeta().lastExportAt).toBe(NOW.toISOString());
  });
});

describe('export leaves corrupt keys behind', () => {
  test('a day key that is not a date is not copied into the backup', () => {
    // Otherwise every future restore reports an unexplained permanent "1 skipped".
    localStorage.setItem('daily:v1:day:nonsense', JSON.stringify(entry('nonsense')));
    saveDay('2026-08-17', entry('2026-08-17'), NOW);

    const doc = JSON.parse(exportAll(NOW));
    expect(Object.keys(doc.days)).toEqual(['2026-08-17']);
  });
});

describe('import rejects bad input without losing data', () => {
  test('invalid JSON reports an error and changes nothing', () => {
    saveDay('2026-08-17', perfect('2026-08-17'), NOW);
    const result = importAll('{not json');

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(getDay('2026-08-17')).not.toBeNull();
  });

  test('valid JSON that is not an export is rejected', () => {
    const result = importAll(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
  });

  test('a malformed day inside a valid document is skipped, not fatal', () => {
    const doc = JSON.stringify({
      schema: 1,
      days: { '2026-08-17': 'not an entry', '2026-08-18': entry('2026-08-18') },
      reviews: {},
    });
    const result = importAll(doc);
    expect(result).toMatchObject({ added: 1, skipped: 1, ok: true });
    expect(getDay('2026-08-18')).not.toBeNull();
  });
});

describe('quota', () => {
  test('a full device throws StorageFullError rather than failing silently', () => {
    store.failNextWrite = 'quota';
    expect(() => saveDay('2026-08-17', perfect('2026-08-17'), NOW)).toThrow(StorageFullError);
  });
});
