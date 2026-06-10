# Junior Dev — Build Roadmap

Driven by the `/goal` skill: one milestone per run, test-first, gated, committed, then stop.
Scope authority: **CLAUDE.md** (binding spec, 2026-06-10) + `junior-dev-prd.md` v0.3 (§12 decisions).
Statuses: `[ ]` todo · `[~]` in progress · `[x] done (date, commit)` · `[!] blocked: reason`.

Ordering logic: foundation → design system → identity → the prize-pool loop end-to-end (the core
product thesis) → battles (the second mode, with its own infra) → AI generation → deploy → marketing.
Each milestone is sized to be one reviewable checkpoint.

---

## Phase A — Foundation

### M0: Scaffold & toolchain
- Status: `[x] done (2026-06-10, 84cabeb)` — Next 15.5 + TS 5.9 strict, Drizzle/Postgres 17, Vitest + Playwright, hooks live
- Depends on: —
- Spec: CLAUDE.md → Stack, Commands, Architecture
- Acceptance:
  - [x] Own git repo initialized in this folder (nested inside the home repo is expected — always run git from inside the project, same gotcha as EV_Scraper), `core.hooksPath .githooks` set, initial commit.
  - [x] Next.js 15 App Router, TypeScript strict; eslint + prettier configured.
  - [x] VSA skeleton folders (`src/features|domain|infra/db|app/components|lib`, `content/pools/`, `tests/e2e/`) with placeholder barrel/readme files so the structure is real.
  - [x] Drizzle + local Postgres via `docker compose` (db service), `db:generate`/`db:migrate` scripts working with a trivial first table.
  - [x] Vitest running (one passing kernel placeholder test), Playwright installed with one passing smoke e2e (home page renders).
  - [x] Quality-gate hooks + pre-commit gate verified live (they no-op'd pre-scaffold).
  - [x] `npm run dev` serves http://localhost:3000; typecheck/lint/test all green.

### M1: Design system
- Status: `[x] done (2026-06-10, b6951b0)` — "arena terminal" tokens (volt/gold/elo on OLED blue-black), 9 primitives, `/styleguide` verified at 1440+390
- Depends on: M0
- Spec: gamified-competitive aesthetic; use `frontend-design` + `ui-ux-pro-max` skills
- Acceptance:
  - [x] Design tokens (palette, typography, spacing, radii, motion) defined once and consumed everywhere (Tailwind v4 `@theme` in `globals.css`; fonts via `next/font`).
  - [x] Core primitives in `src/components/`: button, card, badge/chip, input, modal, nav shell, page layout, stat/leaderboard row, toast.
  - [x] `/styleguide` dev page rendering every primitive in every state.
  - [x] Playwright screenshot evidence of `/styleguide` (desktop + mobile widths) in `.claude/debug-shots/`.

### M2: Identity — Sussex auth + GitHub connect + onboarding
- Status: `[x] done (2026-06-10, 91478d2)` — magic-link auth (Auth.js v5 + Drizzle), 2-step onboarding, guarded shell; 35 unit + 4 e2e green
- Depends on: M1
- Spec: CLAUDE.md → Binding v1 decisions (identity); PRD §6.1–6.2
- Acceptance:
  - [x] Pure domain predicate: email eligibility (`@sussex.ac.uk` only) — unit-tested first, including tricky cases (subdomains, casing, plus-addressing).
  - [x] Auth.js magic-link sign-in restricted by that predicate; dev email adapter logs the link to console (real SMTP → Needs from Sampo).
  - [x] Onboarding flow: job-role selection (drives pool filtering) + mandatory GitHub account connect (OAuth, read-only) behind a mockable `infra/github` adapter.
  - [x] Session-guarded app shell: signed-out → landing/sign-in; signed-in-but-unboarded → onboarding; complete → dashboard.
  - [x] E2E: full sign-up → onboard → dashboard journey with mocked email + GitHub.

## Phase B — Prize Pools (the core loop, end to end)

### M3: Pool domain kernel
- Status: `[x] done (2026-06-10, eb59509)` — `domain/prize-pools/`: time-driven lifecycle (tick + effects-as-data), entry guards, normalized-Borda vote aggregation; 77 tests
- Depends on: M0
- Spec: CLAUDE.md → Prize Pool lifecycle; PRD §12 #5, #16
- Acceptance:
  - [x] Pure state machine `draft → published → building → judging → closed` + `extended`/`cancelled`, with explicit guards (min 6 entrants, one +48h extension, time-driven transitions) — every transition and every guard unit-tested, written test-first.
  - [x] Entry rules pure: role/difficulty eligibility, soft cap 3 concurrent active pools.
  - [x] Vote-aggregation rule pure: ranked sets → final standings, judge-to-win eligibility filter, deterministic tie handling.

### M4: Pool persistence, manual import & approval queue
- Status: `[x] done (2026-06-10, 30bdbb2)` — schema (profiles/pools/entries), `pools:import` CLI + 15 starter specs, `/operator/pools` approval queue; 155 unit + 7 e2e green
- Depends on: M2, M3
- Spec: CLAUDE.md → AI generation layer (approval queue), pool spec sources; PRD §12 #10, #13
- Acceptance:
  - [x] Drizzle schema: users, profiles, pools, entries (typed end to end, migration committed).
  - [x] `npm run pools:import` reads `content/pools/*.md` (YAML-frontmatter entries), validates (clear per-entry error report), dedupes by slug, creates pools in `draft`.
  - [x] Documented manual-pool format + 3 starter specs per launch role committed as real content.
  - [x] Operator approval slice: list drafts → approve (`published`) / reject — operator-gated.
  - [x] Slice tests for import + approve; kernel rules reused, not duplicated.

### M5: Browse & join pools
- Status: `[x] done (2026-06-10, 3beed2e)` — credit kernel + ledger, `/pools` browse/detail, race-safe join, `pools:tick` lifecycle cron (extension→cancellation+refund verified live); 183 unit + 9 e2e green
- Depends on: M4
- Spec: PRD §5 steps 4–5; CLAUDE.md → pool lifecycle (entry guards)
- Acceptance:
  - [x] Pool listing filtered by the user's job role + difficulty; pool detail page (spec, window, entrants/cap).
  - [x] `join-pool` slice enforcing kernel guards (eligibility, cap 3, pool joinable); free-credit debit recorded.
  - [x] Lifecycle cron job (host-scheduled) executing time-driven transitions incl. extension/cancellation with credit refund.
  - [x] E2E: browse → join → see joined state; screenshot evidence.

### M6: Build window — fresh repo + submission
- Status: `[x] done (2026-06-10, 14876ea)` — repo-freshness + window kernel rules, `infra/github` push-signal read, `infra/video` (local dev fallback), `submit-entry` slice + UI; 233 unit + 11 e2e green
- Depends on: M5
- Spec: CLAUDE.md → Binding decisions (repo rule), anti-cheat (pools); PRD §6.2, §6.5
- Acceptance:
  - [x] `infra/github` reads repo metadata + push events (server-side signals only); mockable, rate-limit-aware.
  - [x] Pure predicate: repo freshness (created after window open) + in-window push timeline — unit-tested first.
  - [x] `submit-entry` slice: link repo (verified) + demo video upload via `infra/video` (Cloudflare Stream adapter; dev fallback stores file locally — real account → Needs from Sampo); deadline enforced by kernel.
  - [x] Submission UI on the pool page with verification feedback; e2e of the happy path.

### M7: Pool anti-cheat
- Status: `[ ]`
- Depends on: M6
- Spec: CLAUDE.md → Anti-cheat (pools — authenticity, AI tools allowed)
- Acceptance:
  - [ ] Duplicate/reuse detection across entries and a user's prior submissions (pure scoring predicate + infra similarity adapter).
  - [ ] Flagging pipeline: flagged submissions excluded from judging/results pending operator review; review slice (uphold/clear).
  - [ ] Every predicate unit-tested with realistic fixture telemetry; flagged-path e2e.

### M8: Peer judging
- Status: `[ ]`
- Depends on: M6
- Spec: CLAUDE.md → judging decisions; PRD §6.6, §12 #8
- Acceptance:
  - [ ] Randomized, anonymized judge assignment (~5 per judge, scaled; never your own entry) — assignment rule pure + property-tested for coverage/fairness.
  - [ ] Judging UI: watch ~30s demos (signed playback URLs), drag-rank best-to-worst, submit ranking.
  - [ ] Aggregation via M3 kernel; judge-to-win eligibility enforced.
  - [ ] E2E: multi-user judging round on seeded data; screenshots.

### M9: Close pool — results, XP, rank
- Status: `[ ]`
- Depends on: M8
- Spec: CLAUDE.md → Gamification (XP, levels, global rank)
- Acceptance:
  - [ ] Gamification kernel: XP grants (join/submit/judge/win/streak), level curve, global-rank movement — pure, test-first, every rule covered.
  - [ ] `close-pool` transition awards XP/rank/standings atomically; results page with placement reveal.
  - [ ] Full-loop e2e: join → build (mocked GitHub) → submit → judge → close → results.

### M10: Profiles & leaderboards
- Status: `[ ]`
- Depends on: M9
- Spec: CLAUDE.md → Profiles, Gamification; PRD §6.10, §12 #4, #19
- Acceptance:
  - [ ] Public profile: rank, level/XP, wins, competition history, badges, streaks, linked GitHub, role(s); losses aggregate-only.
  - [ ] Privacy toggle (public default → private hides from public view/leaderboards/search) — visibility rule pure + tested.
  - [ ] Global leaderboard + per-role filtered views (per-role results captured since M9).
  - [ ] First badge set + streak rules as data + pure predicates; shareable profile URL; screenshots.

## Phase C — Live Code Battles

### M11: Battle domain kernel
- Status: `[ ]`
- Depends on: M0
- Spec: CLAUDE.md → Battle lifecycle, scoring, Elo
- Acceptance:
  - [ ] Pure state machine `challenged/queued → matched → countdown → live → resolved` + `voided`/`forfeited`/`flagged` — every transition/guard unit-tested.
  - [ ] Speed+penalty scoring pure fn `(submissionHistory, timeLimit, penaltyPerWrong) → outcome` — decisive-win, timeout-partial, tie, draw all covered; submission cooldown rule.
  - [ ] Elo pure fns (K-factor, expected score, floor, inactivity) + battle-XP grants; wager-settlement rules designed + unit-tested now, wired to nothing (Phase 2).

### M12: Judge0 + problem bank
- Status: `[ ]`
- Depends on: M11
- Spec: CLAUDE.md → Stack (Judge0), Binding decisions (problem bank)
- Acceptance:
  - [ ] `docker compose up judge0` runs locally, resource-capped + network-denied; `infra/judge` client (submit, poll verdict) mockable.
  - [ ] Problem schema: statement, difficulty tier, reference solution, hidden tests, status (draft/approved/retired).
  - [ ] AI drafting pipeline (Vercel AI SDK behind `infra/ai`): draft → auto-verify reference solution passes its own tests in Judge0 → operator approval queue (reuses M4 pattern).
  - [ ] ≥30 approved problems across 3 tiers seeded via the pipeline; retirement/rotation supported.

### M13: Realtime service
- Status: `[ ]`
- Depends on: M11
- Spec: CLAUDE.md → realtime/ (transport only, never authoritative)
- Acceptance:
  - [ ] Standalone WS service (`npm run dev:ws`): auth handshake, match rooms, presence, ready signals, synchronized countdown/"go", match timer, disconnect/reconnect grace tracking.
  - [ ] Typed match-event contract in `lib/` shared by service + client.
  - [ ] Simultaneity verified by an integration test (two simulated clients receive "go"/problem within tolerance) — it's a correctness property.
  - [ ] All authoritative decisions delegated to slices/kernel; service holds no business rules.

### M14: Battle arena UI
- Status: `[ ]`
- Depends on: M1, M13
- Spec: CLAUDE.md → anti-cheat (battles, in-match); design system
- Acceptance:
  - [ ] Arena: code editor (multi-language), problem pane, match timer, opponent progress (tests passed), submission verdict feed.
  - [ ] Paste-blocking + tab/focus-blur telemetry captured and sent (in-match anti-cheat inputs).
  - [ ] Countdown → reveal → live flow against a mocked room; screenshots of every match phase.

### M15: Battle slices — end to end
- Status: `[ ]`
- Depends on: M12, M13, M14
- Spec: CLAUDE.md → Battle lifecycle, Binding decisions (entry paths)
- Acceptance:
  - [ ] Slices: `send-challenge`/`accept-challenge` (username/link), `enter-queue` (simple pairing: prefer Elo proximity, widen fast) + online-players list, `submit-solution` (cooldown → Judge0 → verdict into kernel), `resolve-battle` (Elo/XP, history), forfeit on grace expiry, void on no-show.
  - [ ] Judge0 verdict authoritative — WS "finished" events decide nothing (tested).
  - [ ] E2E: two browser contexts fight a full battle (challenge → countdown → solve → resolved → Elo movement) on a seeded problem.

### M16: Battle anti-cheat + ladder
- Status: `[ ]`
- Depends on: M15
- Spec: CLAUDE.md → anti-cheat (battles, post-match); gamification (Elo ladder)
- Acceptance:
  - [ ] Post-match: plagiarism diff vs bank solutions + opponent, AI-likelihood heuristics, cadence anomalies — pure predicates over telemetry fixtures, test-first.
  - [ ] Any signal → `flagged` for operator review; confirmed → forfeit + Elo penalty + escalating bans (rules tested).
  - [ ] Battle Elo ladder page; battle badges (streaks, first blood, giant-killer) live on profiles.

## Phase D — AI generation, deploy

### M17: AI pool generation
- Status: `[ ]`
- Depends on: M9
- Spec: CLAUDE.md → AI generation layer; PRD §6.4A
- Acceptance:
  - [ ] Per-spec engagement metrics collected (joins, completion, drop-off, judge engagement).
  - [ ] Pure generation policy: signals → pool spec params (theme/difficulty/cadence) — unit-tested decision table.
  - [ ] Scheduled `generate-pool` slice drafts content via `infra/ai` (mocked in tests) → M4 approval queue; AI-created pools downstream-identical to manual ones (tested).

### M18: Production deploy
- Status: `[ ]`
- Depends on: M10, M16
- Spec: CLAUDE.md → Hosting (container host + Cloudflare)
- Acceptance:
  - [ ] Container host (Railway-class) running app, Postgres, WS service, network-denied Judge0; Cloudflare DNS/CDN/proxy in front (account/domain → Needs from Sampo).
  - [ ] Real adapters wired where credentials exist (email, GitHub OAuth, Cloudflare Stream); secrets in host env, never the repo.
  - [ ] Migrations + cron transitions running in prod; deploy steps documented in CLAUDE.md (Commands updated).
  - [ ] Smoke e2e against the deployed URL: sign-up gate + a battle countdown.

## Phase E — Marketing

### M19: Landing page + campus launch kit
- Status: `[ ]`
- Depends on: M18
- Spec: PRD §10.5 (cold start), §3 (personas); design system
- Acceptance:
  - [ ] Public landing page: thesis ("prove you can ship"), both modes shown, profile showcase, Sussex-only positioning, sign-up CTA — `frontend-design` quality bar, screenshots desktop+mobile.
  - [ ] SEO/OG meta + shareable profile cards.
  - [ ] Campus launch kit in `marketing/`: poster/flyer copy, CompSoc/Discord + lecture-shoutout blurbs, launch-event pool concept ("Freshers' Build Night"), first-2-weeks content calendar seeded with real pool/battle events.

---

## Needs from Sampo

| Need | For | Status |
|------|-----|--------|
| GitHub OAuth app (client id/secret) | M2 real GitHub connect (mocked until then) | open |
| SMTP/email provider creds | M2 real magic-link delivery (console adapter until then) | **wired** 2026-06-10 — IONOS (`smtp.ionos.co.uk`) in `.env`; `SmtpEmailClient` behind the email seam, auto-active in prod, `npm run email:verify` confirmed conn+auth. Dev still uses the outbox. |
| Cloudflare account (Stream + DNS) + domain name | M6 video, M18 deploy | open — M6 ships on the `LocalVideoClient` dev fallback (writes demos to `.dev/videos/`); the real Stream client (direct upload + signed playback) is gated behind `CLOUDFLARE_*` and lands at M18. |
| Anthropic API key (build-time generation) | M12, M17 | open |
| Container host account (Railway or Fly) | M18 | open |
| Confirm battle languages for v1 (suggest: Python, JS/TS, Java, C++) | M12 problem bank | open |
| Decide: local docker Postgres vs Supabase — `.env` was found pointing at a Supabase URL whose host no longer resolves (dead project?). Restored to the docker db so `db:*`/dev/tests work; the Supabase line is kept commented in `.env`. If Supabase is the plan, revive/recreate the project and we'll wire it properly. | dev DB (all milestones) | open |

## Build log

*(one line per completed milestone — date, milestone, summary, commit)*

- 2026-06-10 — **M6: Build window — fresh repo + submission** — two new pure kernel rules in `domain/prize-pools/submission` (test-first, 20 tests): `checkSubmissionWindow` is the deadline/state gate ("deadline enforced by the kernel" — must be `building`, before `buildDeadline` which is inclusive like `tickPool`, an entrant, not a dupe; collects ALL failed reasons like `checkJoin`), and `checkRepoFreshness` is the anti-cheat anchor over GitHub **server-side** signals only — repo created at/after the build window opened (the "prepared earlier" cheat) + ≥1 push inside `[openedAt, closesAt]` (inclusive bounds), never client commit timestamps. The build window is `[joinDeadline, buildDeadline]` (extension shifts both, so it stays correct) — no new column needed. `infra/github` extended: `fetchRepoSignals` returns a discriminated `RepoSignalsResult` so the slice tells `not-found` from `rate-limited` (the rate-limit awareness the real client maps from a 403 + `X-RateLimit-Remaining: 0`); pure `parseGitHubRepoUrl` (19 tests) accepts the forms students paste (https/ssh/shorthand/.git/trailing path) and rejects non-GitHub hosts; mock returns created-now/pushed-now signals (latest possible timestamp → always fresh for any `building` pool). New `infra/video` seam mirroring the github gate: `LocalVideoClient` writes demos to `.dev/videos/` (the dev fallback), real Cloudflare Stream client gated behind `CLOUDFLARE_*` → M18. Migration `0004`: nullable submission columns on `entries` (`repo_url`, `repo_created_at` (GitHub-side, audit/M7), `video_id`, `video_playback_url`, `submitted_at`). `submit-entry` slice (11 tests): orchestrates load → kernel window verdict → verify repo → kernel freshness verdict → store video → record, performing NO side effect until every gate passes (verification GATES linking — M6 is the hard check; soft duplicate/plagiarism flagging is M7); action parses the video `File` → `Buffer`, wires real infra, 200MB cap. `SubmitEntryForm` on the pool detail "You're in" card; `getPoolDetail` extended with `mySubmission` so the card shows the form (building), the submitted summary (repo link + timestamp), the "opens later" note (pre-building), or "closed" (post-building). E2E `submit.spec` (happy path + invalid-URL rejection) on a new `seedBuildingPool` + `addEntrant`; hardened the shared onboarding helper to wait for step 2 before connecting GitHub (kills a latent two-action race). 233 unit + 11 e2e green (e2e deterministic serially; `fullyParallel` flakes on dev-server cold-compile contention, not logic); screenshots `.claude/debug-shots/m6-*.png`. Commit `14876ea`.
- 2026-06-10 — **M5: Browse & join pools** — credit policy joined the kernel: `domain/prize-pools/credits` (STARTING_CREDITS 5, JOIN_CREDIT_COST 1, `creditDelta` as the single source of signed amounts) + `insufficient-credits` guard added to `checkJoin`. Migration `0003`: `credit_transactions` ledger (signed amounts, unique user+pool+reason = idempotency lock against double debit/refund); `profiles.credits` is the cached balance, the ledger is the audit trail; `infra/db/profiles.ensureProfile` materializes the profile + starter grant on first touch (PRD "grant on sign-up", realized lazily, race-safe via PK conflict). `join-pool` slice: kernel verdict up front, then transactional `recordJoin` re-checks the race-prone guards under a pool-row lock (`FOR UPDATE` serializes capacity; conditional `credits >= cost` UPDATE guards balance; entries unique guards dups) — stale-verdict races surface as ordinary rejections. `tick-pools` slice + `npm run pools:tick` (host cron command, CLAUDE.md Commands updated): kernel `tickPool` decides, slice executes; **effects run before the status persist** so a crash re-runs effects (refunds dedupe on the ledger) instead of stranding them; assign-judges/finalize-results recorded as pending (M8/M9); per-pool error isolation. `browse-pools` slice: `buildPoolView` computes the checkJoin verdict ONCE for listing+detail+button; `/pools` (role-filtered, difficulty filter chips, credits/rank header, My pools section) + `/pools/[poolId]` (brief/requirements/windows/entrants, JoinPoolButton via useActionState, rejection reasons listed); shared candidate reads in `infra/db/pool-queries` (the infra seam instead of cross-slice imports); `lib/nav` MAIN_NAV; dashboard wired to /pools (+ fixed pre-existing mojibake em-dashes). Verified live: published→extended (+48h all three deadlines, notify) → extended→cancelled (refund 4→5 credits, ledger `pool-join -1`/`pool-refund +1`, notify) → re-tick idempotent. 183 unit + 9 e2e green; screenshots `.claude/debug-shots/m5-*.png`. Commit `3beed2e`.
- 2026-06-10 — **M4: Pool persistence, manual import & approval queue** — migration `0002`: `profiles` (xp/level/globalRank/credits — M9 owns movement, M5 owns credit policy), `pools` (kernel-typed status/role/difficulty columns; window DURATIONS from the spec + nullable deadlines stamped at approval; `rejectedAt` = archival metadata, NOT a lifecycle state — rejected drafts keep status `draft`, leave every queue, and their slug stays claimed so re-import can't resurrect them), `entries` (unique pool+user). New kernel rules (test-first): `domain/identity/operator` (env-allowlist predicate, deny-by-default) + `domain/prize-pools/schedule` (`schedulePool` lays join/build/judging windows end-to-end from the publish instant — specs are written before approval time is known). `import-pools` slice: pure multi-entry frontmatter parser (`spec-format.ts`, collects ALL problems per entry, `---` is structural → briefs use `***` hr), orchestration with injected deps (file/batch/DB dedupe by slug, valid entries import even when siblings are malformed, exit 1 on any error), `tsx` CLI; format doc + 15 starter specs (3×5 roles) in `content/pools/`; verified live: 15 created, re-run 15 skipped. `approve-pool` slice: approve = kernel `approvePool` + `schedulePool` → publish with deadlines (verified in DB: +3d/+10d/+13d), reject = `rejectedAt` stamp; operator gate enforced in the server actions (not just the page — actions are public endpoints), non-operators 404. `getIdentity` moved `features/identity/session.ts` → `infra/auth/identity.ts` (slices in other features need it; cross-slice imports are the VSA smell). `OPERATOR_EMAILS` env (+ example). Found `.env` pointing at a dead Supabase URL — restored docker db, flagged in Needs. 155 unit + 7 e2e (operator gate ×3) green; screenshots `.claude/debug-shots/m4-*.png`. Commit `30bdbb2`.
- 2026-06-10 — **M3: Pool domain kernel** — `src/domain/prize-pools/` (pure, zero infra imports): `lifecycle.ts` — explicit transition table, operator `approvePool`, time-driven `tickPool(pool, now)` returning new snapshot + effects-as-data (`refund-credits`, `notify-extension`, `assign-judges`, `finalize-results`) for the M5 cron slice to execute; extension shifts all three deadlines +48h; deadlines inclusive (`now >= deadline` fires); defensive published→cancelled edge keeps the rule total. `entry.ts` — `checkJoin` collects ALL failed guards (role match, rank-gated difficulty tiers beginner/0 intermediate/100 advanced/250 (tunable until M9), cap-3 via shared `ACTIVE_POOL_STATUSES`, window/capacity/dup). `vote-aggregation.ts` — normalized Borda (`(k-1-i)/(k-1)`, mean per entry) so different ballot sizes compare; `checkBallot` makes self-votes impossible by construction; judge-to-win filter splits honest `standings` from awarded `finalPlacements`; deterministic ties (score → firsts → entryId) + order-independent fold; throws on corrupt ballots. 77 tests, written first. Commit `eb59509`.
- 2026-06-10 — **M2: Identity** — pure enrolment gate in `domain/identity/` (exact-domain `@sussex.ac.uk`, lowercasing, plus-tag stripping — 22 tests incl. lookalike domains), Auth.js v5 magic-link (custom EmailConfig through mockable `infra/email`; dev adapter logs + writes `.dev/outbox.jsonl` which the e2e reads as its inbox; `normalizeIdentifier` enforces the gate at the auth boundary), Drizzle adapter schema (users/accounts/sessions/verification_tokens + jobRole, migration `0001`), VSA slices `sign-in`/`select-role`/`connect-github` with injected-deps tests, mock GitHub connector behind `infra/github` seam, guarded `/` → `/onboarding` (2-step) → `/dashboard` via one `getIdentity()` loader + kernel `onboardingStatus`. 35 unit + 4 e2e green; screenshots in `.claude/debug-shots/m2-*.png`. Vitest now resolves the `@/` alias. Commit `91478d2`.
- 2026-06-10 — **M1: Design system** — "arena terminal" aesthetic: Tailwind v4 `@theme` tokens (volt `#bfff3f` accent, gold/silver/bronze/elo, OLED blue-black surfaces, cut-corner signature, snap easing), Russo One + Chakra Petch + JetBrains Mono via `next/font`, 9 primitives in `src/components/` (button/card/badge/input+field/modal/nav shell/page layout/leaderboard row+stat card/toast) with a11y wiring (focus-visible volt ring, aria-live toasts, labelled dialog, reduced-motion), `/styleguide` page + client demo island, screenshots (desktop 1440 / mobile 390 / modal open) in `.claude/debug-shots/`. 7 unit tests green. Commit `b6951b0`.
- 2026-06-10 — **M0: Scaffold & toolchain** — Next.js 15.5 (App Router, TS 5.9 strict), ESLint 9 + Prettier, VSA skeleton (`features/domain/infra/realtime/components/lib` + `content/pools` + `tests/e2e`), Drizzle + Postgres 17 (docker compose `db`, first migration applied), Vitest (4 tests) + Playwright smoke e2e passing, quality-gate + pre-commit hooks verified live. TS pinned to 5.x (TS 6 breaks Next 15 CSS imports). Old top-level `skills/` removed (superseded by `.claude/skills/`). Commit `84cabeb`.
