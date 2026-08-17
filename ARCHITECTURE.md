# Architecture — daily

How the app is built. [`SPEC.md`](SPEC.md) is the authority on *behaviour*; this document is the
authority on *structure*. Where they disagree, SPEC.md wins and this file is wrong and must be
fixed.

Scope: single user, no backend, no auth, no network at runtime. Everything below is client-side.

---

## 1. Resolved decisions

SPEC.md §12 lists eight open questions. All eight are now resolved. SPEC.md is left untouched as
the original brief; the answers live here.

| # | Question | Resolution |
|---|---|---|
| 1 | Repo name | **`daily`**. Base path `/daily/`, site at `https://<github-username>.github.io/daily/`. See [`DEPLOYMENT.md`](DEPLOYMENT.md). |
| 2 | Carry expiry trigger | **Lazy, on app open.** A settlement pass runs once per session at startup. A day's colour can change between two openings; this is expected and correct. No background process, no timers. |
| 3 | Rolling 7-day carry window | **The 7 calendar days ending today, inclusive**, anchored on the date the carry is *created*. Carrying on 2026-08-17 counts carries created 2026-08-11 through 2026-08-17. |
| 4 | Sunday path to its own entry | **Review first, entry below.** Sunday opens on the weekly review with a persistent, always-visible link to today's entry. One tap, no state lost, and the review cannot be silently skipped. |
| 5 | Year overview | **In scope. Heatmap only.** 365/366 cells, green/amber/red/blank, click a month to open that month's view. No new aggregation — it reuses grades already computed. Nothing else on the screen. |
| 6 | Day boundary | **Local midnight.** `new Date()` in the device's timezone. No timezone handling, no UTC normalisation, no DST logic. |
| 7 | Edit lock vs. expiry | **The 7-day lock applies to user edits only.** System-driven carry expiry writes to days of any age. The lock is a UI-level guard, not a storage-level one; `storage.saveDay` never refuses a write. |
| 8 | English and carry | **English cannot be carried.** Recorded for completeness; no code required. |

---

## 2. Module map

```
daily/
  index.html              apple-touch-icon link lives here (iOS ignores parts of the manifest)
  vite.config.ts          base: '/daily/' + PWA manifest
  .github/workflows/deploy.yml
  public/
    apple-touch-icon.png  180×180
    icon-192.png  icon-512.png  icon-maskable-512.png
  src/
    main.tsx              mount, service-worker registration prompt
    App.tsx               view switch, startup settlement, focused date
    types.ts              every shared type; no logic
    grading.ts            pure — entry -> green | amber | red | null
    carry.ts              pure — eligibility, window counting, expiry settlement
    dates.ts              pure — ISO date keys, week ranges, weekday/weekend shape
    storage.ts            the only module that touches localStorage
    views/
      Today.tsx
      Month.tsx
      Year.tsx
      WeeklyReview.tsx
      Settings.tsx        export / import
    components/
      PhoneControl.tsx    three states, never a checkbox
      SlotControl.tsx     11:00 primary, 3:00 visually subordinate
      ChoiceControl.tsx   coding vs cert
      BinaryControl.tsx   office target
      EnglishGroup.tsx    three sub-checks, shown as n/3
      UrgeInput.tsx       blank is a real value
      CarryControl.tsx    hidden or disabled, never both-and-neither
      CarriedInBanner.tsx items carried from yesterday
      Heatmap.tsx         shared by Month and Year
      ItemRateBar.tsx
      UrgeChart.tsx
      ExportReminder.tsx  monthly banner
```

### The layering rule

```
dates.ts ──┐
           ├──> grading.ts ──┐
types.ts ──┤                 ├──> views/ ──> components/
           ├──> carry.ts ────┤
           └──> storage.ts ──┘
```

- `types.ts`, `dates.ts`, `grading.ts`, `carry.ts` import **no React and no storage**. They are
  plain functions over plain data, and they are where the rules actually live.
- `storage.ts` is the only module that names `localStorage`. No component, view, or hook touches
  it directly.
- Views own state and effects. Components are presentational and take props.

The reason for the split is that every load-bearing rule in SPEC.md — grading, carry limits,
expiry, day shape — is testable without rendering anything. If a rule can only be verified by
clicking, it will eventually be broken by a refactor.

---

## 3. Data model

```ts
// types.ts

export type ISODate    = string;  // 'YYYY-MM-DD', local calendar date
export type YearMonth  = string;  // 'YYYY-MM'
export type ISOWeek    = string;  // 'YYYY-Www', ISO week, weeks end Sunday

export type PhoneState = 'clean' | 'slip' | 'lost';
export type Slot       = '11:00' | '15:00';
export type CodeChoice = 'coding' | 'cert';
export type Grade      = 'green' | 'amber' | 'red';

export type DoingItemId = 'systemDesign' | 'coding' | 'office';

/** Status of one doing item on one day. */
export type ItemStatus =
  | 'pending'    // not answered yet
  | 'done'
  | 'missed'
  | 'carried'    // deferred to the next day; grade is provisional
  | 'expired';   // carry lapsed unfinished; counts as missed, permanently

export interface ItemState {
  status: ItemStatus;
  /** Set when this item was carried; the day it must be completed on. */
  dueOn?: ISODate;
}

export interface SystemDesignState extends ItemState {
  slot?: Slot;          // present only when status === 'done'
}

export interface CodingState extends ItemState {
  choice?: CodeChoice;  // present only when status === 'done'
}

export interface EnglishState {
  standup: boolean;     // note written out before speaking
  rewrite: boolean;     // one message cut 30% shorter
  drill:   boolean;     // sentence architecture, 10 min
}

export interface DayEntry {
  schema: 1;
  date: ISODate;
  phone: PhoneState | null;         // null = not answered
  systemDesign: SystemDesignState;
  coding: CodingState;
  office: ItemState;                // ignored entirely on weekends
  english: EnglishState;
  urges: number | null;             // null = deliberately blank, NOT zero
  note: string;                     // '' when unused
  updatedAt: string;                // ISO timestamp, for import conflict resolution
}

export interface WeeklyReview {
  week: ISOWeek;
  change: string;                   // "what change are you making next week?"
  updatedAt: string;
}
```

### Three decisions worth defending

**Carry lives on the origin day, not on both days.** When system design is carried from the 16th
to the 17th, exactly one thing is written: the 16th's `systemDesign` becomes
`{ status: 'carried', dueOn: '2026-08-17' }`. The 17th stores nothing about it. The "carried from
16 Aug" banner on the 17th is *derived* by reading the previous day's entry at render time.

The alternative — writing a `carriedIn` array onto the 17th as well — means two records of one
fact, which can disagree after an import, a clock change, or a partial write. One source of truth
costs one extra `getDay` call per render.

**Completing a carried item credits the origin day only.** Doing the carried system-design block
on the 17th flips the *16th* from `carried` to `done`. The 17th still has its own system-design
requirement, unaffected. The carry buys back yesterday's grade; it does not discharge today's
work. This is what makes *"Do it today or take the miss"* mean something.

**`urges: null` is not `0`.** Blank means "not recorded"; zero means "recorded, and it was zero" —
a genuinely good day. They must stay distinct in storage, in the chart (blank = gap in the line,
zero = a point at zero), and in every average (blank days are excluded from the denominator; zero
days are included). `??`, `||`, and `Number(x)` on this field are all bugs.

---

## 4. Storage

### Keys

| Key | Value |
|---|---|
| `daily:v1:day:YYYY-MM-DD` | one `DayEntry` |
| `daily:v1:review:YYYY-Www` | one `WeeklyReview` |
| `daily:v1:meta` | `{ schema, lastSettledOn, lastExportAt }` |

One key per day rather than one blob for everything. A day's save writes ~300 bytes instead of
rewriting the whole history, month reads are 28–31 cheap `getItem` calls, and a single corrupted
value costs one day rather than the archive. A year of entries is well under 1 MB either way.

### API

The five functions SPEC.md §9 fixes:

```ts
getDay(date: ISODate): DayEntry | null
saveDay(date: ISODate, entry: DayEntry): void
getMonth(ym: YearMonth): (DayEntry | null)[]   // index 0 = the 1st
exportAll(): string                             // pretty-printed JSON
importAll(json: string): ImportResult
```

Extended, per CLAUDE.md's "extend only with a clear reason":

```ts
getReview(week) / saveReview(week, r)      // a review is not a DayEntry and cannot use saveDay
getAllReviews(): WeeklyReview[]            // review history, newest week first
getRange(from, to): (DayEntry | null)[]    // a 7-day window that straddles month boundaries
getMeta() / saveMeta(m)                    // export-reminder + settlement bookkeeping
markExported(now): void                    // drives the monthly reminder banner
writeDayRaw(entry): void                   // write without re-stamping updatedAt
```

`getRange` is the one that most earns its place: the rolling carry window and the weekly review
both need "the last N days" and both routinely cross a month boundary, which `getMonth` cannot
answer without the caller stitching two months together — exactly the kind of logic that must not
live in a component. It returns a **nullable slot per date**, like `getMonth`, so results stay
index-aligned with their dates; `urgeSeries` depends on that alignment.

`writeDayRaw` exists because `saveDay` stamps `updatedAt` on every write, and two callers must
not re-stamp: **import**, where the timestamp is the very thing being compared, and **settlement**,
which is not a user edit. Keeping them as separate functions means the ordinary save path can
never forget to stamp, and the two exceptions have to be deliberate.

### Reads, writes, and failure

- Every read is validated and defensive. A malformed or unparseable value is treated as `null`
  (day absent), never thrown into the UI. A missing day is a blank cell, not an error state.
- Writes are synchronous and immediate — no debounce, no autosave timer. The app is open for
  ninety seconds; a dropped write is worse than a redundant one.
- `QuotaExceededError` surfaces as a visible, non-dismissable message telling the user to export.
  It is the only storage error the user ever sees.
- `schema: 1` is stamped on every record. A future migration reads the field and rewrites; there
  is no migration code today, only the field to hang one on.

### Export / import

- `exportAll()` returns every key under `daily:v1:` as one JSON document with a `schema` and an
  `exportedAt`.
- `importAll(json)` is **merge, not replace**, resolved per record by `updatedAt` (newest wins).
  It returns a summary — records added, records updated, records skipped — and shows it before
  anything is committed. A restore onto a device that has been used since the export must not
  silently discard the newer entries.
- The monthly export banner reads `meta.lastExportAt`. It appears after 30 days, is dismissable
  for the session, and is the one piece of nagging the app is allowed. It exists because iOS can
  evict site data.

---

## 5. Grading

`grading.ts`, pure, no dependencies beyond `types.ts` and `dates.ts`.

```ts
gradeDay(entry: DayEntry | null): Grade | null
```

- Returns `null` when there is no entry at all — a blank heatmap cell. Future dates are always
  `null`.
- **Core four only:** phone, system design, coding/cert, office target. English is never an input.
- A pass is: phone `clean` or `slip`; a doing item with status `done` or `carried`.
- `carried` counting as a provisional pass is what makes expiry a *retroactive downgrade* rather
  than a no-op. `expired` and `missed` are both failures. `pending` is a failure.
- Weekdays (Mon–Fri): 4 items. `green` = 4, `amber` = 3, `red` ≤ 2.
- Weekends (Sat–Sun): office target is dropped entirely — not counted, not shown as failed, not
  rendered. 3 items. `green` = 3, `amber` = 2, `red` ≤ 1.

No weights, no partial credit, no fourth grade, no configuration.

Also in `grading.ts`, because they are the same pure-aggregation shape:

```ts
itemRates(days)   // per-item completion rate for the month view
slotSplit(days)   // 11:00 vs 3:00 count for system design
englishRate(days) // sub-checks completed / sub-checks applicable
urgeSeries(days)  // (ISODate, number | null)[] plus a 7-day trailing average that skips nulls
gradeCounts(days) // green / amber / red totals and % green
streak(days)      // consecutive non-red days ending today; display only, never red, never a warning
```

---

## 6. Carry

`carry.ts`, pure. Takes the days it needs as arguments; it never reads storage itself.

```ts
canCarry(item: DoingItemId, entry: DayEntry, window: DayEntry[]): CarryVerdict

type CarryVerdict =
  | { kind: 'allowed' }
  | { kind: 'hidden' }                    // already carried — do not render the control
  | { kind: 'disabled'; message: string } // window full — render disabled with this exact text
```

Three states, not two, and the distinction is required by SPEC.md §4:

- **hidden** — the item's status is already `carried`. An item cannot be carried twice, and the
  control is *removed*, not greyed out. A disabled control invites a second attempt; an absent one
  closes the question.
- **disabled** — two carries already exist in the rolling window. The control renders, disabled,
  with exactly: `Two carries this week already. Do it today or take the miss.` This string is a
  constant in `carry.ts`, is asserted in a test, and is never reworded, truncated, or softened.
- Phone is not a `DoingItemId`. It is unrepresentable in this API, which is the strongest form the
  "phone can never be carried" rule can take.

### The window

`carriesInWindow(window, today)` counts records with status `carried` or `expired` whose creation
date falls in the 7 calendar days ending today, inclusive. `expired` carries still count — a carry
that lapsed consumed a slot; letting expiry free the slot back up would reward failing.

**A completed carry stops counting, and that is deliberate.** Finishing a carried item sets its
status to `done`, which drops it out of this count and frees the slot — so more than two carries
in a week are possible provided every one of them lands. Decided 2026-08-17, after the behaviour
was flagged during phase 4: what the cap is there to prevent is a *backlog*, not deferral as such.
Two unfinished carries means two things are already owed, and a third is how a bad week becomes an
unrecoverable one. Someone who defers and then actually does the work has not accumulated
anything.

The stricter reading — every carry consumes a slot for seven days regardless of outcome — was
considered and rejected. Do not "fix" this by counting `done` records with a `dueOn`; it is a
decision, not an oversight, and changing it needs the same approval as any other hard limit.

### Settlement

```ts
settle(days: DayEntry[], today: ISODate): DayEntry[]   // returns only the entries that changed
```

Run once at app startup, from `App.tsx`, before the first render of any view:

1. Read `meta.lastSettledOn`. Read every day from that date (or 14 days back on first run) to today.
2. For each entry with status `carried` and `dueOn < today`: set status to `expired`. That's it —
   the day's grade recomputes from status on the next render, so the downgrade needs no separate
   write path.
3. Write back only changed entries. Set `meta.lastSettledOn = today`.

Expiry offers **no undo, dismiss, snooze, or confirmation**, and no toast announcing it. The user
sees a day that was amber turn red in the month view. That is the entire feedback mechanism, and
it is deliberate: an interaction to acknowledge expiry is an interaction that can be gamed.

Settlement writes to days of any age, ignoring the 7-day edit lock (§1, question 7). The lock
guards the UI's editing controls; it is not enforced in `storage.ts`.

---

## 7. Views and state

No router — but not for the reason SPEC.md §9 gives.

That section rules a router out because of GitHub Pages subpath problems. **That reason is wrong
and is superseded here:** react-router takes a `basename` in one line, `HashRouter` sidesteps the
question entirely, and phase 0 verified the base path works against a live iOS install.

The reason that does hold is the display mode. The app runs `standalone`, with no browser chrome
and no back button, so URL-based navigation buys nothing it can use: deep links can't be shared
(sharing is an anti-feature), history can't be navigated without a back button, and state isn't
restored either way because iOS relaunches at `start_url`. Three views and no server is what
`useState` is for.

`App.tsx` holds all navigation state:

```ts
type View = 'today' | 'month' | 'year' | 'review' | 'settings';

const [view, setView]       = useState<View>(initialView());  // 'review' on Sunday, else 'today'
const [focused, setFocused] = useState<ISODate>(todayISO());  // the day Today.tsx is showing
const [ym, setYm]           = useState<YearMonth>(...);       // the month Month.tsx is showing
```

Flow:

- **Today** is the default screen every day except Sunday. `focused` is normally today; clicking a
  heatmap cell sets `focused` to that date and switches to `today`.
- **Sunday** opens on **review**, with a persistent "Today's entry" link that switches to `today`
  without unmounting anything the user typed. The review's text field saves on blur, so the link
  can never lose an answer.
- **Month** is one click from Today. **Year** is one click from Month, and clicking a month in the
  year heatmap returns to Month with `ym` set.
- **Settings** holds export, import, and the storage caveats. It is reachable from Month, not
  from Today — nothing competes with the ninety-second flow.

Back navigation is an explicit control in the app, not browser history. There is no `history.pushState`,
no hash, no `popstate` listener.

### The edit lock

`Today.tsx` renders read-only when `focused` is more than 7 days before today. Controls are
displayed with their recorded values and no affordance to change them — not disabled inputs, which
read as broken. A single line states that days older than 7 days can't be edited. Future dates are
also read-only.

---

## 8. Styling

Tailwind v4, configured in CSS (`@import "tailwindcss"` plus `@theme`), not `tailwind.config.js`.

- **Green, amber, and red are the only saturated colours in the app, and they appear only in the
  heatmap.** Nowhere else. Not on item rows, not on buttons, not on the streak, not on the urge
  chart, not as a status dot. Everything else is neutral. This is what makes the heatmap
  legible at a glance — the grades carry all the signal because nothing else competes for it.
- Grade colours are three `@theme` tokens and are referenced only from `Heatmap.tsx`.
- Colour is never the sole carrier of meaning: heatmap cells carry an accessible label, and the
  month view's counts state the same information as text.
- No card grids, no progress rings, no decorative charts, no shadows-as-decoration.
- Tap targets ≥ 44px. No dropdowns and no date pickers anywhere in the daily flow.
- `prefers-reduced-motion` is respected globally — under it, transitions are removed, not shortened.
- Focus rings are visible and never removed.

The 3:00 PM control is the one place where visual hierarchy is *behaviour*, not taste: 11:00 is a
full-width primary control; 3:00 is smaller, lower-contrast, secondary, and positioned beneath it.
They must never be rendered as a two-up pair of equal buttons, in any viewport, at any breakpoint.

---

## 9. PWA

- `vite-plugin-pwa` with `registerType: 'prompt'`. Never `autoUpdate` — it can swap the app
  mid-entry, and the app is only ever open mid-entry.
- The update prompt is a single unobtrusive line with a "Reload" action. Dismissing it is fine;
  it reappears next launch.
- `base`, `start_url`, and `scope` must all agree on `/daily/`. Every detail, every failure mode,
  and the verification checklist live in [`DEPLOYMENT.md`](DEPLOYMENT.md).
- The app is fully functional offline after first load. There is no network call at runtime — not
  for fonts, not for analytics, not for anything.

---

## 10. Testing

Vitest for the pure modules. `grading.ts`, `carry.ts`, and `dates.ts` are covered directly, with
no React and no DOM.

The cases that must exist, because they are the rules most likely to be quietly broken:

- `slip` grades as a pass; `lost` does not.
- Weekend drops office target entirely — a weekend day with 3 passes is green, not amber.
- `carried` is a provisional pass; `expired` is a failure; the same entry grades differently before
  and after settlement.
- A second carry attempt on an already-carried item returns `hidden`, not `disabled`.
- The third carry in a 7-day window returns `disabled` with the exact message string.
- An `expired` carry still consumes a window slot.
- `urges: null` and `urges: 0` produce different averages and different chart series.
- Settlement writes to a 30-day-old entry despite the 7-day edit lock.
- Round-tripping `exportAll` → `importAll` is lossless, and import merges by `updatedAt` rather
  than clobbering.

Storage tests run against a `localStorage` stub. Component tests are not planned; if the domain
logic is right, the components are thin enough to verify by opening the app.

Vitest, `*.test.ts` beside the module it covers. Test names state the rule —
`'slip caught counts as a pass'`, not `'grading test 3'`. No network in tests, ever; there is no
network in the app.

---

## 11. Conventions

Only what isn't already stated elsewhere. The invariants live in `CLAUDE.md`; git and commit rules
live there too.

**General**

- Match the file you're editing over any preference here.
- Delete code rather than commenting it out. No `TODO` comments — do it, or write it into
  `IMPLEMENTATION_PHASES.md`.
- Runtime dependencies are SPEC.md §9's list plus **`date-fns`**, which is used for exactly one
  thing: `weekKey`'s ISO week-year calculation in `dates.ts`. The boundaries there are genuinely
  easy to get confidently wrong (2027-01-01 is 2026-W53), and a hand-rolled version is only as
  correct as the author's understanding of the spec. The rest of `dates.ts` stays hand-rolled.
- **No chart library.** Considered and declined on balance, not on size — the two charts are a
  line with gaps and four bars, roughly forty lines of SVG, and hand-rolling keeps exact control
  over the null-versus-zero gap rendering, which carries a real rule. Bundle weight was not the
  deciding factor; a charting dependency would be precached and paid for once.
- No state manager, no UI kit, no router (§7).

**TypeScript**

- `strict: true` plus `noUncheckedIndexedAccess` — `getMonth` returns a sparse array and the
  compiler should say so.
- No `any`. No non-null `!` on anything read from storage; a parsed record is `unknown` until
  validated. `as` only to narrow validated `unknown`.
- Union literals over enums and over booleans. `PhoneState` is three strings; a `wasClean` plus a
  `wasSlip` boolean is two bugs waiting to disagree.
- Explicit return types on exported functions. Locals infer.
- **Never `??` or `||` on `urges`** — every coalescing operator on that field destroys the
  blank/zero distinction silently. Test for `null` explicitly.
- Dates are `ISODate` strings everywhere except inside `dates.ts`. `Date` objects don't cross
  module boundaries — they carry a time and a timezone nothing else wants.

**Purity** (`types` / `dates` / `grading` / `carry`)

- They never read the clock. `todayISO()` is called by the caller and passed in — a function that
  reads `Date.now()` internally can't be tested against a Tuesday, a leap day, or an expired carry.
- They never mutate their arguments. `settle()` returns changed entries; it doesn't edit the array
  it was given.
- No throwing for control flow. `canCarry` returns a verdict; it doesn't throw when a carry is
  disallowed.

**React**

- Function components, named exports, one per file, filename matches the component. Props are a
  named `interface` directly above it.
- `useEffect` only for genuine synchronisation — service-worker registration and the startup
  settlement pass. Derived values are computed during render, never stored in state and synced.
- `onThing` for props, `handleThing` for implementations.
- No `React.memo`, `useMemo`, or `useCallback` without a measured reason. A month is 31 cells.
- Keys are the ISO date, never the array index.

**Styling**

- Tailwind utilities inline. No `@apply`, no CSS modules, no styled-components.
- Group long class lists consistently: layout → spacing → typography → colour → state. If a list is
  unreadable, the component is doing too much.

**Copy** — the user-facing strings are part of the product, not decoration.

- Never congratulate, never warn, never encourage. No exclamation marks, no emoji, no "Great job",
  no "your streak is at risk". The app reports; it does not coach.
- The weekly review names the failing item directly: *"Coding was missed 3 days this week."* Not
  "consider reviewing coding".
- Plain language for errors, and only for errors the user can act on — storage full, import failed.
