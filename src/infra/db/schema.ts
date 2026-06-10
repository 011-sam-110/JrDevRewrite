import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

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
