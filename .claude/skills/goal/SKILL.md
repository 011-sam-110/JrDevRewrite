---
name: goal
description: Resumable build orchestrator for the Junior Dev rewrite. Reads ROADMAP.md, builds the next milestone test-first per VSA, verifies it, updates the roadmap, and stops at a reviewable checkpoint. Use when the user says "/goal", "continue the goal", "next milestone", "build the next slice", or asks where the build is up to ("/goal status").
---

# /goal — the build loop for Junior Dev

You are the orchestrator for building this product end to end: website, features, design, and marketing. The single source of truth for *what to build next* is **`ROADMAP.md`** at the repo root. The single source of truth for *how to build it* is **CLAUDE.md** (binding spec) + the **`vertical-slice-architecture`** skill (structure) + the design-system milestone output (look & feel).

The discipline that makes this work: **one milestone per invocation, fully verified, then stop.** A long heroic run that "finishes everything" produces unreviewable drift. A sequence of small, gated, committed checkpoints produces a product. Resist the urge to start the next milestone.

## Arguments

- `/goal` (bare) — continue: resume an `[~]` in-progress milestone if one exists, otherwise start the first `[ ]` milestone whose dependencies are all `[x]`.
- `/goal status` — report progress (done / in-progress / blocked / what's next + anything in "Needs from Sampo"). **Build nothing.**
- `/goal M<n>` — build that specific milestone, but refuse politely if its dependencies aren't done (explain which, recommend the right one).
- `/goal replan` — re-derive/adjust the roadmap against CLAUDE.md and the PRD (after a spec change). Propose edits to ROADMAP.md; don't build.

## The loop (every build invocation)

1. **Load state.** Read `ROADMAP.md`. Identify the target milestone (rules above). If everything is done, say so and suggest `/goal replan`. If the target is `[!]` blocked, report exactly what's needed and stop.
2. **Mark it.** Set the milestone to `[~]` in ROADMAP.md *before* starting, so an interrupted session resumes cleanly.
3. **Read what governs it.** CLAUDE.md section(s) named by the milestone, plus the `vertical-slice-architecture` skill for any feature milestone, plus `frontend-design` / `ui-ux-pro-max` for UI-heavy ones. For AI-layer milestones, consult the `claude-api` skill — never hardcode model assumptions.
4. **Plan briefly, then build test-first.** For each capability in the milestone: pure rule in `domain/` (unit test first, every branch), then the slice (`<name>.ts`, `<name>.action.ts`, `<name>.test.ts`), then slice-local UI. Follow the VSA recipe exactly.
5. **Gate.** All of: `npm run typecheck`, `npm run lint`, `npm run test -- --run`. For milestones with UI: start the dev server, drive it with the Playwright MCP, and save screenshot evidence to `.claude/debug-shots/`. A milestone's own acceptance criteria (in ROADMAP.md) are the definition of done — verify each one explicitly.
6. **Checkpoint.** Update ROADMAP.md: status `[x]` with date + one-line note (and commit hash after committing). Append a line to the **Build log** section. Commit the milestone as one commit: `M<n>: <milestone name>` (the pre-commit gate runs typecheck + tests — never bypass it).
7. **Report and stop.** Summarize what was built, show the evidence (test counts, screenshots), note anything added to "Needs from Sampo", and name the next milestone. Do not start it.

## Rules

- **Never mark `[x]` without the gates passing and acceptance criteria demonstrably met.** If something can't be verified, the milestone isn't done — say so honestly.
- **External credentials never block a build.** Every external service (email sending, GitHub OAuth/API, Cloudflare Stream, Judge0 in prod) sits behind a mockable `infra/` adapter with a dev fallback (e.g. magic links logged to console, fake stream client). Build and test against the adapter; add the real-credential wiring task to **"Needs from Sampo"** in ROADMAP.md instead of stalling.
- **Blocked is a status, not a failure.** If a milestone genuinely can't proceed (a decision is missing, a dependency surprise), mark it `[!] blocked: <reason>`, record what's needed, and stop with a clear ask.
- **Spec conflicts stop the line.** If the roadmap, CLAUDE.md, and the PRD disagree, don't guess — surface the conflict (this is what `/goal replan` is for).
- **Teaching mode applies.** Sampo is a student: while building, explain the *why* of non-obvious choices (pattern names, trade-offs), especially the first time a pattern appears.
- **Keep the docs honest.** If a milestone resolves something marked TBD/intended in CLAUDE.md (e.g. a command that now exists), update CLAUDE.md in the same commit.

## ROADMAP.md format (parse and preserve it)

- Milestones: `### M<n>: <name>` with fields `Status`, `Depends on`, `Spec`, and a checklist of **Acceptance** criteria.
- Status values: `[ ]` todo · `[~]` in progress · `[x] done (YYYY-MM-DD, <commit>)` · `[!] blocked: <reason>`.
- Sections at the bottom: **Needs from Sampo** (credentials/decisions, with which milestone needs them) and **Build log** (one line per completed milestone: date, milestone, summary).
- When editing, change only statuses, log lines, and the needs list — scope changes to milestones go through `/goal replan`.
