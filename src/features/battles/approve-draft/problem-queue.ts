import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/infra/db/client';
import { problems } from '@/infra/db/schema';

/**
 * Read models for the operator's problem-bank console. Three buckets:
 *   - drafts   : awaiting approval (status 'draft', not rejected) — the queue.
 *   - approved : live in the bank, can be retired.
 *   - retired  : rotated out, kept for history.
 * Rejected drafts (status 'draft' + rejectedAt set) are archival and show in
 * none of these — they keep their slug claimed but leave every view.
 */
export type ProblemRow = typeof problems.$inferSelect;

export async function listProblemDrafts(): Promise<ProblemRow[]> {
  return getDb()
    .select()
    .from(problems)
    .where(and(eq(problems.status, 'draft'), isNull(problems.rejectedAt)))
    .orderBy(asc(problems.tier), asc(problems.slug));
}

export async function listApprovedProblems(): Promise<ProblemRow[]> {
  return getDb()
    .select()
    .from(problems)
    .where(eq(problems.status, 'approved'))
    .orderBy(asc(problems.tier), asc(problems.slug));
}

export async function listRetiredProblems(): Promise<ProblemRow[]> {
  return getDb()
    .select()
    .from(problems)
    .where(eq(problems.status, 'retired'))
    .orderBy(desc(problems.retiredAt));
}
