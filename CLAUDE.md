# Claude Agent Instructions — daily

Rules for AI agents working on this repo. This file covers **how to work here**. It is not the
product spec, the architecture, or the style guide — those are separate documents and this file
does not repeat them.

## Read before touching anything

| Read | For |
|---|---|
| [`SPEC.md`](SPEC.md) | What to build. **Authority on behaviour** — where anything disagrees with it, SPEC.md wins. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How it fits together, and how to write it. Authority on structure. §1 resolves all eight of SPEC.md's open questions; §11 is the coding conventions. |
| [`IMPLEMENTATION_PHASES.md`](IMPLEMENTATION_PHASES.md) | What to build next, and when the current phase is actually done. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Anything touching `base`, the manifest, or the workflow. |

Read the ones relevant to the task, then only the source files the task needs. Do not scan the
repo.

**Current state: documentation complete, no code yet.** Phase 0 in `IMPLEMENTATION_PHASES.md` is
the next thing.

---

## The one thing to understand

This app exists to answer one question: *did I hold the line today, and which thing is breaking?*

Every rule that looks arbitrary is load-bearing, because **the user is the failure mode**.
`Slip caught` counting as a pass, 3:00 PM being visually subordinate to 11:00 AM, carry expiry
being undismissable, the 7-day edit lock — these are not UX preferences. They are the product.

So: do not soften, generalise, or make them configurable, and do not "improve" them by adding
options. **If a rule seems wrong, say so and stop. Do not quietly reinterpret it.**

---

## Hard limits

Violating any of these needs explicit approval, asked for in advance and answered.

**Grading** — core four only (phone, system design, coding/cert, office target). Green = all pass,
amber = 3 of 4, red = ≤2; weekends drop office target (3/3, 2/3, ≤1). `Slip caught` is a pass,
`Lost` is not. No partial credit, no weights, no other grade states. English **never** affects the
day's colour.

**Items** — the list is fixed. No UI for creating, renaming, hiding, or reordering. Phone has three
states, never a checkbox. System design records *which slot*. Coding/cert records *which one*.
3:00 PM is never rendered as an equal sibling of 11:00 AM.

**Carry** — only the three doing items; phone can never be carried. An item cannot be carried
twice: **hide** the control, do not disable it. Max two per rolling 7 days, past which the control
is **disabled** with the exact string
`Two carries this week already. Do it today or take the miss.`
Expiry is automatic, retroactive on the original day, and offers no undo, dismiss, snooze, or
confirmation.

**Data** — urge count is optional, and blank and `0` are distinct values in storage, in the chart,
and in every average. Never coerce blank to zero. All persistence goes through `storage.ts`; no
component touches `localStorage`.

**Colour** — green/amber/red are the only saturated colours in the app, and only in the heatmap.
Everything else is neutral. Do not colour-code item rows.

**Service worker** — `registerType: 'prompt'`. Never `autoUpdate`; it can swap the app mid-entry.

**No router.** Three views via component state.

SPEC.md §9 justifies this by GitHub Pages subpath problems. That reason does not hold — a router
handles a subpath with one `basename`, and phase 0 proved the base path works. The real reason is
that **the app runs standalone, where there is no browser chrome and no back button**: URLs buy
deep links that can't be shared (sharing is an anti-feature), history that can't be navigated, and
no restoration benefit, since iOS relaunches at `start_url` either way. Three views behind
`useState` is the right size for that. Overruling this needs approval like any other hard limit.

### Anti-features — never added, including "just a small one"

Notifications, badges, reminders, or push. Points, levels, streak pressure, confetti, celebratory
animation, or any gamification — a streak may be shown, but never in red and never with warning
language. Accounts, auth, social, or sharing. History beyond month and year. Editing days older
than 7 days.

An agent proposing any of these has misread the project. The correct response to "wouldn't a
reminder help?" is no.

---

## Working agreement

- **Present a short plan (files, approach, trade-offs) and wait for approval before writing code.**
- Work one phase at a time, in the order in `IMPLEMENTATION_PHASES.md`. Meet a phase's exit
  criteria before starting the next.
- Branch `feature/` `fix/` `chore/`. Never commit to `main` directly. Do not push unless asked.
- Commit messages: short imperative sentence, no period.
- Match existing style once code exists. No speculative abstractions. Comments explain *why*.
- When a rule is enforced in code, the code says why — those comments are load-bearing and are not
  cleanup targets.

## Requires explicit approval

- Anything in **Hard limits** above
- Deleting or renaming files
- Changing `package.json`, `vite.config.ts`, or `.github/workflows/`
- Adding any runtime dependency
- Pushing to remote or opening a PR
- Editing `SPEC.md` — it is the preserved original brief; decisions layer on top of it in
  `ARCHITECTURE.md` §1 instead
