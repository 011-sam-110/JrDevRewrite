import { eq, sql } from 'drizzle-orm';
import { advanceStreak, levelForXp, streakXp } from '../../../domain/gamification';
import type { Ballot } from '../../../domain/prize-pools';
import { getDb } from '../../../infra/db/client';
import { listJudgeableEntries } from '../../../infra/db/pool-queries';
import { ensureProfile } from '../../../infra/db/profiles';
import { ballots, entries, poolResults, pools, profiles } from '../../../infra/db/schema';
import type { ClosePoolDeps, CloseContext } from './close-pool';

/**
 * Real DB wiring for close-pool, shared by the `pools:tick` cron's
 * finalize-results effect. Relative imports (no `@/`) so it runs under the tsx
 * CLI — same constraint as tick-pools / assign-deps.
 *
 * `finalizeResults` is where the RACE-SAFE, IDEMPOTENT half lives. For each
 * entrant, in its own transaction:
 *   - lock the profile row (FOR UPDATE) — serializes the rare case of one user
 *     finishing two pools in the same tick, so streak/level read fresh state;
 *   - compute the streak bonus + new level from THAT locked read (pure kernel);
 *   - insert the result row (unique on pool+user → the idempotency lock) and
 *     bump the profile ONLY if the insert actually wrote. A re-run inserts
 *     nothing and touches no profile, so XP/rank land exactly once.
 * Result-insert and profile-bump share the transaction, so they commit together
 * or not at all — no half-awarded entrant survives a crash.
 */
export function makeClosePoolDeps(): ClosePoolDeps {
  return {
    loadCloseContext: async (poolId): Promise<CloseContext | null> => {
      const db = getDb();
      const pool = await db.query.pools.findFirst({ where: eq(pools.id, poolId) });
      if (!pool) return null;

      const entrantRows = await db
        .select({
          userId: entries.userId,
          entryId: entries.id,
          submittedAt: entries.submittedAt,
          moderationStatus: entries.moderationStatus,
        })
        .from(entries)
        .where(eq(entries.poolId, poolId));

      // The judgeable field (submitted + anti-cheat-cleared) and every cast
      // ballot — exactly what aggregateVotes needs, after reconciliation.
      const judgeable = await listJudgeableEntries(poolId);
      const ballotRows = await db
        .select({ judgeUserId: ballots.judgeUserId, ranking: ballots.ranking })
        .from(ballots)
        .where(eq(ballots.poolId, poolId));

      return {
        difficulty: pool.difficulty,
        entrants: entrantRows.map((r) => ({
          userId: r.userId,
          entryId: r.entryId,
          hasSubmission: r.submittedAt != null,
          moderationStatus: r.moderationStatus,
        })),
        judgedEntries: judgeable.map((e) => ({ entryId: e.entryId, ownerId: e.userId })),
        ballots: ballotRows.map((b): Ballot => ({ judgeId: b.judgeUserId, ranking: b.ranking })),
      };
    },

    finalizeResults: async (poolId, awards) => {
      let finalized = 0;
      for (const award of awards) {
        // Entrants seeded directly (e2e) or who never opened /pools may lack a
        // profile row; create it (with its ledger grant) before we lock it.
        await ensureProfile(award.userId);

        await getDb().transaction(async (tx) => {
          const [prof] = await tx
            .select({ xp: profiles.xp, poolStreak: profiles.poolStreak })
            .from(profiles)
            .where(eq(profiles.userId, award.userId))
            .for('update');
          if (!prof) throw new Error(`profile ${award.userId} vanished mid-finalize`);

          const newStreak = advanceStreak(prof.poolStreak, award.submitted);
          const totalXp = award.baseXp + streakXp(newStreak);
          const newXp = prof.xp + totalXp;
          const newLevel = levelForXp(newXp);

          const inserted = await tx
            .insert(poolResults)
            .values({
              poolId,
              entryId: award.entryId,
              userId: award.userId,
              placement: award.placement,
              score: award.score,
              eligibleToWin: award.placement != null,
              submitted: award.submitted,
              judged: award.judged,
              xpAwarded: totalXp,
              rankAwarded: award.rankPoints,
              streakAfter: newStreak,
            })
            .onConflictDoNothing()
            .returning({ id: poolResults.id });
          if (inserted.length === 0) return; // already finalized for this user

          await tx
            .update(profiles)
            .set({
              xp: newXp,
              level: newLevel,
              globalRank: sql`${profiles.globalRank} + ${award.rankPoints}`,
              poolStreak: newStreak,
              updatedAt: new Date(),
            })
            .where(eq(profiles.userId, award.userId));
          finalized++;
        });
      }
      return { finalized };
    },
  };
}
