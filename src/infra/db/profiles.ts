import { eq } from 'drizzle-orm';
import { creditDelta, STARTING_CREDITS } from '../../domain/prize-pools';
import { getDb } from './client';
import { creditTransactions, profiles } from './schema';

/**
 * The one way a profile row comes into existence. PRD §6.9 grants the free
 * starter credit "on sign-up"; we realize that lazily on first touch (first
 * pools page view or join attempt), which is equivalent and saves a hook in
 * the auth flow. Idempotent under races: the profiles PK makes the second
 * concurrent insert a no-op, and only the connection that actually inserted
 * the row writes the grant ledger line — so exactly one grant per account.
 */
export type ProfileRow = typeof profiles.$inferSelect;

export async function ensureProfile(userId: string): Promise<ProfileRow> {
  const db = getDb();

  const inserted = await db
    .insert(profiles)
    .values({ userId, credits: STARTING_CREDITS })
    .onConflictDoNothing()
    .returning();

  const created = inserted[0];
  if (created) {
    await db.insert(creditTransactions).values({
      userId,
      amount: creditDelta('starting-grant'),
      reason: 'starting-grant',
    });
    return created;
  }

  const existing = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
  if (!existing) throw new Error(`profile for ${userId} vanished mid-ensure`);
  return existing;
}
