import {
  checkJoin,
  type JoinCandidate,
  type JoinRejection,
  type JoinTarget,
} from '../../../domain/prize-pools';

/**
 * Use-case: a signed-in, onboarded user joins a published pool. The verdict
 * is the kernel's `checkJoin` (same rule the listing UI renders); this slice
 * orchestrates the read → verdict → record sequence.
 *
 * Two-phase guard, on purpose: the kernel verdict runs on a snapshot read,
 * which can go stale between read and write (two users grabbing the last
 * seat). `recordJoin` is therefore a TRANSACTION that re-checks the
 * race-prone guards (capacity, balance, duplicate) under a row lock; a
 * conflict there is not an error, just a rejection that arrived late.
 */

export interface JoinablePool extends JoinTarget {
  id: string;
}

/** The guards only the transaction can decide truthfully. */
export type RecordJoinConflict = Extract<
  JoinRejection,
  'already-entered' | 'pool-full' | 'insufficient-credits'
>;

export interface JoinPoolDeps {
  getPool(poolId: string): Promise<JoinablePool | null>;
  getCandidate(userId: string, poolId: string): Promise<JoinCandidate>;
  /** Atomically: debit credits, insert the entry, write the ledger row. */
  recordJoin(userId: string, poolId: string): Promise<'ok' | RecordJoinConflict>;
}

export type JoinPoolResult =
  | { ok: true }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'rejected'; reasons: JoinRejection[] };

export async function joinPool(
  deps: JoinPoolDeps,
  userId: string,
  poolId: string,
  now: Date,
): Promise<JoinPoolResult> {
  const pool = await deps.getPool(poolId);
  if (!pool) return { ok: false, error: 'not-found' };

  const verdict = checkJoin(await deps.getCandidate(userId, poolId), pool, now);
  if (!verdict.ok) return { ok: false, error: 'rejected', reasons: verdict.reasons };

  const recorded = await deps.recordJoin(userId, poolId);
  if (recorded !== 'ok') return { ok: false, error: 'rejected', reasons: [recorded] };
  return { ok: true };
}
