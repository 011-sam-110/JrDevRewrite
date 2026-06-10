import { describe, expect, it, vi } from 'vitest';
import { EXTENSION_HOURS } from '../../../domain/prize-pools';
import { tickPools, type TickablePool, type TickPoolsDeps } from './tick-pools';

/**
 * The cron slice: the kernel's tickPool DECIDES (its transition table is
 * tested in domain/), this slice EXECUTES — persistence, refunds,
 * notifications. These tests pin the orchestration contract: effects run
 * BEFORE the status is persisted (a crash mid-run must re-run effects, never
 * strand them), refunds map to the refund dep, each effect maps to its dep
 * (assign-judges → M8, finalize-results → M9), and one broken pool doesn't
 * stall the rest.
 */

const NOW = new Date('2026-07-10T12:00:00Z');
const PAST = new Date('2026-07-09T12:00:00Z');
const FUTURE = new Date('2026-07-12T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

function pool(overrides: Partial<TickablePool> = {}): TickablePool {
  return {
    id: 'pool-1',
    status: 'published',
    joinDeadline: FUTURE,
    buildDeadline: new Date(FUTURE.getTime() + 72 * HOUR_MS),
    judgingDeadline: new Date(FUTURE.getTime() + 144 * HOUR_MS),
    entrantCount: 10,
    minEntrants: 6,
    entrantCap: 30,
    extensionsUsed: 0,
    ...overrides,
  };
}

function makeDeps(poolList: TickablePool[], overrides: Partial<TickPoolsDeps> = {}): TickPoolsDeps {
  return {
    listTickablePools: vi.fn(async () => poolList),
    persistTransition: vi.fn(async () => {}),
    refundEntrants: vi.fn(async () => 0),
    notifyEntrants: vi.fn(async () => {}),
    assignJudges: vi.fn(async () => {}),
    finalizeResults: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('tickPools — nothing due', () => {
  it('pools before their deadlines are left alone', async () => {
    const deps = makeDeps([pool()]);
    const report = await tickPools(deps, NOW);

    expect(report).toEqual({ examined: 1, transitions: [], errors: [] });
    expect(deps.persistTransition).not.toHaveBeenCalled();
  });
});

describe('tickPools — join window closes', () => {
  it('a filled pool moves to building, no effects', async () => {
    const deps = makeDeps([pool({ joinDeadline: PAST, entrantCount: 6 })]);
    const report = await tickPools(deps, NOW);

    expect(report.transitions).toEqual([
      { poolId: 'pool-1', from: 'published', to: 'building', effects: [] },
    ]);
    expect(deps.persistTransition).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pool-1', status: 'building' }),
    );
  });

  it('an under-filled pool extends: all three deadlines shift +48h, entrants notified', async () => {
    const p = pool({ joinDeadline: PAST, entrantCount: 3 });
    const deps = makeDeps([p]);
    const report = await tickPools(deps, NOW);

    expect(report.transitions[0]).toMatchObject({ to: 'extended', effects: ['notify-extension'] });
    expect(deps.notifyEntrants).toHaveBeenCalledWith('pool-1', 'extension');
    expect(deps.persistTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'extended',
        extensionsUsed: 1,
        joinDeadline: new Date(p.joinDeadline.getTime() + EXTENSION_HOURS * HOUR_MS),
        buildDeadline: new Date(p.buildDeadline.getTime() + EXTENSION_HOURS * HOUR_MS),
        judgingDeadline: new Date(p.judgingDeadline.getTime() + EXTENSION_HOURS * HOUR_MS),
      }),
    );
  });

  it('a spent extension cancels: refund + notification happen BEFORE the persist', async () => {
    const order: string[] = [];
    const deps = makeDeps(
      [pool({ status: 'extended', joinDeadline: PAST, entrantCount: 3, extensionsUsed: 1 })],
      {
        refundEntrants: vi.fn(async () => {
          order.push('refund');
          return 3;
        }),
        notifyEntrants: vi.fn(async () => {
          order.push('notify');
        }),
        persistTransition: vi.fn(async () => {
          order.push('persist');
        }),
      },
    );
    const report = await tickPools(deps, NOW);

    expect(report.transitions[0]).toMatchObject({
      from: 'extended',
      to: 'cancelled',
      effects: ['refund-credits', 'notify-cancellation'],
    });
    expect(deps.notifyEntrants).toHaveBeenCalledWith('pool-1', 'cancellation');
    expect(order).toEqual(['refund', 'notify', 'persist']);
  });
});

describe('tickPools — later windows', () => {
  it('build deadline → judging; assign-judges runs the assignment effect (M8)', async () => {
    const deps = makeDeps([pool({ status: 'building', joinDeadline: PAST, buildDeadline: PAST })]);
    const report = await tickPools(deps, NOW);

    expect(report.transitions[0]).toMatchObject({ to: 'judging', effects: ['assign-judges'] });
    expect(deps.assignJudges).toHaveBeenCalledWith('pool-1');
    expect(deps.finalizeResults).not.toHaveBeenCalled();
  });

  it('judging deadline → closed; finalize-results runs the close effect (M9)', async () => {
    const deps = makeDeps([
      pool({ status: 'judging', joinDeadline: PAST, buildDeadline: PAST, judgingDeadline: PAST }),
    ]);
    const report = await tickPools(deps, NOW);

    expect(report.transitions[0]).toMatchObject({ to: 'closed', effects: ['finalize-results'] });
    expect(deps.finalizeResults).toHaveBeenCalledWith('pool-1');
  });

  it('finalize-results runs BEFORE the close is persisted (crash-safe, idempotent)', async () => {
    const order: string[] = [];
    const deps = makeDeps(
      [pool({ status: 'judging', joinDeadline: PAST, buildDeadline: PAST, judgingDeadline: PAST })],
      {
        finalizeResults: vi.fn(async () => {
          order.push('finalize');
        }),
        persistTransition: vi.fn(async () => {
          order.push('persist');
        }),
      },
    );
    await tickPools(deps, NOW);
    expect(order).toEqual(['finalize', 'persist']);
  });
});

describe('tickPools — error isolation', () => {
  it('one pool blowing up is reported; the others still tick', async () => {
    const bad = pool({ id: 'bad', joinDeadline: PAST, entrantCount: 6 });
    const good = pool({ id: 'good', joinDeadline: PAST, entrantCount: 6 });
    const deps = makeDeps([bad, good], {
      persistTransition: vi.fn(async (p) => {
        if (p.id === 'bad') throw new Error('db hiccup');
      }),
    });
    const report = await tickPools(deps, NOW);

    expect(report.errors).toEqual([{ poolId: 'bad', message: 'db hiccup' }]);
    expect(report.transitions).toEqual([
      { poolId: 'good', from: 'published', to: 'building', effects: [] },
    ]);
  });
});
