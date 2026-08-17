# daily

A personal discipline tracker. One screen per day, four checks, one number, a month view.
Nothing else.

It answers one question: *did I hold the line today, and which thing is breaking?*

Single user, no accounts, no backend, no sync. A PWA on an iPhone home screen, opened once a day
for about ninety seconds.

> **Status: specification and planning complete. No code yet.** Build order is in
> [`IMPLEMENTATION_PHASES.md`](IMPLEMENTATION_PHASES.md).

---

## What it tracks

**Four core checks** decide the day's colour:

| Item | Recorded as |
|---|---|
| Phone | `Clean` / `Slip caught` / `Lost` — three states, not a checkbox |
| System design, 45 min | Which slot: **11:00 AM** (default) or 3:00 PM (fallback only) |
| Coding or Claude cert, 45 min | Which one was done |
| Office work target | Done or not |

`Slip caught` counts as a **pass**. Stopping mid-scroll is the skill being trained; grading it as
a failure is what turns one slip into a lost day.

**Also tracked, but never affecting the day's colour:** an English group of three sub-checks
(shown as `2/3`), an optional urge count, and one line of free text.

**The day's grade** — green = all four pass, amber = three, red = two or fewer. Weekends drop the
office target and grade on three. No partial credit, no weights, no other states.

**Carry-forward** — any of the three doing items can be carried to the next day instead of missed.
It must be done *that* next day; at the end of day two it expires automatically and is recorded as
a miss on the original day, retroactively. An item can't be carried twice, and there's a hard cap
of two carries per rolling seven days. The phone item can never be carried.

**Month view** — a calendar heatmap, grade counts, a completion-rate bar per item (this is the
diagnostic: it says *which* item is failing, which a day colour can't), an urge-count chart with a
7-day average, the English rate, and the 11:00-vs-3:00 split. A year overview sits one click
further out.

**Weekly review** — on Sunday the app opens to the week's grades, names the item with the most
misses directly, and asks for one change for next week.

## What it will never have

No notifications, badges, or reminders. No points, levels, streaks-as-pressure, confetti, or
celebratory animation. No accounts, sync, social, or sharing. No history beyond month and year.
No editing days older than seven days. No way to add, rename, hide, or reorder items.

These aren't deferred features. The app exists to counter a compulsive-checking habit, and it must
not become one. See [`SPEC.md`](SPEC.md) §8.

---

## Stack

Vite + React + TypeScript, Tailwind v4, `vite-plugin-pwa`, `localStorage`, deployed to GitHub
Pages by GitHub Actions. No router, no state manager, no date library, no chart library, no
backend. Nothing on the network at runtime.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173/daily/  — the base path is required
npm test
npm run build
npm run preview        # serves the production build at the real base path
```

The service worker only exists in a production build. Test install, offline, and the update prompt
against `npm run preview` or the deployed site — `npm run dev` will never show them.

## Deploying

Push to `main`. GitHub Actions builds and publishes to Pages at
`https://<github-username>.github.io/daily/`.

`base`, `start_url`, and `scope` must all read `/daily/`. If they disagree the deploy fails
silently — a blank page, or an app that opens in a Safari tab instead of standalone. Full setup,
the workflow, a verification checklist, and every failure mode with its symptom are in
[`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Your data — read this part

**Storage is `localStorage`, per-device and per-browser.** The app installed on your phone and the
same URL open in a desktop browser are two separate, unrelated stores. **There is no sync.** This
is a deliberate choice, not a missing feature.

**Export regularly.** Settings has a JSON export, and the app shows a reminder banner every 30
days. Import is there too, so a restore works.

Data is lost if you: delete the home-screen app, clear website data in Safari, or leave the app
unused long enough that iOS evicts it (unlikely with daily use — but it's the reason export
exists).

Export before any uninstall, reinstall, or browser data clearing. There is no server-side copy,
and nobody can recover it for you.

---

## Documentation

| File | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | The complete brief. **Authority on behaviour.** Every rule, with the reason it exists. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Modules, data model, storage schema, grading and carry engines, coding conventions. Authority on structure. |
| [`IMPLEMENTATION_PHASES.md`](IMPLEMENTATION_PHASES.md) | The ten-phase build order and each phase's exit criteria. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | GitHub Pages setup, the workflow, verification, failure modes. |
| [`CLAUDE.md`](CLAUDE.md) | Rules for AI agents working on this repo. |

Read SPEC.md first. The rules that look arbitrary are load-bearing, and it explains why.

## Definition of done

> Open the app in the evening. Fill in four states, one number, and optionally a line of text, in
> under ninety seconds. Once a week, see which item is failing and write down one fix.
> **Nothing else happens.**
