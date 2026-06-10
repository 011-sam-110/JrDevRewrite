'use server';

import { and, count, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isJobRole } from '@/domain/identity';
import { creditDelta, JOIN_CREDIT_COST } from '@/domain/prize-pools';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { countEntrants, loadJoinCandidate } from '@/infra/db/pool-queries';
import { creditTransactions, entries, pools, profiles } from '@/infra/db/schema';
import { joinPool, type JoinPoolDeps, type RecordJoinConflict } from './join-pool';
import { JOIN_REJECTION_LABELS } from './rejection-labels';

export type JoinActionState =
  | { status: 'idle' }
  | { status: 'joined' }
  | { status: 'error'; message: string };

/**
 * The transactional re-check behind the kernel verdict. Locking the pool row
 * (SELECT … FOR UPDATE) serializes concurrent joins on the SAME pool, so the
 * capacity count can't be raced past the cap; the conditional debit
 * (`credits >= cost` in the UPDATE itself) and the entries unique constraint
 * guard balance and duplicates without any lock at all.
 */
async function recordJoin(userId: string, poolId: string): Promise<'ok' | RecordJoinConflict> {
  return getDb().transaction(async (tx): Promise<'ok' | RecordJoinConflict> => {
    const [locked] = await tx
      .select({ entrantCap: pools.entrantCap })
      .from(pools)
      .where(eq(pools.id, poolId))
      .for('update');
    if (!locked) throw new Error(`pool ${poolId} vanished mid-join`);

    const [existing] = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.poolId, poolId), eq(entries.userId, userId)))
      .limit(1);
    if (existing) return 'already-entered';

    const countRows = await tx
      .select({ value: count() })
      .from(entries)
      .where(eq(entries.poolId, poolId));
    if ((countRows[0]?.value ?? 0) >= locked.entrantCap) return 'pool-full';

    const debited = await tx
      .update(profiles)
      .set({
        credits: sql`${profiles.credits} + ${creditDelta('pool-join')}`,
        updatedAt: new Date(),
      })
      .where(and(eq(profiles.userId, userId), gte(profiles.credits, JOIN_CREDIT_COST)))
      .returning({ credits: profiles.credits });
    if (debited.length === 0) return 'insufficient-credits';

    await tx.insert(entries).values({ poolId, userId });
    await tx.insert(creditTransactions).values({
      userId,
      poolId,
      amount: creditDelta('pool-join'),
      reason: 'pool-join',
    });
    return 'ok';
  });
}

export async function joinPoolAction(
  _prev: JoinActionState,
  formData: FormData,
): Promise<JoinActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  const role = identity.jobRole;
  if (identity.status !== 'complete' || !role || !isJobRole(role)) redirect('/onboarding');

  const poolId = String(formData.get('poolId') ?? '');

  const deps: JoinPoolDeps = {
    getPool: async (id) => {
      const row = await getDb().query.pools.findFirst({ where: eq(pools.id, id) });
      if (!row || !row.joinDeadline) return null;
      const counts = await countEntrants([row.id]);
      return {
        id: row.id,
        status: row.status,
        role: row.role,
        difficulty: row.difficulty,
        joinDeadline: row.joinDeadline,
        entrantCount: counts.get(row.id) ?? 0,
        entrantCap: row.entrantCap,
      };
    },
    getCandidate: (userId, id) => loadJoinCandidate(userId, role, id),
    recordJoin,
  };

  const result = await joinPool(deps, identity.userId, poolId, new Date());
  if (!result.ok) {
    if (result.error === 'not-found') return { status: 'error', message: 'Pool not found.' };
    return {
      status: 'error',
      message: result.reasons.map((r) => JOIN_REJECTION_LABELS[r]).join(' '),
    };
  }

  revalidatePath('/pools');
  revalidatePath(`/pools/${poolId}`);
  return { status: 'joined' };
}
