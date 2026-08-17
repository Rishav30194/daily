# Daily — a personal discipline tracker

**Status:** specification only. No code written yet.
**Source:** this document is the complete, authoritative capture of the original brief. Nothing in it is a summary — where the brief gave a reason for a rule, the reason is preserved, because the reasons are what stop the rules from being "simplified" away later.

A local, single-user app. One screen per day, four core checks, one number, a month view. Nothing else.

---

## 1. Purpose

The user is a backend engineer breaking a short-form video habit while building three study habits. He needs a single daily artifact that answers:

> *did I hold the line today, and which thing is breaking?*

This is **not a task manager**. There are no projects, subtasks, tags, priorities, or due dates. The item list is fixed and defined below. Do not build a way to add arbitrary tasks — an open-ended list is how this becomes a second thing to manage instead of a mirror.

---

## 2. The daily items

### 2.1 Core four — these determine the day's grade

#### 1. Phone — three states, not a checkbox

| State | Meaning |
|---|---|
| `Clean` | no feed video at all |
| `Slip caught` | opened it, stopped within about a minute |
| `Lost` | a real session |

`Slip caught` counts as a **pass**.

This is deliberate: stopping mid-scroll is the skill being trained, and grading it as failure is what turns one slip into a lost day.

#### 2. System design — 45 min, during the workday

Two fixed slots:

- **11:00 AM — default.** This is where it's meant to happen.
- **3:00 PM — fallback only.** For days when 11:00 genuinely wasn't possible.

The app records *which slot was used*, not just whether it happened.

Two slots exist to survive an unpredictable workday, but they create a second chance to defer, so the UI **must frame 3:00 PM as a fallback rather than an equal option** — never present them as a neutral pair of buttons.

In the month view, show the **11:00 vs 3:00 split**. If 3:00 PM is winning over a month, 11:00 isn't a real slot and should be moved rather than defended.

#### 3. Coding / Claude certification — 45 min

One or the other per day, his choice. **Record which.**

#### 4. Office work target

Did he finish what he set out to do at work. Binary.

### 2.2 English — tracked, but does not grade the day

A single group with three sub-checks:

1. Standup note written out before speaking
2. One message rewritten 30% shorter
3. Sentence architecture drill (10 min, separate app)

Shown as `2/3`. Has its own completion rate in the month view. **Never affects the day's color.**

### 2.3 Urge count

One number field: how many times he wanted to open a feed today, whether or not he did. Entered from his paper log.

**Optional per day — leave blank rather than forcing a zero.** (Blank and 0 are different values and must stay different in storage and in the chart.)

This is the most important number in the app. Give it a prominent place in the month view.

### 2.4 Daily note

One line of free text. What broke, or what helped. Optional.

---

## 3. Day grading

Based on the **core four only**:

| Grade | Condition |
|---|---|
| **Green** | all 4 pass |
| **Amber** | 3 of 4 pass |
| **Red** | 2 or fewer pass |

`Slip caught` on the phone item counts as a pass. `Lost` does not.

**No other states. Do not invent partial credit or weighted scores.**

---

## 4. Carry-forward

Any of the three *doing* items (system design, coding/cert, office target) can be marked **Carry** instead of done. **The phone item can never be carried.**

Rules, enforced by the app:

- A carried item appears on the next day marked `carried from [date]`, visually distinct.
- It must be completed **that next day**. **At the end of day 2 it expires automatically and is recorded as a miss on the original day**, retroactively downgrading that day's color.
- An item **cannot be carried twice**. The Carry control is not shown on an already-carried item.
- **Maximum two carries in any rolling 7 days.** Past that, the Carry control is disabled with the message:

  > *"Two carries this week already. Do it today or take the miss."*

Expiry is **automatic and cannot be undone or dismissed**. This rule is the one most likely to be gamed, so it must not be negotiable in the UI.

---

## 5. Day shape

Not every item applies every day.

- **Weekdays** — all four core items apply.
- **Weekends** — office target does not apply; the day is graded on the remaining three (green = 3/3, amber = 2/3, red = ≤1).

Office days vary (he picks 3 of Mon–Thu each week), but that doesn't change what's tracked — **leave it out**.

---

## 6. Month view

The main screen **after** today's entry.

1. **Calendar heatmap** — one cell per day, green/amber/red/blank. Click a day to see its entry.
2. **Counts** — green / amber / red days this month, plus the percentage green.
3. **Per-item completion rate** — a small horizontal bar per item for the month. This is the diagnostic view: it tells him *which* item is failing, which day-level color cannot.
4. **Urge count line chart** — daily urge count over the month, with a 7-day average line. Expected to trend down.
5. **English rate** — one number, separate from everything above.

Plus the **11:00 vs 3:00 split** for system design (§2.1).

---

## 7. Weekly review

Every **Sunday**, the app opens to a short review screen instead of the normal day view:

- The week's grades at a glance
- The item with the most misses, **named directly**: *"Coding was missed 3 days this week."*
- One text field: *what change are you making next week?*
- Previous weeks' answers viewable in history

This mirrors the "patch the hole" rule — the point is to convert a pattern into **one concrete change**, not to reflect in general.

---

## 8. Explicit anti-features

The user is actively breaking a compulsive-checking habit. **This app must not become one.**

- **No streak shaming.** Show current streak if you like, but never in red, never with warning language, never "don't break the chain." A broken streak resets silently.
- **No notifications, badges, or reminders.** He opens it once a day, on purpose.
- **No gamification** — no points, levels, badges, confetti, or celebratory animation.
- **No social, sharing, or accounts.**
- **No infinite history browsing.** Month view and a year overview. That's the limit.
- **No editing days older than 7 days.** Retroactive cleanup is self-deception.
- **No open-ended task creation.** The item list is fixed.

---

## 9. Tech

Single user, personal use. Installed to an iPhone home screen as a PWA and opened once a day. No accounts, no auth, no backend — the only user is the person who deployed it.

### Stack

- **Vite + React + TypeScript**
- **Tailwind CSS v4**
- **vite-plugin-pwa** (Workbox) for the manifest and service worker
- **Storage: `localStorage`**, behind a typed module (`storage.ts`) exposing:
  - `getDay(date)`
  - `saveDay(date, entry)`
  - `getMonth(ym)`
  - `exportAll()`
  - `importAll(json)`

  Data is tiny — a year of entries is well under 1 MB. Keeping it behind one module means swapping in IndexedDB or a remote backend later touches one file.
- **No router.** There are three views (today, month, weekly review). Plain component state is enough, and it avoids the subpath routing problems below.
- **Deploy: GitHub Actions → GitHub Pages**, public repo, project site at `/<repo>/`.

### Configuration that must be right or the deploy silently breaks

- `vite.config.ts`: `base: '/<repo-name>/'`. Getting this wrong produces a blank page with 404s on every asset — the most common failure for Vite on Pages.
- The manifest's `start_url` and `scope` must **both** match that base path, or iOS will open the installed app in a browser tab instead of standalone.
- `display: "standalone"`, a `theme_color`, and a **180×180 `apple-touch-icon`** link in `index.html`. iOS does not read all icon sizes from the manifest.
- Actions workflow: `actions/upload-pages-artifact` + `actions/deploy-pages`, triggered on push to `main`, with `permissions: pages: write, id-token: write`.
- Service worker: register with an update prompt (`registerType: 'prompt'`). Auto-update without a prompt can swap the app mid-entry; no update mechanism at all means a stale app forever.

### Storage caveats — state these in the app's own README too

- Storage is **per-device and per-browser**. The installed PWA and the same URL in a desktop browser are separate stores. **There is no sync. This is accepted, not a bug to fix.**
- iOS can evict site data after extended non-use. Daily use makes this unlikely, but it is the reason export exists.
- **JSON export in settings, plus a monthly reminder banner to run it.** Import too, so a restore is possible.

### Entry ergonomics

Designed for thumb entry on a phone: **large tap targets, no dropdowns, no date pickers on the main flow.** Keyboard support on desktop is a nice-to-have, not a requirement.

---

## 10. Design direction

This is opened once a day for about ninety seconds. It should feel like a **logbook, not a dashboard**. Today's entry is the default screen; the month view is one click away.

- Pick a deliberate type pairing and a restrained palette.
- **Green/amber/red are the only saturated colors in the app and they appear only in the heatmap** — everything else stays neutral so the grades carry all the signal.
- Avoid card-grid dashboard styling and decorative progress rings.
- Respect `prefers-reduced-motion`, keep keyboard focus visible, work on a phone but design for desktop.

---

## 11. Definition of done

> He opens the app in the evening, fills in four states, one number, and optionally a line of text, in under ninety seconds. Once a week he sees which item is failing and writes down one fix. **Nothing else happens.**

---

## 12. Open questions for the planning session

These are gaps in the brief, not decisions. Each one changes implementation, so resolve before building.

1. **Repo name.** Drives `base`, `start_url`, and `scope`. Nothing PWA-related can be finalised until this is fixed.
2. **Carry expiry trigger.** Expiry is "automatic", but there is no background process in a local PWA. Presumed: evaluated lazily on app open by comparing dates, so a day's color can change between two openings. Needs confirming.
3. **Rolling 7-day carry window.** Counted from the date the carry was *created*, presumably against the previous 7 calendar days including today. Confirm the anchor.
4. **Sunday.** The review screen replaces the day view — but Sunday is still a tracked day (weekend shape, 3 core items). Need an explicit path from the review screen to Sunday's entry.
5. **Year overview.** Named only in the anti-features list ("month view and a year overview, that's the limit") and never specified. Confirm it is in scope and what it shows.
6. **Day boundary.** Local midnight assumed; no timezone handling.
7. **7-day edit lock vs. carry expiry.** The lock is on *user* editing; system-driven retroactive downgrade from expiry must still be allowed. Confirm the lock never blocks expiry.
8. **English sub-checks and carry.** Carry applies only to the three doing items, so English cannot be carried. Stated here for the record.
