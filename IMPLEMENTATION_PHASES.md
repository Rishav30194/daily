# Implementation phases — daily

Ten phases, each one independently verifiable. [`SPEC.md`](SPEC.md) is what to build,
[`ARCHITECTURE.md`](ARCHITECTURE.md) is how it fits together, this is the order.

**All ten phases are merged and deployed** (2026-08-17). The order below is now the record of how
the app was built and what each part has to keep doing, not a queue of work.

**One branch per phase.** `feature/phase-N-<slug>`, PR to `main`, never commit to `main` directly.
Do not start phase N+1 until phase N's exit criteria are met — the point of the ordering is that
each phase leaves the app in a state that can be checked, not that the work gets divided evenly.

Phases 0, 1, and 2 change build files, which needs explicit approval per CLAUDE.md. Ask once at
the start of each of those phases rather than per-file.

---

## Phase 0 — Scaffold and deploy an empty app

**Deploy before building anything.** SPEC.md §9 calls the deploy config the silent-failure zone,
and it is: the failure mode is a blank white page or an app that opens in a Safari tab instead of
standalone, and both are far cheaper to debug against a one-line page than against a finished app.

- `npm create vite@latest` — React + TypeScript.
- Tailwind v4 via `@tailwindcss/vite`, `@import "tailwindcss"` in `src/index.css`. No
  `tailwind.config.js`.
- `vite.config.ts`: `base: '/daily/'`.
- `vite-plugin-pwa`, `registerType: 'prompt'`, manifest with `start_url: '/daily/'`,
  `scope: '/daily/'`, `display: 'standalone'`, `theme_color`.
- Placeholder icons: 192, 512, maskable 512, and a 180×180 `apple-touch-icon` **linked in
  `index.html`**.
- `.github/workflows/deploy.yml` per [`DEPLOYMENT.md`](DEPLOYMENT.md). Repo Pages source set to
  **GitHub Actions**.
- Render one line of text. Nothing else.

**Exit:** the deployed URL loads on the phone, installs to the home screen, and opens **standalone
with no browser chrome**. Every item on the DEPLOYMENT.md verification checklist passes. If the
app opens in a browser tab, phase 0 is not done — that is `scope` or `start_url` disagreeing with
`base`, and it does not get cheaper to fix later.

---

## Phase 1 — The domain core

Pure TypeScript, no React, no storage, no DOM. This is where every rule in SPEC.md actually lives.

- `types.ts` — every type in ARCHITECTURE.md §3, verbatim.
- `dates.ts` — `todayISO`, `parseISO`, `addDays`, `daysInMonth`, `isWeekend`, `weekKey`,
  `weekRange`, `isWithinEditWindow`. All local-time, no UTC conversion.
- `grading.ts` — `gradeDay` plus the aggregation helpers.
- `carry.ts` — `canCarry`, `carriesInWindow`, `settle`, and the disabled message as an exported
  constant.
- Vitest, and every test listed in ARCHITECTURE.md §10 for these three modules.

Adding Vitest changes `package.json` — get approval with the phase.

**Exit:** `npm test` green, and every case in ARCHITECTURE.md §10 that doesn't involve storage is
written and passing. Not "some tests exist" — those specific cases, because they are the ones a
later refactor breaks silently.

---

## Phase 2 — Storage

- `storage.ts` — the five fixed functions plus the four extensions in ARCHITECTURE.md §4, and
  nothing else.
- Key scheme, `schema: 1` stamping, defensive reads (bad JSON reads as absent, never throws).
- `exportAll` and `importAll` with merge-by-`updatedAt` and the import summary.
- `QuotaExceededError` handling.
- Tests against a `localStorage` stub, including the export→import round trip.

**Exit:** `npm test` green. A hand-written JSON file imports, reads back identically, and
re-exports byte-identical.

---

## Phase 3 — Today's entry

The ninety-second flow. Everything except carry.

- `App.tsx` view state, `Today.tsx`, and the input components: `PhoneControl` (three states, never
  a checkbox), `SlotControl` (11:00 primary, 3:00 visually subordinate — see ARCHITECTURE.md §8),
  `ChoiceControl`, `BinaryControl`, `EnglishGroup` shown as `n/3`, `UrgeInput` where blank is a
  real value, and the one-line note.
- Weekend shape: office target is not rendered at all on Saturday and Sunday.
- Save on change, straight through `storage.ts`.
- The type pairing and neutral palette get chosen here, once, and not revisited per-phase.

**Exit:** a full day can be entered on a phone in under ninety seconds, it survives a reload, and
`urges` left blank reads back as `null` and not `0`. No colour anywhere on this screen.

---

## Phase 4 — Carry

The rules most likely to be gamed, so they go in as a unit with the UI that enforces them.

- `CarryControl` rendering `canCarry`'s three verdicts: allowed, **hidden** (already carried —
  removed from the DOM, not disabled), **disabled** with the exact message string.
- `CarriedInBanner` on the following day, derived by reading the previous day's entry — nothing
  about the carry is written to the receiving day.
- Completing a carried item writes to the **origin** day and leaves the current day's own instance
  of that item untouched.
- `settle()` wired into `App.tsx` startup, before first render, writing back only changed entries
  and updating `meta.lastSettledOn`.

**Exit:** manually set the clock forward two days with a carry outstanding — the origin day goes
amber → red on next open, with no toast, no prompt, and no way to undo it.

---

## Phase 5 — Month view

The diagnostic screen: the day colour says a day broke, this says *which item*.

- `Heatmap` (built so `Year` can reuse it), click-through to a day's entry.
- Grade counts and % green.
- Per-item completion bars.
- Urge line chart with the 7-day trailing average — blank days are a **gap in the line**, zero days
  are a **point at zero**, and blank days are excluded from the average's denominator.
- English rate, visually separate from everything above.
- The 11:00 versus 3:00 split for system design.

**Exit:** a month of hand-seeded entries renders correctly, including a month with blank days,
zero-urge days, and a retroactively expired carry.

---

## Phase 6 — Weekly review

- `WeeklyReview.tsx`, shown automatically when the app opens on a Sunday.
- The week's grades at a glance; the most-missed item named directly — *"Coding was missed 3 days
  this week."*
- One text field for next week's change, saved on blur, stored per ISO week.
- Previous weeks' answers listed beneath.
- The persistent "Today's entry" link (ARCHITECTURE.md §7), which must not lose an in-progress
  answer.

**Exit:** opening on a Sunday lands on the review; the entry link works without losing typed text;
last week's answer is visible.

---

## Phase 7 — Year overview

- `Year.tsx`: 365 or 366 cells reusing `Heatmap`, clicking a month opens `Month` for it.
- Reachable from Month only.

Heatmap only. No annual statistics, no "best month", no totals. It answers one question — how much
of the year held — and adding a second thing to it turns the outer limit of history into a
dashboard.

**Exit:** a year renders, leap years included, and a click lands on the right month.

---

## Phase 8 — Settings, export, and the edit lock

- `Settings.tsx`: export to a downloaded JSON file, import with the summary shown before commit,
  and the storage caveats from SPEC.md §9 stated in the UI, not only the README.
- The monthly export reminder banner, driven by `meta.lastExportAt`, dismissable for the session.
- The 7-day edit lock in `Today.tsx`: read-only rendering for days older than 7 days and for
  future days — values shown with no affordance to change them, not disabled inputs.
- Confirm settlement still writes past the lock.

**Exit:** export downloads, import restores onto a clean browser, a 10-day-old day cannot be
edited, and a 10-day-old carry can still expire.

---

## Phase 9 — Finish

- Real icons at all four sizes.
- `prefers-reduced-motion` audit — transitions removed under it, not shortened.
- Keyboard focus visible on every interactive element; heatmap cells labelled for screen readers.
- The service-worker update prompt verified end to end: deploy a change, confirm the prompt
  appears and reloading picks it up.
- `README.md` accurate against the built app.
- Install fresh on the phone and use it for a real day.

**Exit:** SPEC.md §11. Four states, one number, optionally a line of text, under ninety seconds,
and nothing else happens.

---

## Not in any phase

These are not deferred, they are excluded. There is no phase 10 where they arrive.

Notifications, badges, reminders (the monthly export banner is the single exception, and it is
in-app). Points, levels, confetti, celebratory animation, streak pressure of any kind. Accounts,
auth, sync, sharing. History beyond month and year. Editing days older than 7 days. Any UI for
creating, renaming, hiding, or reordering items. Settings that make an invariant configurable.
