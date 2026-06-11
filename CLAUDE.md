# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status: GREENFIELD.** This directory is an empty rewrite scaffold — no application code exists yet. This document is the **binding build spec** for the rewrite, reconciled with the product PRD (`junior-dev-prd.md`, v0.3) after the founder decision session on **2026-06-10**. Treat the conventions below as binding decisions, not suggestions. Update this file as real code lands and conventions firm up. The PRD records product *intent*; this file records what we *build*.

## What this is

**Junior Dev** — a heavily gamified competitive coding platform for **University of Sussex CS students**. Make getting good at shipping software feel like a game, and turn that activity into a credible, verifiable signal of employability. The product is built around **two competitive modes** feeding one identity surface:

1. **Prize Pools** — *asynchronous, many-player project competitions.* Students join a time-boxed pool for their job role (front-end, backend, ML, mobile, …), build a **real project** against a spec (AI-generated or operator-authored), commit to **GitHub throughout the window**, and submit the repo plus a **short demo video**. Submissions are verified by anti-cheat, then **peer-judged**: each participant watches ~30s of a small randomized set of other demos and ranks them. Rankings award XP, rank, and badges. This is **gamified as the product**, not as decoration.
2. **Live Code Battles** — *synchronous, head-to-head.* Two players are dropped into the **identical** problem at the **exact same instant**; whoever lands a fully-correct solution first wins. Codeforces-style **speed-plus-penalty** scoring, with **Elo** and **XP** on the line. In v1 battles are **XP/Elo only — no wagers** (money is Phase 2, see below).

Both modes render onto one surface:

3. **Developer Profiles** — each user's portfolio + identity surface. Win history, XP, level, badges, global rank, per-role standings, **battle Elo**, streaks, and the linked GitHub account. **Public by default** (the recruiter-facing portfolio is the thesis), with a single account-level private toggle; losses appear in aggregate stats only.

A fourth pillar is built-in, not bolted on:

4. **AI pool-generation layer** — generates pool specs tuned to job role + difficulty, reads engagement/quality signals from past pools, and improves. **Every AI-drafted spec lands in a draft state and requires operator approval before publishing** (v1 rule). Operator-authored pools come from per-role markdown dumps via an explicit import command — both sources produce the identical pool object.

Everything else from the old JrDev (sprint listings, business accounts, contracts, e-signing, the hiring marketplace) is **intentionally dropped**. Do not port it.

### Binding v1 decisions (resolved 2026-06-10 — do not relitigate casually)

- **No real money anywhere in v1.** Free pools + XP/Elo battles only. Paid pools and battle wagers ship **together** in Phase 2 behind one shared wallet/KYC/escrow/geo-gating build, after legal review. All money-related domain rules below are designed now, built later.
- **Identity:** the **Sussex email is the login** — sign-up/sign-in via verified `@sussex.ac.uk` (magic link). The domain check *is* the enrolment gate. **GitHub is a required connected account** at onboarding (read-only API access), not the login.
- **AI-assistance stance (split):** **pools allow AI tools** — the measured skill is shipping; anti-cheat polices *authenticity* (in-window work, no duplicates/plagiarism, you demo your own build). **Battles ban AI assistance** — the measured skill is raw head-to-head speed; enforced via paste-blocking, focus telemetry, and post-match heuristics.
- **Repo rule:** **fresh repo per competition**, created after the pool window opens. Anti-cheat anchors on GitHub's **server-side** signals (repo creation date, push-event timeline) — never trust local commit timestamps; they're client-set.
- **Judging:** peer ranked-voting is the **sole decider** in v1, structurally defended: randomized + anonymized judge assignment, **you must complete your judging duty to be eligible to win**, self-votes impossible by construction.
- **Rank model:** one **global pool rank** drives difficulty gating and the main ladder; **per-role leaderboards are filtered views** computed from pool results (captured per-role from day one, so true per-role ratings stay a cheap later upgrade). **Battle Elo is a separate, global rating** — XP rewards activity, Elo measures head-to-head skill.
- **Concurrency:** a user may be in **multiple pools, soft cap 3 active**.
- **Pool sizing:** **minimum 6 entrants** to run; per-pool cap from the spec (default ~30); under-filled at start → **one auto-extension (+48h)** → auto-cancel with credit refund + notification.
- **Battle entry:** **direct challenges** (username/link) are the primary path; plus a deliberately **simple queue** (pair queued players, prefer Elo proximity, widen fast) and an online-players list. Don't over-tune matchmaking for a campus-sized population.
- **Battle problem bank:** **AI-drafted, machine-verified, human-approved** — Claude drafts statement + reference solution + hidden tests; the reference solution must pass its own tests in Judge0; the operator approves before bank entry. Rotate/retire leaked problems as an operational duty.

## Engineering standards (non-negotiable)

These are the reason for the rewrite — hold the line on them.

- **Test-first.** Write the test before the implementation for domain logic. Aim for high coverage on the domain kernel; every state-machine transition (pool **and** battle), scoring rule (peer-vote aggregation, speed-plus-penalty, win/forfeit/draw resolution), XP calculation, **Elo update**, anti-cheat predicate, sizing/extension rule, and AI-generation decision must have unit tests. E2E tests cover the critical journeys: Prize Pools (join → build → submit → judge → win) **and** Battles (challenge/queue → match → solve → win).
- **Vertical Slice Architecture + pure domain kernel.** Features are slices under `src/features/`; cross-cutting rules live in a pure `src/domain/` kernel; shared I/O adapters in `src/infra/`. See the `vertical-slice-architecture` skill — it is the structural playbook for this repo. No `_legacy.py`-style god-files (the old app had a ~2200-line route monolith — the anti-pattern we're escaping). Business rules never live in route handlers or React components.
- **Typed end to end.** TypeScript everywhere, strict mode. The database schema, API contracts, and domain models share types — no untyped boundaries.
- **Pure, testable domain core.** Gamification math (XP, levels, scoring, ranking, Elo), state machines, anti-cheat predicates, and AI-generation policy are pure functions isolated from I/O, unit-testable without a DB or network.

## Working with Sampo

Sampo is a student. Explain the *why*, name the patterns and trade-offs as you apply them, and enforce best practice rather than just complying. Push back when a request conflicts with the standards above.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 15 (App Router)**, full-stack, TypeScript strict |
| Server logic | Server Actions + Route Handlers (no separate API service) |
| Database | **PostgreSQL** |
| ORM | **Drizzle** (typed SQL, migrations checked into the repo) |
| Auth | **Auth.js (NextAuth)** — magic-link email sign-in restricted to `@sussex.ac.uk`; GitHub as a *connected account* (OAuth, read-only scopes) for repo/commit data, never the login |
| GitHub data | GitHub REST/GraphQL API — repo metadata, creation date, push events. Read-only. |
| Unit/integration tests | **Vitest** |
| E2E tests | **Playwright** (also wired as an MCP for visual debugging — see `.mcp.json`) |
| AI layer | **Vercel AI SDK** with the Anthropic provider. Default models: `claude-opus-4-8` for high-stakes generation (pool specs, battle problems), `claude-sonnet-4-6` for routine/cheap calls. Consult the `claude-api` skill for current IDs/pricing. |
| Realtime (battles) | **Self-hosted WebSocket service** — separate long-running deployable for presence, match rooms, the synchronized "go" signal, live opponent progress, and the match timer. |
| Code execution / judging | **Self-hosted Judge0** (Dockerized, sandboxed) runs untrusted battle submissions against hidden test suites; multi-language. Untrusted infra — isolate, resource-cap, **network-deny**. |
| Video | **Cloudflare Stream** — direct creator uploads, automatic transcoding, signed playback URLs (only assigned judges can view a submission). |
| Payments / escrow | **Phase 2.** Provider TBD (Stripe Connect or equivalent) — held funds, refunds, KYC, per-region disablement. Nothing money-touching ships in v1. |
| Background work | Scheduled jobs (cron) for pool lifecycle transitions + AI generation, running on the container host. Matchmaking + live battle ticking run in the **realtime service**, not cron. |
| Hosting | **One container host** (Railway-class; Fly.io if more control needed) running the Next.js app (Node server), Postgres, the WebSocket service, and Judge0 — with **Cloudflare in front** (DNS/CDN/DDoS) + Cloudflare Stream. One bill, one deploy story. |

## Commands

> Scaffolded in M0. Commands marked *(M-n)* land with that milestone — keep this section accurate as scripts land in `package.json`.

```bash
npm install                 # install deps
npm run dev                 # local dev server (http://localhost:3000)
docker compose up -d db     # local Postgres (required before db:* commands)
npm run build               # production build
npm run lint                # eslint
npm run typecheck           # tsc --noEmit

npm run test                # Vitest (unit/integration) — watch by default
npm run test -- --run       # single CI-style pass
npm run test -- path/to/file.test.ts   # run one test file
npm run test:e2e            # Playwright (boots the dev server itself)

npm run db:generate         # Drizzle: generate migration from schema changes
npm run db:migrate          # apply migrations

npm run pools:import        # validate + ingest manual pool specs from content/pools/*.md
                            #   (format spec: content/pools/README.md; approval: /operator/pools)
npm run pools:tick          # execute due pool-lifecycle transitions (what the host cron runs;
                            #   safe to re-run — refunds dedupe on the credit ledger)
npm run pools:scan          # anti-cheat scan: flag duplicate/reused submissions for operator
                            #   review (host cron; safe to re-run — never re-flags reviewed work).
                            #   Review queue: /operator/flags

docker compose up judge0    # local Judge0 code-execution sandbox (untrusted code: internal-only
                            #   network, no internet, resource-capped; set JUDGE0_URL=http://localhost:2358)
npm run problems:seed       # seed the battle problem bank through the REAL pipeline (draft →
                            #   validate → verify reference solutions pass their own hidden tests
                            #   via Judge0 if up, dev local runner otherwise → approve); idempotent.
                            #   Review queue: /operator/problems

npm run dev:ws              # local realtime (WebSocket) service for battles (ws://localhost:3001;
                            #   REALTIME_PORT to change; seeds a pokeable demo room in dev; also
                            #   runs the queue-matchmaking tick and serves /healthz + the internal
                            #   battle-settled poke on the same port)
npm run db:seed             # (M5+) seed dev data (pools, profiles, badges, ratings)
```

## Architecture (target shape)

**Vertical Slice Architecture** — organize by user capability, not technical layer. The `vertical-slice-architecture` skill is the full playbook (layout, rules, recipe, review checklist); read it before adding or moving feature code. Summary:

```
src/
  app/                      # Next.js App Router — thin: routing, layouts, wiring
  features/                 # VERTICAL SLICES — one folder per user capability
    prize-pools/            #   join-pool/ submit-entry/ cast-vote/ close-pool/ import-pools/ ...
    battles/                #   send-challenge/ accept-challenge/ enter-queue/ submit-solution/ resolve-battle/ ...
    profiles/               #   view-profile/ toggle-privacy/ ...
    ai-generation/          #   generate-pool/ draft-problem/ approve-draft/ ...
  domain/                   # SHARED PURE KERNEL — imports nothing from app/db/framework
    prize-pools/            #   pool state machine, entry/sizing rules, vote aggregation
    battles/                #   match state machine, speed+penalty scoring, anti-cheat predicates
    gamification/           #   XP, levels, rank, badges, streaks, Elo (pure functions)
    ai-generation/          #   signals -> pool/problem spec policy (pure)
  infra/                    # SHARED I/O ADAPTERS (mockable) — db/ judge/ github/ video/ ai/
  realtime/                 # standalone WebSocket service (own deployable) — relays events
                            #   into slices/domain; never owns authoritative rules
  components/               # genuinely cross-feature UI primitives
  lib/                      # shared utils, types, match-event contract
content/
  pools/                    # per-job-role markdown dumps of manual pool specs (see ingestion)
tests/
  e2e/                      # Playwright journeys crossing slices
```

The `realtime/` service and Judge0 are **untrusted/transport layers**: they relay events and run code, but **authoritative state, scoring, and (later) money decisions live in `domain/` + the owning slice**. A WebSocket message or judge verdict is *input* that routes through a slice validating it against the kernel — it never directly mutates a result.

**Rule:** `domain/` imports nothing from `infra/`, `app/`, or any framework. Plain data in, plain data out. Slices depend on the kernel and `infra/`, never on each other.

## Core domain flows

### Prize Pool lifecycle (state machine — every transition needs a test)

`draft` → `published` → `building` → `judging` → `closed`, with branch exits `extended` (once) and `cancelled`.

- **`draft` → `published`** — operator approves (AI-drafted and imported manual specs both start in `draft`). Published pools are joinable: entry costs free credit, guards: role/difficulty eligibility, soft cap **3 concurrent active pools** per user.
- **`published` → `building`** — join window ends with **≥ 6 entrants** → the build window opens. Under-filled → **`extended`** (one +48h extension), still under-filled → **`cancelled`** (credits refunded, joiners notified).
- **`building` → `judging`** — window closes at the deadline. During `building`, each entrant creates a **fresh repo** (created after window open — verified server-side) and pushes regularly; submission = linked repo + demo video (~30–90s, Cloudflare Stream) before the deadline. Anti-cheat runs at submission.
- **`judging` → `closed`** — each participant judges a randomized, anonymized set (~5) of other submissions, ranking best-to-worst. Aggregate rankings finalize; **only entrants who completed judging are eligible to win**. XP, rank movement, badges awarded at close.

Transitions are **time-driven, executed by a scheduled job**, never ad hoc inside request handlers. Define states, transitions, and guards explicitly in `domain/prize-pools/` and test every edge.

**Pool spec sources (both produce the identical pool object, both land in `draft`):**
- **AI-generated** — the generation policy (pure, in `domain/ai-generation/`) decides what to create from engagement signals; the LLM call drafts content behind a mockable `infra/ai` client.
- **Manual** — markdown files in `content/pools/` (one per job role; entries delimited with YAML frontmatter: title, role, difficulty, window, requirements). `npm run pools:import` validates every entry, reports malformed ones, dedupes by slug, creates drafts.

### Live Code Battle lifecycle (state machine — every transition needs a test)

A battle is a **synchronous 1v1** over a **single problem** (best-of-N is a future extension). The authoritative state machine lives in `domain/battles/`; the realtime service only relays events into it.

`challenged`/`queued` → `matched` → `countdown` → `live` → `resolved`, with branch exits `voided`, `forfeited`, and `flagged`.

- **→ `matched`** — via an **accepted direct challenge** (primary v1 path) or the **simple queue** (pair queued players, prefer Elo proximity, widen fast). *(Phase 2: wagered matches escrow both stakes at this transition.)*
- **`matched` → `countdown`** — both clients join the WS room and signal ready within a join window; a no-show before problem reveal → `voided` (no Elo change — nothing happened).
- **`countdown` → `live`** — synchronized countdown fires the **simultaneous "go"**; the identical problem is revealed to both at the same instant; the match timer starts. **Simultaneity is a correctness property — test it.**
- **`live` → `resolved`** — either: **decisive win** — first submission passing **all** hidden tests wins at that wall-clock instant (the Judge0 verdict is authoritative; a WS "I finished" event is not); or **timeout** — scored by most hidden tests passed, tie-broken by lowest penalty-adjusted time, still equal → **draw**.
- **`live` → `forfeited`** — disconnect past the grace window, or quit → opponent wins.
- **`resolved`/`forfeited` → `flagged`** — any anti-cheat signal marks the result for review. Elo/XP apply but the result is reviewable; confirmed cheating → forfeit + Elo penalty + escalating bans. *(Phase 2: flagged staked matches automatically hold payout.)*

**Scoring — speed + penalty:** first fully-correct submission wins outright; penalty never overturns a decisive real-time win. Each rejected submission adds a fixed penalty to that player's penalty-adjusted time (the timeout tiebreaker, recorded for stats). A per-submission cooldown discourages judge-spam. Keep it pure: `(submissionHistory, timeLimit, penaltyPerWrong) -> outcome`. Unit-test decisive-win, timeout-partial, tie, and draw paths.

### Anti-cheat (layered, automatic — pure predicates over telemetry in `domain/`)

**Pools (AI tools allowed — police authenticity):**
- Fresh-repo verification: repo creation date after window open, push-event timeline shows in-window work — **GitHub server-side signals only**.
- Duplicate/reuse detection: similarity against the entrant's prior submissions and other entries.
- The demo video + peer judging are themselves authenticity checks (you demo your own build).
- Flagged submissions are excluded from results pending review.

**Battles (AI assistance banned):**
- *In-match:* paste-blocking in the editor, tab/focus-blur telemetry, submission cadence + timing capture, full submission history retained.
- *Post-match:* plagiarism diff of the winning submission against known bank solutions and the opponent's; AI-generated-code likelihood heuristics.

### Gamification (the product)

First-class, tested domain concepts — not scattered counters:

- **XP & levels** — XP-granting actions (join, submit, vote/judge, win, streak, battle participation, battle wins) and the level curve. Pure functions.
- **Global pool rank** — drives difficulty gating (higher rank unlocks harder pools) and the main ladder. **Per-role leaderboards** are filtered views from per-role results.
- **Battle Elo** — separate from XP/level. Define K-factor, expected-score formula, starting/floor rating, inactivity handling as pure functions. Drives the battle ladder and queue pairing.
- **Badges / achievements** — unlock rules as data + pure predicates (incl. battle milestones: win streaks, first blood, giant-killer upsets).
- **Streaks** — participation streaks (pools **and** battles) with explicit reset rules.
- **Seasons / ranks** — **Phase 3** (Elo soft-resets per season).

Profiles render the aggregate. **[RISK]** Maximum-dopamine design for young users needs responsible-design guardrails from day one even money-free (cool-downs, healthy-use messaging); full limits/self-exclusion arrive with money in Phase 2.

### Real-money & compliance (Phase 2 — binding constraints, build nothing yet)

Paid pools and battle wagers ship **together**, behind one shared build, only after professional legal review (skill-contest vs gambling classification, UK + per-jurisdiction). Non-negotiables when it ships: KYC + age verification (≥18) before staking/withdrawing; geo-restriction server-side; escrow via a licensed provider (stakes never raw in our DB); disclosed rake; deposit/loss limits + self-exclusion; the free path always exists. Domain rules (who is owed what on win/draw/void/forfeit) get designed and unit-tested with the rest of the kernel; the money-moving service is Phase 2. Rake %, provider, regions: **TBD — resolve before wagering ships.**

### AI generation layer (specs + problems)

Two pipelines, one pattern — **policy (pure) → draft (LLM behind mockable client) → machine-verify where possible → operator approval queue → publish**:

1. **Pool specs** — policy reads engagement signals (joins, submissions, votes, completion, per-spec satisfaction/drop-off) and decides theme/difficulty/cadence; Claude drafts title, brief, requirements; lands in `draft` for approval. Optimization targets: interesting, challenging, completable within the window.
2. **Battle problems** — Claude drafts statement + reference solution + hidden tests; the reference solution **must pass its own tests in Judge0** before the draft reaches the approval queue.

Keep decision policies unit-tested and separate from content generation. Consult the `claude-api` skill for current model IDs/pricing rather than hardcoding.

## Reference

- **`ROADMAP.md`** — the build state file: ordered milestones with acceptance criteria, statuses, and the build log. The **`/goal` skill** drives it (one verified milestone per run). Check it first to see where the build is up to.
- **`junior-dev-prd.md`** — the product-intent PRD (v0.3). §12 records every resolved decision with rationale. If intent changes, change the PRD *and* this file together.
- Old JrDev lives at `../JrDev/` with its own CLAUDE.md — useful only for **domain understanding of prize pools**, not for code patterns. Do not copy its structure.
- Project memory: `.claude/memory/` (decisions, gotchas, environment) — skim `MEMORY.md` first.
