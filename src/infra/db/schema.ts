import { integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';
import type { JobRole } from '../../domain/identity';
import {
  DEFAULT_ENTRANT_CAP,
  MIN_ENTRANTS,
  type CreditReason,
  type PoolDifficulty,
  type PoolStatus,
} from '../../domain/prize-pools';

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
 * Per-user gamification state (XP/level/rank movement is the M9 kernel's job;
 * the columns exist now so entry guards and M5's credit debit have a home).
 * Kept apart from `users` because Auth.js owns that table's shape.
 */
export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  /** Global pool-rank points — drives difficulty gating (domain/prize-pools/entry). */
  globalRank: integer('global_rank').notNull().default(0),
  /** Free pool-entry credits; grant/debit policy lands with M5's join slice. */
  credits: integer('credits').notNull().default(0),
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

/** One user's membership in one pool. Submission fields arrive with M6. */
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
  },
  (entry) => [unique('entries_pool_user_unique').on(entry.poolId, entry.userId)],
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
