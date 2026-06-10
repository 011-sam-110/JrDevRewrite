import { and, asc, eq, inArray } from 'drizzle-orm';
import type { JobRole } from '@/domain/identity';
import type { PoolDifficulty } from '@/domain/prize-pools';
import { getDb } from '@/infra/db/client';
import { countActivePools, countEntrants } from '@/infra/db/pool-queries';
import { ensureProfile } from '@/infra/db/profiles';
import { entries, pools } from '@/infra/db/schema';
import { buildPoolView, type BrowseContext, type PoolView } from './browse-pools';

/**
 * The read model behind /pools: open pools for the user's role (binding rule:
 * pools are per job role) plus everything the user has joined, each carrying
 * its precomputed join verdict. First touch also materializes the profile —
 * the starter-credit grant — so the header can show a real balance.
 */

export interface PoolDirectory {
  credits: number;
  globalRank: number;
  /** Open (published/extended) pools for the user's role, soonest deadline first. */
  openPools: PoolView[];
  /** Every pool the user has entered, regardless of status or role. */
  myPools: PoolView[];
}

type PoolRow = typeof pools.$inferSelect;

async function buildContext(
  userId: string,
  jobRole: JobRole,
): Promise<{ ctx: BrowseContext; joinedIds: string[] }> {
  const profile = await ensureProfile(userId);
  const joined = await getDb()
    .select({ poolId: entries.poolId })
    .from(entries)
    .where(eq(entries.userId, userId));
  const joinedIds = joined.map((j) => j.poolId);

  return {
    ctx: {
      jobRole,
      globalRank: profile.globalRank,
      credits: profile.credits,
      activePoolCount: await countActivePools(userId),
      joinedPoolIds: new Set(joinedIds),
    },
    joinedIds,
  };
}

async function toViews(rows: PoolRow[], ctx: BrowseContext, now: Date): Promise<PoolView[]> {
  const counts = await countEntrants(rows.map((r) => r.id));
  return rows.map((row) =>
    buildPoolView({ ...row, entrantCount: counts.get(row.id) ?? 0 }, ctx, now),
  );
}

export async function getPoolDirectory(
  userId: string,
  jobRole: JobRole,
  difficulty: PoolDifficulty | undefined,
  now: Date,
): Promise<PoolDirectory> {
  const db = getDb();
  const { ctx, joinedIds } = await buildContext(userId, jobRole);

  const openRows = await db
    .select()
    .from(pools)
    .where(
      and(
        eq(pools.role, jobRole),
        inArray(pools.status, ['published', 'extended']),
        difficulty ? eq(pools.difficulty, difficulty) : undefined,
      ),
    )
    .orderBy(asc(pools.joinDeadline), asc(pools.slug));

  const myRows =
    joinedIds.length > 0
      ? await db
          .select()
          .from(pools)
          .where(inArray(pools.id, joinedIds))
          .orderBy(asc(pools.judgingDeadline), asc(pools.slug))
      : [];

  return {
    credits: ctx.credits,
    globalRank: ctx.globalRank,
    openPools: await toViews(openRows, ctx, now),
    myPools: await toViews(myRows, ctx, now),
  };
}

export async function getPoolDetail(
  userId: string,
  jobRole: JobRole,
  poolId: string,
  now: Date,
): Promise<{ view: PoolView; credits: number } | null> {
  const row = await getDb().query.pools.findFirst({ where: eq(pools.id, poolId) });
  // Drafts are the operator's business only — to everyone else they don't exist.
  if (!row || row.status === 'draft') return null;

  const { ctx } = await buildContext(userId, jobRole);
  const [view] = await toViews([row], ctx, now);
  if (!view) return null;
  return { view, credits: ctx.credits };
}
