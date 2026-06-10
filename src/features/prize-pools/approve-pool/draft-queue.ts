import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/infra/db/client';
import { pools } from '@/infra/db/schema';

/**
 * The operator's review queue: live drafts only — rejected drafts keep
 * status `draft` but are archived via `rejectedAt`, so they're filtered
 * here rather than by status.
 */
export type DraftQueueItem = typeof pools.$inferSelect;

export async function listDraftQueue(): Promise<DraftQueueItem[]> {
  return getDb()
    .select()
    .from(pools)
    .where(and(eq(pools.status, 'draft'), isNull(pools.rejectedAt)))
    .orderBy(asc(pools.createdAt), asc(pools.slug));
}
