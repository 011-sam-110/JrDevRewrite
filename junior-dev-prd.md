# Junior Dev — Product Requirements Document

**Version:** 0.3 (Decisions resolved — build-ready)
**Status:** Resolved / feeding the build spec (CLAUDE.md)
**Last updated:** June 10, 2026
**Author:** Drafted with Claude from founder brain-dump

> This is a first-pass PRD built from an initial verbal description. Assumptions made to fill gaps are marked **[ASSUMPTION]**. Decisions that still need an answer are marked **[OPEN]**. Items that likely need a lawyer or payments specialist are marked **[LEGAL/RISK]**.

> **v0.2 changes:** Pools are now **free by default with paid entry optional**. Added **manually authored prize pools** sourced from a per-job-role text dump, alongside AI-generated pools.

> **v0.3 changes (founder grilling session, 2026-06-10):** All v1-blocking open questions resolved — see §12. Headlines: **Live 1v1 Code Battles are in v1** (alongside prize pools); **no real money anywhere in v1** (paid pools *and* battle wagers both move to Phase 2 behind one shared compliance build); **Sussex email is the login**. **CLAUDE.md is now the binding build spec** reflecting these decisions; this PRD is the product-intent record.

---

## 1. Overview

**Junior Dev** is a heavily gamified competitive coding platform for university computer science students. Students compete in time-boxed "prize pools" — building real projects against an AI-generated spec, tracking their work on GitHub, and submitting a repo plus a short demo video. Submissions are judged by peer voting, verified by AI anti-cheat, and ranked. The platform doubles as a portfolio: a LinkedIn-style profile surfaces a student's rank, wins, and competition history as proof of skill to recruiters.

The core thesis: **make getting good at shipping software feel like a game, and turn that activity into a credible, verifiable signal of employability.**

---

## 2. Problem & Vision

### Problem
- CS students learn theory but graduate with thin, hard-to-verify portfolios.
- Side projects are unstructured, easy to fake, and hard for recruiters to trust.
- Existing competitive platforms (e.g. LeetCode-style) test algorithm puzzles, not the ability to *ship a real project end-to-end*.
- Practice is boring; motivation drops off.

### Vision
A platform where students compete on building real, shippable software, get a tight feedback loop and constant rewards, and walk away with a public, verified track record that recruiters actually trust.

---

## 3. Target Users

### Primary persona — "The Competitive Student"
- University CS student (undergrad/postgrad).
- Wants to build skills *and* a portfolio that gets them hired.
- Motivated by competition, streaks, leaderboards, and small rewards.
- Already uses (or willing to use) GitHub.

### Secondary persona — "The Recruiter / Employer"
- Wants pre-vetted, verifiable evidence of a candidate's ability to ship.
- Browses or filters profiles by rank, job role, and project history.
- **[OPEN]** Is this a launch audience or a later monetization channel?

**[OPEN]** Age: many university students are 18+, but some first-years (and international/younger students) may be under 18. This is a **[LEGAL/RISK]** issue for any cash-prize feature — see §10.

---

## 4. Goals & Non-Goals

### Goals
1. Get students building real projects regularly with maximum engagement.
2. Produce a verifiable, fraud-resistant skill signal.
3. Build a sustainable economy where the platform never loses money on free credit.
4. Make difficulty scale with skill so the platform stays challenging.

### Non-Goals (for v1)
- Not an algorithm/interview-prep tool (no DSA puzzle grind).
- Not a hiring marketplace yet (recruiter features are post-MVP).
- Not a general-purpose code hosting tool — GitHub remains the source of truth.

---

## 5. Core User Journey

1. **Sign up** → pick target job role / industry (e.g. front-end, backend, ML, mobile).
2. **Connect GitHub** (required from the start).
3. **Receive free starter credit** (entry-only, non-cashable).
4. **Browse prize pools** filtered by job role and difficulty/rank.
5. **Join a prize pool** (spend credit or deposited funds as entry).
6. **Build the project** against an AI-generated spec, committing to GitHub throughout the window.
7. **Submit**: connect the repo + upload a short demo video.
8. **AI verification** runs anti-cheat checks on the repo and submission.
9. **Peer judging**: participants watch ~30s of others' demos and rank a small set best-to-worst.
10. **Results**: winners determined; cash prizes paid only to those who entered with real money (see §9).
11. **Profile updates**: rank, wins, stats refresh on a public LinkedIn-style profile.
12. **Difficulty scales**: higher rank unlocks harder pools. Loop repeats.

---

## 6. Feature Requirements

### 6.1 Onboarding & Account Setup
- Email/OAuth sign-up. **[ASSUMPTION]** Support GitHub OAuth as a primary sign-in.
- Job-role selection during onboarding; drives which pools and specs the user sees.
- Free starter credit granted on first sign-up.
- **[OPEN]** Student verification — do we verify `.edu` email / enrollment, and is it required?
- **[LEGAL/RISK]** Age gate / age verification before any monetary feature.

### 6.2 GitHub Integration
- Mandatory GitHub account connection at onboarding.
- Track commit activity *during* a competition window (used by anti-cheat to prove the work was done in-window).
- On submission, the user links the specific repository for the project.
- **[OPEN]** Do we require a fresh repo per competition, or allow existing repos with a clear "start point" timestamp?
- **[ASSUMPTION]** Read-only GitHub API access (commits, repo metadata, timestamps) — no write access to user repos.

### 6.3 Prize Pools (Competitions)
- A prize pool = a time-boxed competition for a given job role + difficulty tier.
- **Two pool types by entry:**
  - **Free pools (default):** the standard experience. No real money required; entered with free credit. Rewards are non-cash — XP, rank, badges, leaderboard standing, and portfolio credit. These carry the core engagement loop and most competitions are free.
  - **Paid pools (optional):** an opt-in tier where users enter with deposited real money and can win cash. Clearly separated in the UI and gated behind age/eligibility checks. **[LEGAL/RISK]** — see §10.
- A user can complete the full product loop (compete, get ranked, build a profile) using **free pools only**, never spending money. Paid pools are an upgrade, not a requirement.
- Each pool has: a spec, a source (AI-generated or manual — see §6.4), a time window, an entry type (free/paid) and cost, a participant cap **[OPEN]**, and a reward/prize structure.
- Users can be in **[OPEN]** one or multiple pools at a time?
- Pool fills up → window opens → build → submit → judge → reward/payout.

### 6.4 Pool Spec Sources
Pools can be created from **two sources**. Both produce the same pool object and run through the identical lifecycle.

**A) AI-generated specs (automated)**
- An AI system generates the project specification for a pool.
- Specs are tailored to the job role and difficulty tier.
- The system reviews how pools perform across each job role and adjusts future specs.
- Optimization targets: **interesting**, **challenging**, and **completable within the window**.
- Tracks per-spec success metrics (completion rate, satisfaction, drop-off) and feeds them back into generation.
- **[OPEN]** Human review/approval step before a generated spec goes live? (Recommended early on for quality + safety.)

**B) Manually authored specs (operator-supplied)**
- Operators can hand-author prize pools without the AI generator.
- Source of truth: a **per-job-role text dump** — one document per job role containing manually written pool specs.
- The system **reads/ingests** these documents and turns each entry into a runnable pool.
- **[ASSUMPTION]** A defined, parseable format per entry (e.g. a delimiter or simple field structure: title, difficulty tier, brief, requirements, time window, entry type). Needs a spec for the format itself.
- **[OPEN]** Ingestion trigger — re-read on a schedule, on file change, or via a manual "import" action?
- **[OPEN]** Where do the dumps live — a repo, a CMS, an admin upload, object storage? (A version-controlled file per role is a simple, auditable starting point.)
- **[OPEN]** Validation on ingest (malformed entries, duplicates, missing fields) and what happens on failure.
- Manual pools are useful for: curated/sponsored challenges, seeding launch content, themed events, and a quality fallback while the AI generator matures.

### 6.5 Submission (Repo + Demo Video)
- Submit linked GitHub repo.
- Upload a short demonstration video (**[ASSUMPTION]** ~30–90s, since judges watch ~30s).
- **[OPEN]** Video hosting (self-host, S3 + CDN, or 3rd-party like Mux)?
- Submission deadline tied to the pool window.

### 6.6 Peer Judging / Voting
- After the window closes, participants judge.
- Each judge watches ~30s of a small set (~5, scaled to pool size) of other submissions.
- Judges rank that set best-to-worst.
- Scores aggregate across judges to produce final rankings.
- **[OPEN]** Anti-collusion / fairness: how do we prevent vote-trading, self-voting, or low-effort ranking? (e.g. randomized assignment, judge-quality scoring, requiring you to judge to be eligible to win.)
- **[OPEN]** Is peer voting the sole judge, or does AI/expert review weigh in for high-value pools?

### 6.7 AI Anti-Cheat & Verification
- Verifies the submission is **recent** — built during the competition window, not a pre-existing project re-uploaded.
- Uses GitHub commit history/timestamps to confirm in-window work.
- Detects reused/duplicate projects (e.g. repeated repos, copied solutions).
- **[OPEN]** Detect AI-generated-code abuse? (Tricky — define what's allowed; many students *should* use AI tools. Probably police *outcome authenticity* rather than ban AI.)
- Flags suspicious submissions for review before payout.

### 6.8 Ranking & Difficulty Scaling
- Every player has a rank/skill rating (**[ASSUMPTION]** Elo-style or tiered ladder).
- Higher rank → access to (and matching with) harder pools.
- Project complexity scales with the player's rank.
- Rank changes based on competition results.
- **[OPEN]** Single global rank, or per-job-role ranks?

### 6.9 Wallet, Credits & Monetization
- **Free credit (default path):** granted on sign-up; used to enter **free pools**. Free pools award non-cash rewards (XP, rank, badges, portfolio credit) — free credit **cannot be cashed out or won as cash**.
- **Real funds (optional path):** deposited by the user to enter **paid pools**, where cash can be won.
- **Key rule:** a participant can only *win money* if they *entered a paid pool with real money*. Free pools never pay cash, which keeps the platform from paying out against free credit. → See §9.
- Most users may never deposit — that's intended. Paid pools are an optional upgrade layered on top of a fully functional free experience.
- Wallet shows credit balance, cash balance, transaction history.
- **[LEGAL/RISK]** Deposits, payouts, KYC/AML, and payment-processor acceptance all apply only to the paid tier and need specialist review (see §10).

### 6.10 Profile (LinkedIn-style)
- Public profile per user showing:
  - Current rank / tier.
  - Number of projects/pools won.
  - Competition history, stats, badges.
  - Linked GitHub.
  - Target job role(s).
- Designed to be shareable and recruiter-facing.
- **[OPEN]** Privacy controls — what's public vs. private by default?

### 6.11 Gamification / "Dopamine" Layer
The stated north star is *maximum engagement and reward*. Concrete mechanics to consider:
- Streaks, daily challenges, XP, levels, badges, leaderboards.
- Instant feedback and animations on commits/submissions/wins.
- Seasonal ladders / resets to keep competition fresh.
- Notifications and FOMO mechanics around pools filling up.
- **[RISK]** "As much dopamine as possible" + real money + young users is a combination to design *responsibly* — see §10. Build in healthy-use guardrails (spend limits, cool-downs, self-exclusion) from day one.

---

## 7. Technical Architecture (Initial Sketch)

> High-level only — not a final design.

- **Frontend:** web app (**[ASSUMPTION]** responsive web first; mobile later).
- **Backend/API:** competition lifecycle, wallet, ranking, judging orchestration.
- **GitHub integration:** OAuth + REST/GraphQL API for commit history & repo metadata.
- **AI services:**
  - Spec generation + curation (LLM + feedback loop on pool metrics).
  - Anti-cheat (commit-timeline analysis, duplicate/repo similarity detection).
- **Pool ingestion service:** reads manually authored pools from the per-job-role text dumps, validates/parses entries, and creates runnable pools (see §6.4B). Shares the same pool model as AI-generated pools.
- **Video pipeline:** upload, transcode, CDN delivery for judging.
- **Payments (paid tier only):** processor + wallet ledger + KYC/AML provider. **[LEGAL/RISK]**
- **Infra/scaling:** the founder flagged Cloudflare and similar — CDN, DDoS protection, edge caching, and the ability to scale spec/anti-cheat compute as pools grow. **[OPEN]** specific stack TBD.
- **Data/analytics:** per-spec success tracking, engagement metrics, fraud signals.

---

## 8. Success Metrics (Proposed)

- **Activation:** % of sign-ups who join their first pool.
- **Engagement:** pools entered per active user per week; streak retention.
- **Completion:** % of joined pools that result in a valid submission.
- **Integrity:** fraud-flag rate; % of flags upheld; false-positive rate.
- **Economy:** deposit conversion; platform margin per pool; payout ratio.
- **Spec quality:** completion rate and satisfaction per generated spec.
- **Outcome signal:** profiles viewed by recruiters; interviews/offers attributed (later).

---

## 9. Economic Model — Needs Tightening **[OPEN]**

With **free and paid pools kept separate**, the model is simpler than a mixed pot, but a few things still need defining before build:

- **Free pools:** no cash in or out. Cost to the platform is purely operational (compute, video, infra). What's the budget per free pool and how is it controlled at scale?
- **Paid pools:** the cash prize pot = sum of real-money entries minus the platform's cut. Because no free credit enters paid pools, the house never pays out more than was deposited.
- What is the **platform's cut (rake)** per paid pool?
- **Free credit's role:** it powers the default experience and acts as a try-before-you-pay funnel into paid pools — make that value exchange explicit.
- Refunds, cancelled/under-filled paid pools, and disputed results.
- **[OPEN]** Can a single pool ever mix free and paid entrants, or are the two tiers always fully separate? (Fully separate is strongly recommended — it removes the hardest payout-math and fairness problems.)

**Recommendation:** model 2–3 concrete paid-pool scenarios on a spreadsheet to confirm the rake covers costs and the house never loses, *before* committing to mechanics.

---

## 10. Risks & Critical Considerations

### 10.1 Legal / Regulatory — the big one **[LEGAL/RISK]**
Paid entry + cash prizes is, depending on jurisdiction, potentially regulated as **gambling or a regulated skill-contest**, even when skill-based. This varies significantly by US state and by country, and the **peer-voting** element (which adds subjectivity) can affect how it's classified. Targeting **students — some of whom may be minors** — raises the stakes considerably.

Before building the money features, you'll want professional advice on:
- Whether the model is classified as a contest of skill, sweepstakes, or gambling in your launch jurisdictions.
- Age verification and exclusion of minors from any cash feature.
- KYC/AML obligations and which payment processors will even accept this category.
- Terms of service, dispute handling, and consumer-protection rules.

I'm not a lawyer — this is a flag, not legal advice. Treat it as a gating item for the monetized version.

### 10.2 Responsible design **[RISK]**
"Maximum dopamine" + real money + young users warrants guardrails: deposit/spend limits, cool-down periods, self-exclusion, and clear "this is not a way to make money" messaging. Cheaper to design in now than bolt on later.

### 10.3 Integrity / cheating
Anti-cheat is core to the product's value. If the skill signal isn't trustworthy, recruiters won't trust profiles and the whole proposition weakens. Invest early.

### 10.4 Judging fairness
Peer voting is gameable (collusion, low-effort ranking, popularity bias). Needs structural defenses (see §6.6).

### 10.5 Cold start
Pools need enough participants to be fun and to judge fairly. Plan how the first pools fill (seeded challenges, free entry, campus ambassadors).

---

## 11. Suggested MVP Scope vs. Later

### MVP / v1 (prove both loops, **money-free**)
- Sussex-email sign-up + job role + mandatory GitHub connect.
- **Free pools only** (no cash) to validate engagement and judging — this also sidesteps the legal gating while you validate.
- **Manual pool ingestion** from per-job-role markdown dumps (the simplest way to seed launch content and stay in control of quality).
- AI spec generation (with human approval queue) — can follow manual pools.
- Repo + video submission (Cloudflare Stream).
- Basic anti-cheat (fresh-repo + in-window push verification + duplicate detection).
- Peer voting (randomized, anonymized, judge-to-win) + global rank with per-role leaderboard views.
- **Live 1v1 Code Battles** (XP/Elo only): direct challenges + simple queue, Judge0 judging, battle Elo, battle anti-cheat. Full spec in CLAUDE.md.
- Public-by-default profile with private toggle.

### Phase 2 (money, together, after legal sign-off)
- **Paid pools** and **battle wagers** behind one shared build: wallet, deposits, payouts, KYC/age verification, escrow provider, geo-restriction, responsible-play guardrails.
- Spec self-optimization loop.
- Cloudflare/edge scaling hardening.

### Phase 3
- Recruiter-facing features and discovery.
- Mobile app.
- Seasons (Elo soft-resets), advanced gamification, social features.

---

## 12. Open Questions — RESOLVED (2026-06-10)

All v1-blocking questions were resolved in a founder grilling session. **CLAUDE.md is the binding build spec** carrying these decisions into architecture.

1. ~~Real-money at launch?~~ **No money anywhere in v1.** Free pools *and* XP/Elo-only battles. Paid pools and battle wagers arrive **together** in Phase 2 behind one shared wallet/KYC/escrow build, after legal review.
2. ~~Student verification?~~ **Sussex email IS the login.** Sign-up/sign-in via verified `@sussex.ac.uk` (magic link); the domain check is the enrolment gate. GitHub is a **required connected account**, not the login.
3. ~~Age gating?~~ Deferred to Phase 2 alongside money — v1 has no cash features to gate.
4. ~~Rank model?~~ **Single global pool rank + per-role leaderboard views.** Per-role results are captured from day one, so true per-role ratings remain a cheap later upgrade. Battle Elo is a separate, global rating.
5. ~~Concurrent pools?~~ **Multiple, soft cap 3 active** — helps pools fill at Sussex scale while discouraging join-and-abandon.
6. ~~Repo rule?~~ **Fresh repo required**, created after the pool window opens. Anti-cheat anchors on GitHub's *server-side* signals (repo creation date, push-event timeline) — local commit timestamps are client-set and fakeable.
7. ~~Rake?~~ Phase 2 (no money in v1).
8. ~~Judging model?~~ **Peer ranked-voting is the sole decider in v1**, structurally defended: randomized + anonymized judge assignment, judging duty required to be eligible to win, self-votes impossible by construction. AI/expert weighting reconsidered for Phase 2 paid pools.
9. ~~AI-assisted coding?~~ **Split stance.** Pools: AI tools explicitly **allowed** (the skill measured is shipping); anti-cheat polices *authenticity* — in-window work, no duplicates/plagiarism, you demo your own build. Battles: AI assistance **banned** (the skill measured is raw head-to-head speed); enforced via paste-blocking, focus telemetry, and post-match heuristics.
10. ~~Spec approval?~~ **Yes — approval queue.** AI-drafted pool specs land as drafts; the operator approves or rejects before publish. Relax to spot-checks once per-spec metrics earn trust.
11. ~~Video hosting?~~ **Cloudflare Stream** — direct creator uploads, automatic transcoding, signed playback URLs so only assigned judges can view.
12. ~~Recruiter audience?~~ Post-MVP (Phase 3), unchanged.
13. ~~Manual pools?~~ **Markdown files in the repo** (one per job role, entries delimited with YAML frontmatter: title, role, difficulty, window, requirements) + an **explicit import command** that validates every entry, reports malformed ones, dedupes by slug, and creates pools in *draft* for the same approval queue.
14. ~~Free/paid mixing?~~ Moot in v1; **fully separate** when money ships in Phase 2.

### New decisions from the same session

15. **Live 1v1 Code Battles are in v1** (XP/Elo only, no wagers) — a second competitive mode alongside prize pools. Full battle spec lives in CLAUDE.md.
16. **Pool sizing:** minimum 6 entrants (meaningful judging sets); per-pool cap defined in the spec (default ~30); under-filled at start → one auto-extension (+48h) → auto-cancel with credit refund + notification.
17. **Battle problem bank:** AI-drafted (statement + reference solution + hidden test suite), auto-verified by running the reference solution against its own tests in Judge0, then human-approved before entering the bank. Same draft→approve pattern as pool specs.
18. **Battle entry paths:** direct challenges (username/link) are the primary v1 path; plus a deliberately simple queue (pair queued players, prefer Elo proximity, widen fast) with an online-players list to convert empty waits into challenges.
19. **Profiles:** public by default (the portfolio thesis) with one account-level private toggle; losses appear in aggregate stats only.
20. **Hosting:** one container host (Railway-class) running the Next.js app, Postgres, the WebSocket battle service, and a network-denied Judge0 — with Cloudflare in front (DNS/CDN/DDoS) and Cloudflare Stream for video.

---

*Next step: CLAUDE.md is the binding build spec; the build proceeds in vertical slices from a roadmap. This PRD stays as the product-intent record — update it if intent (not implementation) changes.*
