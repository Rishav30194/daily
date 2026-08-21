// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { addDays, todayISO } from '../dates';
import { getDay, writeDayRaw } from '../storage';
import { entry, installStorage, perfect } from '../testing';
import { Settings } from './Settings';

/**
 * Settings is where the two irreversible operations live — a merge that cannot be
 * undone and an expiry pass that cannot be undone — so its wiring is worth testing
 * even though the rules underneath it are already covered.
 */

beforeEach(() => {
  installStorage();
});

afterEach(cleanup);

const noop = () => {};

/** A backup holding one very old day whose carry lapsed months ago. */
function backup(day: string) {
  return JSON.stringify({
    schema: 2,
    exportedAt: new Date().toISOString(),
    days: { [day]: perfect(day, { cert: { status: 'carried', dueOn: addDays(day, 1) } }) },
    reviews: {},
  });
}

/** Drives the real file input, since the two-step confirm is the thing under test. */
async function choose(json: string) {
  const input = document.querySelector('input[type=file]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');

  const file = new File([json], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);

  // `choose` reads the file asynchronously before the preview can render.
  return screen.findByText(/Nothing has been written yet/);
}

describe('import', () => {
  test('shows the counts and writes nothing until confirmed', async () => {
    const old = addDays(todayISO(), -120);
    render(<Settings onBack={noop} />);

    await choose(backup(old));

    expect(screen.getByText(/1 added/)).toBeTruthy();
    expect(getDay(old)).toBeNull(); // still nothing committed
  });

  test('expires a restored carry that lapsed long ago', async () => {
    // Startup settlement only reaches back 14 days, so a restored backup has to be
    // settled on arrival or its carries score as passes for ever.
    const old = addDays(todayISO(), -120);
    render(<Settings onBack={noop} />);

    await choose(backup(old));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(getDay(old)?.cert.status).toBe('expired');
    expect(screen.getByText(/Imported\./)).toBeTruthy();
  });

  test('does not expire a carry that is still live', async () => {
    // The regression this exists for: Settings once settled against the app's
    // *focused* day, which follows whatever heatmap cell was last tapped and can be
    // in the future. That expired carries which had not lapsed, and expiry has no
    // undo.
    const today = todayISO();
    const live = entry(today, { cert: { status: 'carried', dueOn: addDays(today, 1) } });
    writeDayRaw(live);

    render(<Settings onBack={noop} />);
    await choose(backup(addDays(today, -120)));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(getDay(today)?.cert.status).toBe('carried');
  });

  test('a file that is not an export is refused before the confirm step', async () => {
    render(<Settings onBack={noop} />);

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['{"nope":true}'], 'x.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText(/not a daily export/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });

  test('cancel leaves everything alone', async () => {
    const old = addDays(todayISO(), -120);
    render(<Settings onBack={noop} />);

    await choose(backup(old));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(getDay(old)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });
});

describe('the storage caveats are in the app, not only the README', () => {
  test('states that there is no sync and that iOS can clear the data', () => {
    render(<Settings onBack={noop} />);

    expect(screen.getByText(/no sync and no account/)).toBeTruthy();
    expect(screen.getByText(/iOS can clear site data/)).toBeTruthy();
  });
});
