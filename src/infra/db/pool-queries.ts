import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import type { JobRole } from '../../domain/identity';
import {
  ACTIVE_POOL_STATUSES,
  JUDGING_EXCLUDED_STATUSES,
  type JoinCandidate,
} from '../../domain/prize-pools';
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

/**
 * The entries eligible to be judged in a pool: submitted AND not excluded by
 * anti-cheat (kernel rule — flagged/upheld are out; none/cleared are in). This
 * is the structural enforcement of "flagged submissions are excluded from
 * judging/results pending review" — M8 builds its randomized judge assignment
 * from THIS set, so a flagged entry is never put in front of a judge in the
 * first place. `notInArray` over the excluded statuses (rather than `in
 * none/cleared`) keeps it correct if more judgeable statuses ever appear.
 */
export interface JudgeableEntry {
  entryId: string;
  userId: string;
}

export async function listJudgeableEntries(poolId: string): Promise<JudgeableEntry[]> {
  const rows = await getDb()
    .select({ entryId: entries.id, userId: entries.userId, status: entries.moderationStatus })
    .from(entries)
    .where(and(eq(entries.poolId, poolId), isNotNull(entries.submittedAt)));
  // Filter in app code against the kernel's excluded-status list so the rule
  // lives in one place (domain/prize-pools/moderation), not duplicated in SQL.
  return rows
    .filter((r) => !JUDGING_EXCLUDED_STATUSES.includes(r.status))
    .map((r) => ({ entryId: r.entryId, userId: r.userId }));
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
