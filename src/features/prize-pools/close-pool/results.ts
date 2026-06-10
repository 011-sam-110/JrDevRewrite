import { eq } from 'drizzle-orm';
import type { PoolStatus } from '@/domain/prize-pools';
import { getDb } from '@/infra/db/client';
import { poolResults, pools, profiles, users } from '@/infra/db/schema';

/**
 * Read model for the results-reveal page. Results only exist once the pool has
 * CLOSED and the cron's finalize-results effect has written pool_results — until
 * then this returns an empty standings list and the page shows "results aren't
 * in yet". (We never finalize here: closing is a time-driven transition owned by
 * the scheduled job, never a page GET — CLAUDE.md.)
 *
 * Anonymity ends at close: the reveal is the point of the product (the
 * recruiter-facing portfolio), so entrants are shown by their public handle.
 */

export interface ResultRow {
  userId: string;
  /** Public handle — GitHub username, falling back to the email local part. */
  handle: string;
  /** 1-based placement among eligible finishers; null if they didn't place. */
  placement: number | null;
  score: number;
  eligibleToWin: boolean;
  submitted: boolean;
  judged: boolean;
  xpAwarded: number;
  rankAwarded: number;
  isMe: boolean;
}

export interface PoolResultsView {
  poolId: string;
  poolTitle: string;
  status: PoolStatus;
  /** Eligible finishers first (by placement), then the rest by score. */
  standings: ResultRow[];
  /** The viewer's own row, if they entered the pool. */
  me: ResultRow | null;
  /** The viewer's profile AFTER this pool — for the "you earned" panel. */
  myProfile: { level: number; xp: number; globalRank: number; poolStreak: number } | null;
}

export async function getPoolResults(
  userId: string,
  poolId: string,
): Promise<PoolResultsView | null> {
  const db = getDb();
  const pool = await db.query.pools.findFirst({ where: eq(pools.id, poolId) });
  // Drafts are operator-only; everything else can have (or be building toward) results.
  if (!pool || pool.status === 'draft') return null;

  const rows = await db
    .select({
      userId: poolResults.userId,
      placement: poolResults.placement,
      score: poolResults.score,
      eligibleToWin: poolResults.eligibleToWin,
      submitted: poolResults.submitted,
      judged: poolResults.judged,
      xpAwarded: poolResults.xpAwarded,
      rankAwarded: poolResults.rankAwarded,
      githubUsername: users.githubUsername,
      email: users.email,
    })
    .from(poolResults)
    .innerJoin(users, eq(poolResults.userId, users.id))
    .where(eq(poolResults.poolId, poolId));

  const standings = rows
    .map(
      (r): ResultRow => ({
        userId: r.userId,
        handle: r.githubUsername ?? localPart(r.email),
        placement: r.placement,
        score: r.score,
        eligibleToWin: r.eligibleToWin,
        submitted: r.submitted,
        judged: r.judged,
        xpAwarded: r.xpAwarded,
        rankAwarded: r.rankAwarded,
        isMe: r.userId === userId,
      }),
    )
    .sort(byPlacementThenScore);

  const me = standings.find((s) => s.isMe) ?? null;
  const myProfileRow = me
    ? await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) })
    : null;

  return {
    poolId,
    poolTitle: pool.title,
    status: pool.status,
    standings,
    me,
    myProfile: myProfileRow
      ? {
          level: myProfileRow.level,
          xp: myProfileRow.xp,
          globalRank: myProfileRow.globalRank,
          poolStreak: myProfileRow.poolStreak,
        }
      : null,
  };
}

/** Eligible finishers ranked by placement; everyone else after, by score desc. */
function byPlacementThenScore(a: ResultRow, b: ResultRow): number {
  if (a.placement != null && b.placement != null) return a.placement - b.placement;
  if (a.placement != null) return -1;
  if (b.placement != null) return 1;
  return b.score - a.score;
}

function localPart(email: string | null): string {
  return email?.split('@')[0] ?? 'anonymous';
}
