import { describe, expect, it, vi } from 'vitest';
import { reviewSetSize } from '../../../domain/prize-pools';
import { ensurePoolAssignments, type AssignJudgesDeps } from './assign-judges';

/**
 * The slice EXECUTES the kernel's assignment (assignJudges is property-tested in
 * domain/) and persists it idempotently. These tests pin the orchestration: it
 * computes-and-saves once, skips when assignments already exist (so the lazy
 * ensure-on-judging-view doesn't rewrite every page load), and no-ops on a pool
 * too small to judge.
 */

function makeJudgeable(n: number) {
  return Array.from({ length: n }, (_, i) => ({ entryId: `e${i}`, ownerId: `u${i}` }));
}

function makeDeps(overrides: Partial<AssignJudgesDeps> = {}): AssignJudgesDeps {
  return {
    hasAssignments: vi.fn(async () => false),
    loadJudgeableEntries: vi.fn(async () => makeJudgeable(6)),
    saveAssignments: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('ensurePoolAssignments', () => {
  it('computes a full balanced assignment and saves it', async () => {
    const deps = makeDeps();
    const result = await ensurePoolAssignments(deps, 'pool-1');

    expect(result).toEqual({ created: true, judges: 6 });
    expect(deps.saveAssignments).toHaveBeenCalledTimes(1);
    const call = (deps.saveAssignments as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [poolId, assignments] = call;
    expect(poolId).toBe('pool-1');
    // Every entrant got the target-capped review count, none their own.
    expect(assignments).toHaveLength(6);
    for (const a of assignments) {
      expect(a.entryIds).toHaveLength(reviewSetSize(6));
      expect(a.entryIds).not.toContain(`e${a.judgeId.slice(1)}`); // u3 never reviews e3
    }
  });

  it('is idempotent: skips entirely when assignments already exist', async () => {
    const deps = makeDeps({ hasAssignments: vi.fn(async () => true) });
    const result = await ensurePoolAssignments(deps, 'pool-1');

    expect(result).toEqual({ created: false, judges: 0 });
    expect(deps.loadJudgeableEntries).not.toHaveBeenCalled();
    expect(deps.saveAssignments).not.toHaveBeenCalled();
  });

  it('no-ops when the pool is too small for a comparative round', async () => {
    const deps = makeDeps({ loadJudgeableEntries: vi.fn(async () => makeJudgeable(2)) });
    const result = await ensurePoolAssignments(deps, 'pool-1');

    expect(result).toEqual({ created: false, judges: 0 });
    expect(deps.saveAssignments).not.toHaveBeenCalled();
  });

  it('seeds the assignment by pool id (deterministic across calls)', async () => {
    const saved: unknown[][] = [];
    const save = vi.fn(async (poolId: string, a: unknown) => {
      saved.push([poolId, a]);
    });
    const deps = makeDeps({ saveAssignments: save });
    await ensurePoolAssignments(deps, 'pool-determinism');
    await ensurePoolAssignments(deps, 'pool-determinism');

    expect(JSON.stringify(saved[0])).toBe(JSON.stringify(saved[1]));
  });
});
