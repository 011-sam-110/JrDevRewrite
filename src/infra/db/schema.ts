import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';
import type { JobRole } from '../../domain/identity';
import {
  DEFAULT_ENTRANT_CAP,
  MIN_ENTRANTS,
  type CreditReason,
  type ModerationStatus,
  type OriginalityFlag,
  type PoolDifficulty,
  type PoolStatus,
  type SimilarityMatch,
} from '../../domain/prize-pools';
import { ELO_START, type BattleXpResult, type ProfileVisibility } from '../../domain/gamification';
import {
  DEFAULT_TIME_LIMIT_SECONDS,
  type BattleLanguage,
  type BattleOutcome,
  type BattleStatus,
  type ForfeitReason,
  type HiddenTest,
  type PlayerSide,
  type ProblemStatus,
  type ProblemTier,
} from '../../domain/battles';
import type { MatchTelemetryRecord } from '../../lib/match-events';

/** Trivial first table proving the migration pipeline end to end (M0). */
export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/*
 * Identity (M2) — the four tables Auth.js's Drizzle adapter expects
 * (users / accounts / sessions / verification_tokens), with our columns on
 * users. M4 adds profiles/pools/entries alongside these.
 */

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date', withTimezone: true }),
  image: text('image'),
  /** Launch job role id (domain/identity/job-roles) — null until onboarding. */
  jobRole: text('job_role'),
  /** Denormalized for display; the authoritative link is the accounts row. */
  githubUsername: text('github_username'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** External provider links — the GitHub connection lives here as provider='github'. */
export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
});

/*
 * Prize pools (M4) — pools/entries persist the M3 kernel's world; profiles
 * carry the per-user gamification numbers the entry guards read. Typed end to
 * end: status/role/difficulty columns reuse the kernel's union types, so a
 * value the kernel doesn't know can't be written without the compiler
 * noticing.
 */

/**
 * Per-user gamification state. The XP/level/rank/streak numbers move when a pool
 * CLOSES (the M9 close-pool slice awards them atomically from pool_results); the
 * entry guards and M5's credit debit read them. Kept apart from `users` because
 * Auth.js owns that table's shape.
 */
export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  /** Global pool-rank points — drives difficulty gating (domain/prize-pools/entry). */
  globalRank: integer('global_rank').notNull().default(0),
  /** Consecutive CLOSED pools completed (domain/gamification advanceStreak). */
  poolStreak: integer('pool_streak').notNull().default(0),
  /**
   * Profile visibility (M10) — public by default (the recruiter-facing portfolio
   * is the thesis); private hides the account from every public surface (other
   * users' profile view, leaderboards, search). The value space is the kernel's
   * union (domain/gamification/visibility), gated by the toggle-privacy slice.
   */
  visibility: text('visibility').$type<ProfileVisibility>().notNull().default('public'),
  /** Free pool-entry credits; grant/debit policy lands with M5's join slice. */
  credits: integer('credits').notNull().default(0),
  /**
   * Battle Elo (M15) — the SEPARATE, can-go-down rating (pool rank is purely
   * additive by design). Moves only through the resolve-battle slice applying
   * the kernel's `applyBattleElo`; `battleGames` feeds the provisional
   * K-factor; `battleStreak` is the battle participation streak.
   */
  elo: integer('elo').notNull().default(ELO_START),
  battleGames: integer('battle_games').notNull().default(0),
  battleStreak: integer('battle_streak').notNull().default(0),
  /** Presence heartbeat (M15) — touched by the battles lobby; "online" is recency. */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pools = pgTable('pools', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Durable identifier from the spec — imports dedupe on it. */
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  role: text('role').$type<JobRole>().notNull(),
  difficulty: text('difficulty').$type<PoolDifficulty>().notNull(),
  status: text('status').$type<PoolStatus>().notNull().default('draft'),
  /** Both sources produce the identical pool object (binding v1 rule). */
  source: text('source').$type<'manual' | 'ai'>().notNull(),
  /** The project brief — markdown body of the spec entry. */
  brief: text('brief').notNull(),
  requirements: jsonb('requirements').$type<string[]>().notNull(),
  /**
   * Window DURATIONS from the spec; the concrete deadlines are computed by
   * domain/prize-pools/schedule at approval time and stay null until then.
   */
  joinWindowHours: integer('join_window_hours').notNull(),
  buildWindowHours: integer('build_window_hours').notNull(),
  judgingWindowHours: integer('judging_window_hours').notNull(),
  entrantCap: integer('entrant_cap').notNull().default(DEFAULT_ENTRANT_CAP),
  minEntrants: integer('min_entrants').notNull().default(MIN_ENTRANTS),
  extensionsUsed: integer('extensions_used').notNull().default(0),
  joinDeadline: timestamp('join_deadline', { withTimezone: true }),
  buildDeadline: timestamp('build_deadline', { withTimezone: true }),
  judgingDeadline: timestamp('judging_deadline', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  /**
   * Operator rejection is archival metadata, not a lifecycle state: the kernel
   * state machine never sees rejected drafts (they stay `draft`, filtered out
   * of every queue), and the row survives so re-importing the same slug
   * doesn't resurrect a spec the operator already declined.
   */
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One user's membership in one pool. The submission fields (M6) are null until
 * the entrant submits during the build window: the linked competition repo, the
 * repo's GitHub-side creation time (captured at verification, kept for audit /
 * M7 re-checks), and the demo-video ref. `submittedAt` set = a complete entry.
 *
 * The moderation fields (M7) carry the anti-cheat flag lifecycle
 * (domain/prize-pools/moderation): `moderationStatus` gates judging eligibility
 * (none/cleared judgeable; flagged/upheld excluded), and the reasons/matches/
 * timestamps are the evidence the operator reviews. Defaults make every
 * pre-M7 row (and every fresh entry) judgeable until a scan says otherwise.
 */
export const entries = pgTable(
  'entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    /** Linked competition repo (HTTPS URL), set at submission. */
    repoUrl: text('repo_url'),
    /** GitHub's server-side repo creation time at verification (audit trail). */
    repoCreatedAt: timestamp('repo_created_at', { withTimezone: true }),
    /** Demo-video asset id + playback URL (Cloudflare Stream; dev: local file). */
    videoId: text('video_id'),
    videoPlaybackUrl: text('video_playback_url'),
    /** When the entry was submitted (repo verified + video stored). */
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Anti-cheat flag state (M7); the value space is the kernel's union. */
    moderationStatus: text('moderation_status').$type<ModerationStatus>().notNull().default('none'),
    /** Which originality flags fired, for the operator's review context. */
    flagReasons: jsonb('flag_reasons').$type<OriginalityFlag[]>().notNull().default([]),
    /** The offending similar entries + scores that triggered the flag. */
    flagMatches: jsonb('flag_matches').$type<SimilarityMatch[]>().notNull().default([]),
    /** When the scan raised the flag. */
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    /** When the operator upheld/cleared it. */
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (entry) => [unique('entries_pool_user_unique').on(entry.poolId, entry.userId)],
);

/**
 * Judge assignments (M8) — the randomized, anonymized review duty: one row per
 * (judge, entry) pair the judge must rank. Generated by the assign-judges slice
 * from the kernel's `assignJudges` at the `building → judging` transition;
 * deterministic (seeded by pool id), so the unique index lets a re-run upsert
 * the identical set rather than duplicate it. `entryId` is the entry under
 * review; the judge is `judgeUserId` (always an entrant who submitted a
 * judgeable entry — never reviewing their own, by construction).
 */
export const judgingAssignments = pgTable(
  'judging_assignments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    judgeUserId: text('judge_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (a) => [unique('judging_assignment_unique').on(a.poolId, a.judgeUserId, a.entryId)],
);

/**
 * Judging ballots (M8) — one submitted ranking per judge per pool. `ranking` is
 * the ordered list of entry ids (best first) covering exactly the judge's
 * assigned set (enforced by the kernel's checkAssignmentBallot at cast time).
 * A row existing here IS "this judge completed their duty" — the signal that
 * feeds judge-to-win eligibility in vote-aggregation. The unique (pool, judge)
 * index makes voting idempotent/at-most-once.
 */
export const ballots = pgTable(
  'ballots',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    judgeUserId: text('judge_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Entry ids, best first — a permutation of the judge's assigned set. */
    ranking: jsonb('ranking').$type<string[]>().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (b) => [unique('ballot_pool_judge_unique').on(b.poolId, b.judgeUserId)],
);

/**
 * Finalized pool results (M9) — one row per entrant, written atomically when a
 * pool CLOSES (the close-pool slice executing the `finalize-results` lifecycle
 * effect). The unique (pool, user) index is the idempotency lock: XP and rank
 * points are awarded exactly once even if the close runs twice (crash recovery,
 * a double cron tick). The row both feeds the reveal page (placement + score)
 * and is the audit trail for the gamification numbers it moved on the profile
 * (xp/rank/streak granted by this pool).
 */
export const poolResults = pgTable(
  'pool_results',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 1-based placement among eligible finishers; null if they didn't place. */
    placement: integer('placement'),
    /** Mean normalized Borda score in [0,1]; 0 if the entry wasn't judged. */
    score: real('score').notNull().default(0),
    eligibleToWin: boolean('eligible_to_win').notNull(),
    submitted: boolean('submitted').notNull(),
    judged: boolean('judged').notNull(),
    /** XP this pool granted (pool-local base + streak bonus). */
    xpAwarded: integer('xp_awarded').notNull(),
    /** Global-rank points this pool granted. */
    rankAwarded: integer('rank_awarded').notNull(),
    /** The participation streak after this pool — audit of the streak math. */
    streakAfter: integer('streak_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (r) => [unique('pool_results_pool_user_unique').on(r.poolId, r.userId)],
);

/**
 * Credit ledger (M5) — one row per credit movement, amounts derived from the
 * kernel's `creditDelta` so policy and bookkeeping can't drift. The cached
 * balance lives on `profiles.credits`; the ledger is the audit trail AND the
 * idempotency lock: the unique (user, pool, reason) index makes a double
 * debit or double refund for the same pool a constraint violation, so a
 * crashed-and-rerun lifecycle job can't refund anyone twice.
 */
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null for movements not tied to a pool (the starting grant). */
    poolId: text('pool_id').references(() => pools.id, { onDelete: 'cascade' }),
    /** Signed: grants/refunds positive, joins negative. */
    amount: integer('amount').notNull(),
    reason: text('reason').$type<CreditReason>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (tx) => [unique('credit_tx_user_pool_reason_unique').on(tx.userId, tx.poolId, tx.reason)],
);

/**
 * Battle problem bank (M12) — the bank of solvable problems a live battle is
 * drawn from. One row per problem, status `draft → approved → retired`
 * (domain/battles/problems): a draft is awaiting machine verification +
 * operator approval, approved is playable, retired is rotated out (leaked or
 * stale, kept for history). The pipeline is "AI-drafted, machine-verified,
 * human-approved" — a draft reaches `approved` only after its reference
 * solution passes its own hidden tests in Judge0 AND an operator approves.
 *
 * Typed end to end: `tier`/`status`/`referenceLanguage` reuse the kernel's
 * union types, so a value the kernel doesn't know can't be written; hidden
 * tests are the jsonb IO pairs the judge feeds (input on stdin, expected on
 * stdout). `slug` is the durable identifier the seed pipeline dedupes on (the
 * same role as pool slugs). Problems are LANGUAGE-AGNOSTIC stdin/stdout: one
 * reference solution (in `referenceLanguage`) verifies the tests; players may
 * answer in any supported language (M15).
 */
export const problems = pgTable('problems', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  /** Full problem statement, markdown. */
  statementMd: text('statement_md').notNull(),
  /** Difficulty tier (3 tiers) — the kernel union, distinct from pool difficulty. */
  tier: text('tier').$type<ProblemTier>().notNull(),
  status: text('status').$type<ProblemStatus>().notNull().default('draft'),
  /** Where the draft came from — curated fixture library or the AI drafter. */
  source: text('source').$type<'curated' | 'ai'>().notNull(),
  /** Language the reference solution is written in (the kernel union). */
  referenceLanguage: text('reference_language').$type<BattleLanguage>().notNull(),
  /** The reference solution source — must pass its own hidden tests to be approvable. */
  referenceSolution: text('reference_solution').notNull(),
  /** Hidden tests as IO pairs (input on stdin, expected stdout). */
  hiddenTests: jsonb('hidden_tests').$type<HiddenTest[]>().notNull(),
  /**
   * When the reference solution last passed its own hidden tests (machine
   * verification). Null until verified; the approve gate requires it set.
   */
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  /** When an operator approved the draft into the playable bank. */
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  /**
   * Operator rejection is archival metadata, not a status (the pools
   * `rejectedAt` pattern): the row keeps status `draft`, drops out of the draft
   * queue, and its slug stays claimed so a re-draft can't resurrect it.
   */
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  /** When the problem was rotated out of the bank (leaked/stale) — status `retired`. */
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/*
 * Live Code Battles (M15) — battles/submissions/results/queue persist the M11
 * kernel's world. The DB row is the AUTHORITATIVE record: the realtime room is
 * an in-memory mirror loaded from here on first join, and every settlement
 * lands here through the resolve-battle slice before anything is broadcast.
 */

/**
 * One 1v1 battle. Status mirrors the kernel union; mid-flight transitions
 * (countdown/live + goAt) are written by the realtime effects executor so a
 * restarted service can rebuild the room, and the settled fields (winnerSide/
 * outcome/forfeitReason/resolvedAt) are written exactly once by the
 * resolve-battle slice — its conditional status UPDATE is the idempotency
 * lock (first settler wins; everyone else sees 0 rows and stands down).
 */
export const battles = pgTable('battles', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  status: text('status').$type<BattleStatus>().notNull().default('challenged'),
  /** Which entry path made it — an accepted challenge or the queue pairing. */
  source: text('source').$type<'challenge' | 'queue'>().notNull(),
  /** Seat a = the challenger / longer-waiting queue ticket; fixed for life. */
  playerAId: text('player_a_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  playerBId: text('player_b_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Drawn from the approved bank at the matched transition; null while pending. */
  problemId: text('problem_id').references(() => problems.id, { onDelete: 'set null' }),
  timeLimitSeconds: integer('time_limit_seconds').notNull().default(DEFAULT_TIME_LIMIT_SECONDS),
  /** Kernel-stamped instants — null until their transition happens. */
  readyDeadline: timestamp('ready_deadline', { withTimezone: true }),
  goAt: timestamp('go_at', { withTimezone: true }),
  /** Settled outcome: which seat won (null = draw, void, or not yet settled). */
  winnerSide: text('winner_side').$type<PlayerSide>(),
  /** How a `resolved` battle concluded (the scoring kernel's outcome kind). */
  outcome: text('outcome').$type<BattleOutcome['kind']>(),
  forfeitReason: text('forfeit_reason').$type<ForfeitReason>(),
  /** The room's server-stamped anti-cheat log, persisted at settlement (M16 reads). */
  telemetry: jsonb('telemetry').$type<MatchTelemetryRecord[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  matchedAt: timestamp('matched_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

/**
 * Every judged submission, kept in full (CLAUDE.md → battle anti-cheat:
 * "full submission history retained") — the scoring kernel's input, the M16
 * plagiarism-diff corpus, and the audit trail behind a decisive win.
 * `atSeconds` is seconds-from-go as the slice stamped it server-side.
 */
export const battleSubmissions = pgTable('battle_submissions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  battleId: text('battle_id')
    .notNull()
    .references(() => battles.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  side: text('side').$type<PlayerSide>().notNull(),
  language: text('language').$type<BattleLanguage>().notNull(),
  code: text('code').notNull(),
  atSeconds: integer('at_seconds').notNull(),
  testsPassed: integer('tests_passed').notNull(),
  testsTotal: integer('tests_total').notNull(),
  passedAll: boolean('passed_all').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-player settled outcome — the battle twin of `pool_results`: one row per
 * player written atomically at settlement, unique (battle, user) as the
 * idempotency lock, and the audit trail for every Elo/XP/streak movement
 * (eloBefore/eloAfter pin exactly what `applyBattleElo` did). Voided battles
 * write NO rows — nothing happened, nothing is rated (binding).
 */
export const battleResults = pgTable(
  'battle_results',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    side: text('side').$type<PlayerSide>().notNull(),
    result: text('result').$type<BattleXpResult>().notNull(),
    eloBefore: integer('elo_before').notNull(),
    eloAfter: integer('elo_after').notNull(),
    xpAwarded: integer('xp_awarded').notNull(),
    streakAfter: integer('streak_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (r) => [unique('battle_results_battle_user_unique').on(r.battleId, r.userId)],
);

/**
 * The battle queue — one row per waiting player (PK = at most one ticket
 * each). The matchmaking tick in the realtime service reads these, runs the
 * pure `pairQueue`, and deletes paired rows in the same transaction that
 * creates their battle. Elo is read fresh from profiles at pairing time.
 */
export const battleQueue = pgTable('battle_queue', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).defaultNow().notNull(),
});

/** One-time magic-link tokens (hashed by Auth.js before storage). */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);
