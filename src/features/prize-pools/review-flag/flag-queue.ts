import { asc, eq } from 'drizzle-orm';
import type { OriginalityFlag, SimilarityMatch } from '@/domain/prize-pools';
import { getDb } from '@/infra/db/client';
import { entries, pools, users } from '@/infra/db/schema';

/**
 * The operator's anti-cheat review queue: entries currently `flagged` (awaiting
 * a decision), with the context needed to judge the flag — which pool, which
 * entrant, the repo they linked, and the originality reasons/matches that fired.
 * Upheld/cleared entries have left the queue, same as the draft queue filters
 * rejected drafts.
 */
export interface FlagQueueItem {
  entryId: string;
  poolId: string;
  poolTitle: string;
  entrantLabel: string;
  repoUrl: string | null;
  reasons: OriginalityFlag[];
  matches: SimilarityMatch[];
  flaggedAt: Date | null;
}

export async function listFlaggedEntries(): Promise<FlagQueueItem[]> {
  const rows = await getDb()
    .select({
      entryId: entries.id,
      poolId: pools.id,
      poolTitle: pools.title,
      email: users.email,
      githubUsername: users.githubUsername,
      repoUrl: entries.repoUrl,
      reasons: entries.flagReasons,
      matches: entries.flagMatches,
      flaggedAt: entries.flaggedAt,
    })
    .from(entries)
    .innerJoin(pools, eq(entries.poolId, pools.id))
    .innerJoin(users, eq(entries.userId, users.id))
    .where(eq(entries.moderationStatus, 'flagged'))
    .orderBy(asc(entries.flaggedAt));

  return rows.map((r) => ({
    entryId: r.entryId,
    poolId: r.poolId,
    poolTitle: r.poolTitle,
    entrantLabel: r.githubUsername ?? r.email ?? 'unknown entrant',
    repoUrl: r.repoUrl,
    reasons: r.reasons,
    matches: r.matches,
    flaggedAt: r.flaggedAt,
  }));
}
