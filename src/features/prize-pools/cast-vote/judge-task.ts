import { and, asc, eq } from 'drizzle-orm';
import type { PoolStatus } from '@/domain/prize-pools';
import { getDb } from '@/infra/db/client';
import { ballots, entries, judgingAssignments, pools } from '@/infra/db/schema';
import { makeAssignJudgesDeps } from '../assign-judges/assign-deps';
import { ensurePoolAssignments } from '../assign-judges/assign-judges';

/**
 * Read model for the judging page: this judge's anonymised review set for a
 * pool, plus the state the page branches on. Reaching it lazily ENSURES the
 * pool's assignments exist (idempotent, deterministic) so a judge can never open
 * the page before the cron has assigned — same lazy-materialise pattern as
 * ensureProfile. Anonymity is structural: submissions are ordered by entry id
 * (random UUIDs — no owner signal) and labelled A, B, C…; the playback URL is
 * only ever returned for entries THIS judge was assigned, which is the
 * server-side "only assigned judges can view a submission" rule.
 */

export interface JudgeSubmissionView {
  entryId: string;
  /** "Submission A" — anonymised display handle, never the entrant. */
  label: string;
  videoPlaybackUrl: string | null;
}

export interface JudgingTask {
  poolId: string;
  poolTitle: string;
  status: PoolStatus;
  isEntrant: boolean;
  alreadyVoted: boolean;
  /** The demos to rank; empty unless the pool is judging and this judge is assigned. */
  submissions: JudgeSubmissionView[];
}

export async function getJudgingTask(userId: string, poolId: string): Promise<JudgingTask | null> {
  const db = getDb();
  const pool = await db.query.pools.findFirst({ where: eq(pools.id, poolId) });
  if (!pool || pool.status === 'draft') return null;

  const myEntry = await db.query.entries.findFirst({
    where: and(eq(entries.poolId, poolId), eq(entries.userId, userId)),
  });

  // Lazily generate the round's assignments the moment judging is live, so the
  // page never races the cron. No-op once they exist / if the pool's too small.
  if (pool.status === 'judging') {
    await ensurePoolAssignments(makeAssignJudgesDeps(), poolId);
  }

  const assignedRows =
    pool.status === 'judging'
      ? await db
          .select({ entryId: entries.id, videoPlaybackUrl: entries.videoPlaybackUrl })
          .from(judgingAssignments)
          .innerJoin(entries, eq(judgingAssignments.entryId, entries.id))
          .where(
            and(eq(judgingAssignments.poolId, poolId), eq(judgingAssignments.judgeUserId, userId)),
          )
          .orderBy(asc(entries.id))
      : [];

  const myBallot = await db.query.ballots.findFirst({
    where: and(eq(ballots.poolId, poolId), eq(ballots.judgeUserId, userId)),
  });

  return {
    poolId,
    poolTitle: pool.title,
    status: pool.status,
    isEntrant: myEntry !== undefined,
    alreadyVoted: myBallot !== undefined,
    submissions: assignedRows.map((row, i) => ({
      entryId: row.entryId,
      label: `Submission ${String.fromCharCode(65 + i)}`,
      videoPlaybackUrl: row.videoPlaybackUrl,
    })),
  };
}
