import { and, eq } from 'drizzle-orm';
import { getDb } from '@/infra/db/client';
import { listJudgeableEntries } from '@/infra/db/pool-queries';
import { ballots, judgingAssignments, pools } from '@/infra/db/schema';
import type { CastVoteDeps, JudgingContext } from './cast-vote';

/**
 * Real DB wiring for cast-vote. The judging context gathers everything the
 * kernel gates need: the pool status, THIS judge's assigned set, the full
 * judgeable set (what checkBallot validates against), and whether they've
 * already voted. recordBallot is conflict-safe on the (pool,judge) unique index,
 * so a double-submit lands at most one ballot.
 */
export function makeCastVoteDeps(): CastVoteDeps {
  return {
    loadJudgingContext: async (userId, poolId): Promise<JudgingContext | null> => {
      const db = getDb();
      const pool = await db.query.pools.findFirst({ where: eq(pools.id, poolId) });
      if (!pool) return null;

      const assigned = await db
        .select({ entryId: judgingAssignments.entryId })
        .from(judgingAssignments)
        .where(
          and(eq(judgingAssignments.poolId, poolId), eq(judgingAssignments.judgeUserId, userId)),
        );

      const judgeable = await listJudgeableEntries(poolId);
      const existingBallot = await db.query.ballots.findFirst({
        where: and(eq(ballots.poolId, poolId), eq(ballots.judgeUserId, userId)),
      });

      return {
        poolStatus: pool.status,
        assignedEntryIds: assigned.map((a) => a.entryId),
        judgedEntries: judgeable.map((e) => ({ entryId: e.entryId, ownerId: e.userId })),
        alreadyVoted: existingBallot !== undefined,
      };
    },

    recordBallot: async (ballot) => {
      await getDb()
        .insert(ballots)
        .values({
          poolId: ballot.poolId,
          judgeUserId: ballot.judgeUserId,
          ranking: ballot.ranking,
          submittedAt: ballot.submittedAt,
        })
        .onConflictDoNothing();
    },
  };
}
