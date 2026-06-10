import {
  tickPool,
  type PoolEffect,
  type PoolSnapshot,
  type PoolStatus,
} from '../../../domain/prize-pools';

/**
 * Use-case: the scheduled lifecycle job (CLAUDE.md: transitions are
 * time-driven, executed by a cron, never ad hoc in request handlers). The
 * kernel's `tickPool` decides each transition; this slice executes it.
 *
 * Crash-safety contract: effects run BEFORE the new status is persisted. If
 * the job dies mid-pool, the unchanged status means the next run re-decides
 * the same transition and re-runs its effects — refunds dedupe on the credit
 * ledger's unique index, a duplicated notification email is tolerable. The
 * opposite order (persist first) could strand a cancelled pool with refunds
 * that never happened, which is the one unacceptable outcome.
 *
 * (Relative imports — this file is on the tsx CLI's import graph.)
 */

export interface TickablePool extends PoolSnapshot {
  id: string;
}

export interface TickPoolsDeps {
  /** Pools in a non-terminal, non-draft status, with deadlines set. */
  listTickablePools(): Promise<TickablePool[]>;
  persistTransition(pool: TickablePool): Promise<void>;
  /** Refund every entrant's join debit; idempotent. Returns refunds written. */
  refundEntrants(poolId: string): Promise<number>;
  notifyEntrants(poolId: string, kind: 'extension' | 'cancellation'): Promise<void>;
  /** Effects whose executors land later (assign-judges → M8, finalize-results → M9). */
  recordUnhandledEffect(poolId: string, effect: PoolEffect): Promise<void>;
}

export interface TickTransition {
  poolId: string;
  from: PoolStatus;
  to: PoolStatus;
  effects: PoolEffect[];
}

export interface TickReport {
  examined: number;
  transitions: TickTransition[];
  errors: { poolId: string; message: string }[];
}

async function runEffect(deps: TickPoolsDeps, poolId: string, effect: PoolEffect): Promise<void> {
  switch (effect) {
    case 'refund-credits':
      await deps.refundEntrants(poolId);
      return;
    case 'notify-extension':
      await deps.notifyEntrants(poolId, 'extension');
      return;
    case 'notify-cancellation':
      await deps.notifyEntrants(poolId, 'cancellation');
      return;
    case 'assign-judges':
    case 'finalize-results':
      await deps.recordUnhandledEffect(poolId, effect);
      return;
  }
}

export async function tickPools(deps: TickPoolsDeps, now: Date): Promise<TickReport> {
  const candidates = await deps.listTickablePools();
  const report: TickReport = { examined: candidates.length, transitions: [], errors: [] };

  for (const pool of candidates) {
    const result = tickPool(pool, now);
    if (!result.changed) continue;

    // One broken pool must not stall the whole schedule.
    try {
      for (const effect of result.effects) await runEffect(deps, pool.id, effect);
      await deps.persistTransition({ ...result.pool, id: pool.id });
      report.transitions.push({
        poolId: pool.id,
        from: pool.status,
        to: result.pool.status,
        effects: result.effects,
      });
    } catch (e) {
      report.errors.push({ poolId: pool.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return report;
}
