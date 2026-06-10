---
name: vertical-slice-architecture
description: Apply Vertical Slice Architecture (VSA) when adding or changing a feature in the JrDev rewrite. Use when creating a new capability (join-pool, submit-entry, cast-vote, close-pool, enter-queue, submit-solution, settle-battle, generate-pool), deciding where new code belongs, or reviewing whether a change respects slice boundaries and the pure domain kernel. Triggers on "new feature", "add a slice", "where does this go", "vertical slice", or "is this in the right layer".
---

# Vertical Slice Architecture (VSA) — JrDev rewrite

This skill is the playbook for **how features are structured** in this repo. Read it before
adding or moving any feature code. It is written to teach as well as instruct — Sampo is a
student, so explain the *why* when you apply it.

## The one-paragraph idea

Organise the codebase by **what the user can do** (a "slice"), not by **technical layer**.
A slice like `join-pool` owns everything that one use-case needs — its entry point (server
action / route handler), its orchestration, its slice-local UI, and its tests — all in one
folder. The opposite, **horizontal layering**, scatters a single feature across `controllers/`,
`services/`, `repositories/`, `components/`. VSA keeps a feature together so you can build it,
test it, reason about it, and even delete it as one unit.

## Why we chose it (the teaching bit)

- **Change locality.** Adding "cast a vote" should touch *one* folder, not five parallel layers.
  Horizontal layering causes "shotgun surgery": one logical change, edits sprayed everywhere.
- **Low coupling between features.** `submit-solution` and `cast-vote` barely know about each other.
  Slices make that independence physical, so one feature's mess can't leak into another.
- **Tests map to behaviour.** Each slice has its own test file describing a real user capability.
  That is exactly the "test-first on every state transition / scoring rule" standard this repo demands.
- **It pairs with a pure core, not against it.** VSA is sometimes caricatured as "no shared layers".
  Here we keep one deliberate shared layer — the **pure domain kernel** — because the gamification
  math, the pool/battle state machines, the Elo update, and the AI-generation policy are *cross-cutting
  rules* that must be unit-tested in isolation (a non-negotiable in CLAUDE.md). Slices import the
  kernel; the kernel imports nothing back.

## The layout

```
src/
  features/                      # ← VERTICAL SLICES: the primary unit of organisation
    prize-pools/
      join-pool/
        join-pool.action.ts      # thin entry point (server action / route handler)
        join-pool.ts             # the use-case: orchestration for THIS capability only
        join-pool.test.ts        # behaviour test for THIS slice (write it first)
        JoinPoolButton.tsx       # slice-local UI (lives here unless it's truly shared)
      submit-entry/
      cast-vote/
      close-pool/                # time-driven lifecycle transition (invoked by the cron job)
    battles/
      enter-queue/
      accept-challenge/
      submit-solution/           # calls the judge client, then applies pure domain scoring
      settle-battle/             # calls the escrow/settlement client
    profiles/
      view-profile/
    ai-generation/
      generate-pool/             # scheduled: decision policy (kernel) + content gen (ai client)

  domain/                        # ← SHARED PURE KERNEL — imports NOTHING from the app/db/framework
    prize-pools/                 # pool state machine, entry rules
    battles/                     # match state machine, speed+penalty scoring, anti-cheat predicates
    gamification/                # XP, levels, ranking, badges, streaks, Elo
    ai-generation/               # signals -> pool spec policy

  infra/                         # ← SHARED I/O ADAPTERS that slices call (the side-effect edge)
    db/                          # Drizzle schema, queries, migrations
    judge/                       # Judge0 client (untrusted code execution)
    escrow/                      # payments / escrow client
    ai/                          # Vercel AI SDK client (mockable in tests)

  realtime/                      # standalone WebSocket service (own deployable); relays events
                                 # into slices/domain — never owns authoritative rules
  components/                    # genuinely cross-feature UI primitives
  lib/                           # shared utils, types, the match-event contract

tests/
  e2e/                           # Playwright journeys that cross slices (join->submit->vote->win)
```

> This **supersedes** the older flat `services/` horizontal layer sketch. Per-use-case
> orchestration now lives *inside* each slice; shared side-effect clients live in `infra/`.

## The rules (enforce these in review)

1. **One slice = one user-facing use-case.** If a folder is doing two unrelated jobs, split it.
2. **The entry point is thin.** `*.action.ts` validates input and delegates. No business rules,
   no SQL, no `fetch` to Judge0 in a server action or React component.
3. **Slices depend on the kernel and on `infra/`, never on each other.** If `cast-vote` needs
   something from `submit-entry`, that shared thing belongs in `domain/` or `infra/`, not in a
   cross-slice import. (Cross-slice imports are the smell that VSA exists to kill.)
4. **The kernel stays pure.** `domain/` takes plain data in, returns plain data out. No imports
   from `db/`, `app/`, `infra/`, `realtime/`, or any framework. This is what makes XP/Elo/scoring
   unit-testable without a DB or network.
5. **Money and match-authority live in `domain/` + the slice, never in `realtime/` or Judge0.**
   A WebSocket message or a judge verdict is *input* that routes through a slice which validates it
   against the kernel — it never directly mutates a result or moves money.
6. **Side effects go through `infra/` clients,** which are mockable so slice tests don't hit the
   network or DB.

## Recipe: adding a slice (test-first)

1. **Name the capability** as a verb-noun the user would recognise: `accept-challenge`, not `challengeMgr`.
2. **Find the pure rule.** What decision is being made (a state transition? a score? an Elo delta?)
   Put that rule in `domain/` as a pure function and **write its unit test first** — cover every
   branch (decisive win / timeout / draw / void, etc.).
3. **Create the slice folder** under the right feature with `<name>.ts`, `<name>.action.ts`,
   `<name>.test.ts`.
4. **Write the slice test next** (the behaviour: given input + mocked infra, the right calls happen
   and the right result comes back). Mock `infra/` clients.
5. **Implement `<name>.ts`** to orchestrate: validate -> call kernel for the decision -> call `infra/`
   to persist / move money / run code. Keep it small.
6. **Add the thin `<name>.action.ts`** entry point that wires the slice to Next.js.
7. **Slice-local UI** goes in the same folder unless it's a genuine shared primitive.
8. **Run the gate** (eslint/tsc fire automatically via hooks; the pre-commit gate runs tests).

## Worked example: `features/prize-pools/cast-vote`

- `domain/prize-pools/` already owns the pure rule "is this vote valid for this pool in `voting`
  state, and how does it affect the tally?" — pure function, fully unit-tested.
- `cast-vote.ts` orchestrates: load the pool via `infra/db`, call the pure rule, persist the vote,
  award XP via the gamification kernel. It owns no rules itself.
- `cast-vote.action.ts` is the server action: parse + auth-check the request, call `cast-vote.ts`.
- `cast-vote.test.ts` mocks `infra/db` and asserts the orchestration; the *rule's* edge cases are
  tested in the kernel.

## Review checklist

- [ ] New code lives in exactly one slice folder (or the kernel / `infra/`).
- [ ] The entry point is thin — no business logic, SQL, or network in actions/components.
- [ ] No cross-slice imports.
- [ ] Any real decision (transition / score / Elo / payout-eligibility) is a pure function in
      `domain/` with its own first-written unit test.
- [ ] Side effects go through a mockable `infra/` client.
- [ ] `realtime/` and Judge0 only relay/execute — they don't decide results or move money.
