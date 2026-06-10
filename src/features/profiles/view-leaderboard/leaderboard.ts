import { and, desc, eq, sql } from 'drizzle-orm';
import { type JobRole } from '@/domain/identity';
import { getDb } from '@/infra/db/client';
import { poolResults, pools, profiles, users } from '@/infra/db/schema';

/**
 * Read model for the leaderboards (CLAUDE.md → Gamification: "one global pool
 * rank drives the main ladder; per-role leaderboards are filtered views computed
 * from pool results"). Two shapes, one rule:
 *
 *   - GLOBAL board — ordered by the authoritative aggregate the close-pool slice
 *     maintains on the profile (`globalRank`, XP as the tie-break). This is the
 *     single global ladder.
 *   - PER-ROLE board — computed straight from `pool_results` joined to each
 *     pool's role (captured per-role since M9), summing the rank points and XP a
 *     user earned in that role's pools. Faithful to "filtered views computed from
 *     pool results", and ready for true per-role ratings later at zero migration
 *     cost.
 *
 * Both EXCLUDE private profiles — the privacy rule lives in
 * domain/gamification/visibility (`appearsInLeaderboard`); here it is the
 * `visibility = 'public'` filter, applied in SQL so a private account never even
 * leaves the database as a board row.
 */

export interface LeaderboardEntry {
  /** 1-based board position. */
  rank: number;
  userId: string;
  /** Public handle — GitHub username, falling back to the email local part. */
  handle: string;
  jobRole: string | null;
  level: number;
  /** The ladder metric: global rank points (global) or in-role rank points (role). */
  points: number;
  /** Total XP (global) or in-role XP (role board) — the tie-break / sub-stat. */
  xp: number;
  /** 1st-place finishes (total on the global board, in-role on a role board). */
  wins: number;
  isMe: boolean;
}

export interface LeaderboardView {
  scope: 'global' | JobRole;
  entries: LeaderboardEntry[];
}

const DEFAULT_LIMIT = 100;

function localPart(email: string | null): string {
  return email?.split('@')[0] ?? 'anonymous';
}

/** Total 1st-place finishes per user (for the global board's wins column). */
async function totalWinsByUser(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      userId: poolResults.userId,
      wins: sql<number>`coalesce(sum(case when ${poolResults.placement} = 1 then 1 else 0 end), 0)::int`,
    })
    .from(poolResults)
    .groupBy(poolResults.userId);
  return new Map(rows.map((r) => [r.userId, r.wins]));
}

export async function getGlobalLeaderboard(
  viewerUserId: string | null,
  limit = DEFAULT_LIMIT,
): Promise<LeaderboardView> {
  const db = getDb();
  const rows = await db
    .select({
      userId: profiles.userId,
      points: profiles.globalRank,
      xp: profiles.xp,
      level: profiles.level,
      githubUsername: users.githubUsername,
      email: users.email,
      jobRole: users.jobRole,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(eq(profiles.visibility, 'public'))
    .orderBy(desc(profiles.globalRank), desc(profiles.xp))
    .limit(limit);

  const wins = await totalWinsByUser();

  return {
    scope: 'global',
    entries: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      handle: r.githubUsername ?? localPart(r.email),
      jobRole: r.jobRole,
      level: r.level,
      points: r.points,
      xp: r.xp,
      wins: wins.get(r.userId) ?? 0,
      isMe: r.userId === viewerUserId,
    })),
  };
}

export async function getRoleLeaderboard(
  role: JobRole,
  viewerUserId: string | null,
  limit = DEFAULT_LIMIT,
): Promise<LeaderboardView> {
  const db = getDb();
  const rows = await db
    .select({
      userId: poolResults.userId,
      points: sql<number>`coalesce(sum(${poolResults.rankAwarded}), 0)::int`,
      xp: sql<number>`coalesce(sum(${poolResults.xpAwarded}), 0)::int`,
      wins: sql<number>`coalesce(sum(case when ${poolResults.placement} = 1 then 1 else 0 end), 0)::int`,
      level: profiles.level,
      githubUsername: users.githubUsername,
      email: users.email,
      jobRole: users.jobRole,
    })
    .from(poolResults)
    .innerJoin(pools, eq(poolResults.poolId, pools.id))
    .innerJoin(users, eq(poolResults.userId, users.id))
    .innerJoin(profiles, eq(poolResults.userId, profiles.userId))
    .where(and(eq(pools.role, role), eq(profiles.visibility, 'public')))
    .groupBy(poolResults.userId, profiles.level, users.githubUsername, users.email, users.jobRole);

  // Sort + cap in JS: role boards are campus-small, and ordering by an aggregate
  // keeps the SQL simple. Points desc, XP as the tie-break.
  const ranked = rows.sort((a, b) => b.points - a.points || b.xp - a.xp).slice(0, limit);

  return {
    scope: role,
    entries: ranked.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      handle: r.githubUsername ?? localPart(r.email),
      jobRole: r.jobRole,
      level: r.level,
      points: r.points,
      xp: r.xp,
      wins: r.wins,
      isMe: r.userId === viewerUserId,
    })),
  };
}
