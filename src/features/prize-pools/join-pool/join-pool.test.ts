import { describe, expect, it, vi } from 'vitest';
import type { JoinCandidate } from '../../../domain/prize-pools';
import {
  joinPool,
  type JoinablePool,
  type JoinPoolDeps,
  type RecordJoinConflict,
} from './join-pool';

/**
 * Slice behaviour: the kernel's checkJoin is the verdict (its edge cases are
 * tested in domain/), so these tests cover the ORCHESTRATION — the right deps
 * are called, nothing is recorded on a rejection, and the DB-level race
 * outcomes surface as ordinary rejection reasons.
 */

const NOW = new Date('2026-07-01T12:00:00Z');

function pool(overrides: Partial<JoinablePool> = {}): JoinablePool {
  return {
    id: 'pool-1',
    status: 'published',
    role: 'backend',
    difficulty: 'beginner',
    joinDeadline: new Date('2026-07-03T12:00:00Z'),
    entrantCount: 4,
    entrantCap: 30,
    ...overrides,
  };
}

function candidate(overrides: Partial<JoinCandidate> = {}): JoinCandidate {
  return {
    jobRole: 'backend',
    globalRank: 0,
    activePoolCount: 0,
    credits: 5,
    alreadyEntered: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<JoinPoolDeps> = {}): JoinPoolDeps {
  return {
    getPool: vi.fn(async () => pool()),
    getCandidate: vi.fn(async () => candidate()),
    recordJoin: vi.fn(async (): Promise<'ok' | RecordJoinConflict> => 'ok'),
    ...overrides,
  };
}

describe('joinPool — happy path', () => {
  it('eligible user joins: verdict checked, join recorded once', async () => {
    const deps = makeDeps();
    const result = await joinPool(deps, 'user-1', 'pool-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.recordJoin).toHaveBeenCalledTimes(1);
    expect(deps.recordJoin).toHaveBeenCalledWith('user-1', 'pool-1');
  });
});

describe('joinPool — rejections', () => {
  it('unknown pool → not-found, nothing recorded', async () => {
    const deps = makeDeps({ getPool: vi.fn(async () => null) });
    const result = await joinPool(deps, 'user-1', 'nope', NOW);

    expect(result).toEqual({ ok: false, error: 'not-found' });
    expect(deps.recordJoin).not.toHaveBeenCalled();
  });

  it('kernel rejection surfaces ALL reasons and skips recording', async () => {
    const deps = makeDeps({
      getCandidate: vi.fn(async () => candidate({ jobRole: 'ml', credits: 0 })),
    });
    const result = await joinPool(deps, 'user-1', 'pool-1', NOW);

    expect(result).toEqual({
      ok: false,
      error: 'rejected',
      reasons: ['role-mismatch', 'insufficient-credits'],
    });
    expect(deps.recordJoin).not.toHaveBeenCalled();
  });

  it.each(['already-entered', 'pool-full', 'insufficient-credits'] as const)(
    'a %s race lost at the DB surfaces as a rejection',
    async (conflict) => {
      // The kernel verdict passed on a stale read; the transactional record
      // is the authoritative re-check and its conflict wins.
      const deps = makeDeps({ recordJoin: vi.fn(async () => conflict) });
      const result = await joinPool(deps, 'user-1', 'pool-1', NOW);

      expect(result).toEqual({ ok: false, error: 'rejected', reasons: [conflict] });
    },
  );
});
