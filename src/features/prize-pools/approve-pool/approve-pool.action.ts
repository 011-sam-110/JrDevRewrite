'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { pools } from '@/infra/db/schema';
import { approveDraft, rejectDraft, type ApprovePoolDeps } from './approve-pool';

/**
 * Server actions are public HTTP endpoints — the page hiding the buttons is
 * cosmetics, so the operator check runs HERE, on every call.
 */
async function callerIsOperator(): Promise<boolean> {
  const identity = await getIdentity();
  return (
    identity !== null &&
    isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))
  );
}

const deps: ApprovePoolDeps = {
  getPool: async (poolId) => {
    const row = await getDb().query.pools.findFirst({ where: eq(pools.id, poolId) });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      rejectedAt: row.rejectedAt,
      windows: {
        joinHours: row.joinWindowHours,
        buildHours: row.buildWindowHours,
        judgingHours: row.judgingWindowHours,
      },
    };
  },
  publishPool: async (poolId, fields) => {
    await getDb().update(pools).set(fields).where(eq(pools.id, poolId));
  },
  markRejected: async (poolId, rejectedAt) => {
    await getDb().update(pools).set({ rejectedAt }).where(eq(pools.id, poolId));
  },
};

export async function approvePoolAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await approveDraft(deps, String(formData.get('poolId') ?? ''), new Date());
  // Whatever happened (success, raced double-click on a stale form), the
  // refreshed queue is the truthful response.
  revalidatePath('/operator/pools');
}

export async function rejectPoolAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await rejectDraft(deps, String(formData.get('poolId') ?? ''), new Date());
  revalidatePath('/operator/pools');
}
