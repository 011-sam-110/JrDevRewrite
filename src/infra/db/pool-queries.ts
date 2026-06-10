import { and, count, eq, inArray } from 'drizzle-orm';
import type { JobRole } from '../../domain/identity';
import { ACTIVE_POOL_STATUSES, type JoinCandidate } from '../../domain/prize-pools';
import { getDb } from './client';
import { entries, pools } from './schema';
import { ensureProfile } from './profiles';

/**
 * Shared pool reads. Both the browse-pools pages and the join-pool action
 * need the same JoinCandidate assembly — sharing it HERE (the infra seam)
 * instead of one slice importing the other keeps the slices independent.
 */

/** Entrant counts for a set of pools, in one grouped query. */
export async function countEntrants(poolIds: string[]): Promise<Map<string, number>> {
  if (poolIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ poolId: entries.poolId, value: count() })
    .from(entries)
    .where(inArray(entries.poolId, poolIds))
    .groupBy(entries.poolId);
  return new Map(rows.map((r) => [r.poolId, r.value]));
}

/** How many of the user's pools count against the cap (kernel's status list). */
export async function countActivePools(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(entries)
    .innerJoin(pools, eq(entries.poolId, pools.id))
    .where(and(eq(entries.userId, userId), inArray(pools.status, [...ACTIVE_POOL_STATUSES])));
  return rows[0]?.value ?? 0;
}

/**
 * Everything the kernel's checkJoin needs to know about the user, against one
 * target pool. Touching this also materializes the profile (starter-credit
 * grant on first touch — see infra/db/profiles).
 */
export async function loadJoinCandidate(
  userId: string,
  jobRole: JobRole,
  poolId: string,
): Promise<JoinCandidate> {
  const db = getDb();
  const profile = await ensureProfile(userId);
  const activePoolCount = await countActivePools(userId);

  const existing = await db.query.entries.findFirst({
    where: and(eq(entries.poolId, poolId), eq(entries.userId, userId)),
  });

  return {
    jobRole,
    globalRank: profile.globalRank,
    activePoolCount,
    credits: profile.credits,
    alreadyEntered: existing !== undefined,
  };
}
