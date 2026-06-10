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
- Status: `[ ]`
- Depends on: M1
- Spec: CLAUDE.md → Binding v1 decisions (identity); PRD §6.1–6.2
- Acceptance:
  - [ ] Pure domain predicate: email eligibility (`@sussex.ac.uk` only) — unit-tested first, including tricky cases (subdomains, casing, plus-addressing).
  - [ ] Auth.js magic-link sign-in restricted by that predicate; dev email adapter logs the link to console (real SMTP → Needs from Sampo).
  - [ ] Onboarding flow: job-role selection (drives pool filtering) + mandatory GitHub account connect (OAuth, read-only) behind a mockable `infra/github` adapter.
  - [ ] Session-guarded app shell: signed-out → landing/sign-in; signed-in-but-unboarded → onboarding; complete → dashboard.
  - [ ] E2E: full sign-up → onboard → dashboard journey with mocked email + GitHub.

## Phase B — Prize Pools (the core loop, end to end)

### M3: Pool domain kernel
- Status: `[ ]`
- Depends on: M0
- Spec: CLAUDE.md → Prize Pool lifecycle; PRD §12 #5, #16
- Acceptance:
  - [ ] Pure state machine `draft → published → building → judging → closed` + `extended`/`cancelled`, with explicit guards (min 6 entrants, one +48h extension, time-driven transitions) — every transition and every guard unit-tested, written test-first.
  - [ ] Entry rules pure: role/difficulty eligibility, soft cap 3 concurrent active pools.
  - [ ] Vote-aggregation rule pure: ranked sets → final standings, judge-to-win eligibility filter, deterministic tie handling.

### M4: Pool persistence, manual import & approval queue
- Status: `[ ]`
- Depends on: M2, M3
- Spec: CLAUDE.md → AI generation layer (approval queue), pool spec sources; PRD §12 #10, #13
- Acceptance:
  - [ ] Drizzle schema: users, profiles, pools, entries (typed end to end, migration committed).
  - [ ] `npm run pools:import` reads `content/pools/*.md` (YAML-frontmatter entries), validates (clear per-entry error report), dedupes by slug, creates pools in `draft`.
  - [ ] Documented manual-pool format + 3 starter specs per launch role committed as real content.
  - [ ] Operator approval slice: list drafts → approve (`published`) / reject — operator-gated.
  - [ ] Slice tests for import + approve; kernel rules reused, not duplicated.

### M5: Browse & join pools
- Status: `[ ]`
- Depends on: M4
- Spec: PRD §5 steps 4–5; CLAUDE.md → pool lifecycle (entry guards)
- Acceptance:
  - [ ] Pool listing filtered by the user's job role + difficulty; pool detail page (spec, window, entrants/cap).
  - [ ] `join-pool` slice enforcing kernel guards (eligibility, cap 3, pool joinable); free-credit debit recorded.
  - [ ] Lifecycle cron job (host-scheduled) executing time-driven transitions incl. extension/cancellation with credit refund.
  - [ ] E2E: browse → join → see joined state; screenshot evidence.

### M6: Build window — fresh repo + submission
- Status: `[ ]`
- Depends on: M5
- Spec: CLAUDE.md → Binding decisions (repo rule), anti-cheat (pools); PRD §6.2, §6.5
- Acceptance:
  - [ ] `infra/github` reads repo metadata + push events (server-side signals only); mockable, rate-limit-aware.
  - [ ] Pure predicate: repo freshness (created after window open) + in-window push timeline — unit-tested first.
  - [ ] `submit-entry` slice: link repo (verified) + demo video upload via `infra/video` (Cloudflare Stream adapter; dev fallback stores file locally — real account → Needs from Sampo); deadline enforced by kernel.
  - [ ] Submission UI on the pool page with verification feedback; e2e of the happy path.

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
| SMTP/email provider creds | M2 real magic-link delivery (console adapter until then) | open |
| Cloudflare account (Stream + DNS) + domain name | M6 video, M18 deploy | open |
| Anthropic API key (build-time generation) | M12, M17 | open |
| Container host account (Railway or Fly) | M18 | open |
| Confirm battle languages for v1 (suggest: Python, JS/TS, Java, C++) | M12 problem bank | open |

## Build log

*(one line per completed milestone — date, milestone, summary, commit)*

- 2026-06-10 — **M1: Design system** — "arena terminal" aesthetic: Tailwind v4 `@theme` tokens (volt `#bfff3f` accent, gold/silver/bronze/elo, OLED blue-black surfaces, cut-corner signature, snap easing), Russo One + Chakra Petch + JetBrains Mono via `next/font`, 9 primitives in `src/components/` (button/card/badge/input+field/modal/nav shell/page layout/leaderboard row+stat card/toast) with a11y wiring (focus-visible volt ring, aria-live toasts, labelled dialog, reduced-motion), `/styleguide` page + client demo island, screenshots (desktop 1440 / mobile 390 / modal open) in `.claude/debug-shots/`. 7 unit tests green. Commit `b6951b0`.
- 2026-06-10 — **M0: Scaffold & toolchain** — Next.js 15.5 (App Router, TS 5.9 strict), ESLint 9 + Prettier, VSA skeleton (`features/domain/infra/realtime/components/lib` + `content/pools` + `tests/e2e`), Drizzle + Postgres 17 (docker compose `db`, first migration applied), Vitest (4 tests) + Playwright smoke e2e passing, quality-gate + pre-commit hooks verified live. TS pinned to 5.x (TS 6 breaks Next 15 CSS imports). Old top-level `skills/` removed (superseded by `.claude/skills/`). Commit `84cabeb`.
