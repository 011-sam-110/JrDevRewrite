import { approvePool, schedulePool, type PoolStatus, type PoolWindows } from '@/domain/prize-pools';

/**
 * Use-case: the operator reviews a draft pool — approve it into `published`
 * (the one human transition in the lifecycle; everything after is the clock's
 * job) or reject it. The draft check is the kernel's `approvePool`, the
 * deadline maths is the kernel's `schedulePool`; this slice only orchestrates.
 *
 * Rejection is archival, not a lifecycle state: the row keeps status `draft`
 * with `rejectedAt` stamped, drops out of every queue, and its slug stays
 * claimed so a re-import can't resurrect it.
 */

export interface DraftPool {
  id: string;
  status: PoolStatus;
  rejectedAt: Date | null;
  windows: PoolWindows;
}

export interface ApprovePoolDeps {
  getPool(poolId: string): Promise<DraftPool | null>;
  publishPool(
    poolId: string,
    fields: {
      status: 'published';
      publishedAt: Date;
      joinDeadline: Date;
      buildDeadline: Date;
      judgingDeadline: Date;
    },
  ): Promise<void>;
  markRejected(poolId: string, rejectedAt: Date): Promise<void>;
}

export type ReviewResult =
  | { ok: true }
  | { ok: false; error: 'not-found' | 'not-a-draft' | 'already-rejected' };

async function loadReviewable(
  deps: ApprovePoolDeps,
  poolId: string,
): Promise<{ pool: DraftPool } | { failure: ReviewResult & { ok: false } }> {
  const pool = await deps.getPool(poolId);
  if (!pool) return { failure: { ok: false, error: 'not-found' } };
  if (pool.rejectedAt !== null) return { failure: { ok: false, error: 'already-rejected' } };
  return { pool };
}

export async function approveDraft(
  deps: ApprovePoolDeps,
  poolId: string,
  now: Date,
): Promise<ReviewResult> {
  const loaded = await loadReviewable(deps, poolId);
  if ('failure' in loaded) return loaded.failure;

  const approval = approvePool(loaded.pool.status);
  if (!approval.ok) return { ok: false, error: approval.error };

  const deadlines = schedulePool(loaded.pool.windows, now);
  await deps.publishPool(poolId, { status: approval.status, publishedAt: now, ...deadlines });
  return { ok: true };
}

export async function rejectDraft(
  deps: ApprovePoolDeps,
  poolId: string,
  now: Date,
): Promise<ReviewResult> {
  const loaded = await loadReviewable(deps, poolId);
  if ('failure' in loaded) return loaded.failure;

  // Same precondition as approval: only a live draft is reviewable.
  if (!approvePool(loaded.pool.status).ok) return { ok: false, error: 'not-a-draft' };

  await deps.markRejected(poolId, now);
  return { ok: true };
}
