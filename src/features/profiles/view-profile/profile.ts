import { desc, eq } from 'drizzle-orm';
import {
  badgeStatsFrom,
  canViewProfile,
  DEFAULT_VISIBILITY,
  earnedBadges,
  levelProgress,
  type BadgeDef,
  type LevelProgress,
  type ProfileVisibility,
} from '@/domain/gamification';
import type { PoolDifficulty } from '@/domain/prize-pools';
import { getDb } from '@/infra/db/client';
import { poolResults, pools, profiles, users } from '@/infra/db/schema';

/**
 * Read model for the public profile page — the recruiter-facing portfolio
 * (CLAUDE.md → Profiles). Resolves a public handle (the linked GitHub username)
 * to its owner, then assembles the identity surface: level/XP/rank/streak, the
 * aggregate win/podium/ship stats, earned badges, and competition history.
 *
 * Two product rules are enforced HERE, in the read model, not left to the UI:
 *   - Privacy: a private profile is only assembled for its owner; for anyone
 *     else this returns `{ kind: 'private' }` and the page shows the notice
 *     (kernel `canViewProfile`).
 *   - "Losses appear in aggregate stats only": a non-podium placement is counted
 *     into the aggregate stats but its rank is stripped from the history row, so
 *     the timeline never displays "you came 9th". Wins and podiums show proudly.
 */

export interface ProfileHistoryEntry {
  poolId: string;
  poolTitle: string;
  role: string;
  difficulty: PoolDifficulty;
  /** Placement ONLY for podium finishes; null otherwise (losses stay aggregate). */
  podiumPlacement: number | null;
  won: boolean;
  submitted: boolean;
  xpAwarded: number;
  /** When the pool closed (the result row was finalized), ISO date. */
  date: string;
}

export interface ProfileView {
  userId: string;
  handle: string;
  githubUsername: string | null;
  jobRole: string | null;
  visibility: ProfileVisibility;
  isOwner: boolean;
  level: number;
  xp: number;
  progress: LevelProgress;
  globalRank: number;
  poolStreak: number;
  stats: {
    poolsEntered: number;
    poolsSubmitted: number;
    wins: number;
    podiums: number;
  };
  badges: BadgeDef[];
  history: ProfileHistoryEntry[];
}

export type ProfileLookup =
  | { kind: 'not-found' }
  | { kind: 'private'; handle: string }
  | { kind: 'ok'; profile: ProfileView };

const PODIUM_CUTOFF = 3;

export async function getProfileByHandle(
  handle: string,
  viewerUserId: string | null,
): Promise<ProfileLookup> {
  const db = getDb();

  const user = await db.query.users.findFirst({ where: eq(users.githubUsername, handle) });
  if (!user) return { kind: 'not-found' };

  const profileRow = await db.query.profiles.findFirst({ where: eq(profiles.userId, user.id) });
  const visibility: ProfileVisibility = profileRow?.visibility ?? DEFAULT_VISIBILITY;
  const isOwner = viewerUserId === user.id;

  if (!canViewProfile({ visibility, isOwner })) {
    return { kind: 'private', handle };
  }

  const resultRows = await db
    .select({
      poolId: poolResults.poolId,
      placement: poolResults.placement,
      submitted: poolResults.submitted,
      xpAwarded: poolResults.xpAwarded,
      createdAt: poolResults.createdAt,
      poolTitle: pools.title,
      role: pools.role,
      difficulty: pools.difficulty,
    })
    .from(poolResults)
    .innerJoin(pools, eq(poolResults.poolId, pools.id))
    .where(eq(poolResults.userId, user.id))
    .orderBy(desc(poolResults.createdAt));

  const level = profileRow?.level ?? 1;
  const xp = profileRow?.xp ?? 0;

  const stats = badgeStatsFrom({
    profile: {
      level,
      poolStreak: profileRow?.poolStreak ?? 0,
      globalRank: profileRow?.globalRank ?? 0,
    },
    results: resultRows.map((r) => ({ placement: r.placement, submitted: r.submitted })),
  });

  const history: ProfileHistoryEntry[] = resultRows.map((r) => {
    const isPodium = r.placement != null && r.placement <= PODIUM_CUTOFF;
    return {
      poolId: r.poolId,
      poolTitle: r.poolTitle,
      role: r.role,
      difficulty: r.difficulty,
      podiumPlacement: isPodium ? r.placement : null,
      won: r.placement === 1,
      submitted: r.submitted,
      xpAwarded: r.xpAwarded,
      date: r.createdAt.toISOString(),
    };
  });

  return {
    kind: 'ok',
    profile: {
      userId: user.id,
      handle,
      githubUsername: user.githubUsername,
      jobRole: user.jobRole,
      visibility,
      isOwner,
      level,
      xp,
      progress: levelProgress(xp),
      globalRank: profileRow?.globalRank ?? 0,
      poolStreak: profileRow?.poolStreak ?? 0,
      stats: {
        poolsEntered: stats.poolsEntered,
        poolsSubmitted: stats.poolsSubmitted,
        wins: stats.wins,
        podiums: stats.podiums,
      },
      badges: earnedBadges(stats),
      history,
    },
  };
}
