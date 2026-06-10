import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Trivial first table proving the migration pipeline end to end (M0).
 * The real schema (users, profiles, pools, entries, ...) lands in M4.
 */
export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
