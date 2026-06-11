import { describe, expect, it, vi } from 'vitest';
import type { ProblemSpec } from '@/domain/battles';
import { MockJudgeClient, failingRun } from '@/infra/judge';
import { MockProblemDrafter } from '@/infra/ai/problem-drafter.mock';
import { draftProblems, type DraftedProblem, type DraftProblemDeps } from './draft-problem';

const NOW = new Date('2026-06-11T12:00:00Z');

function validSpec(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
  return {
    slug: 'sum-two',
    title: 'Sum Two',
    statementMd: 'Read two ints, print sum.',
    tier: 'easy',
    referenceLanguage: 'python',
    referenceSolution: 'a, b = map(int, input().split())\nprint(a + b)',
    hiddenTests: [
      { input: '1 2', expectedOutput: '3' },
      { input: '0 0', expectedOutput: '0' },
      { input: '-5 5', expectedOutput: '0' },
    ],
    ...overrides,
  };
}

function makeDeps(over: Partial<DraftProblemDeps> = {}): DraftProblemDeps & {
  saved: ProblemSpec[];
} {
  const saved: ProblemSpec[] = [];
  const deps: DraftProblemDeps = {
    drafter: new MockProblemDrafter([validSpec()]),
    judge: new MockJudgeClient(), // accepts every test by default
    existingSlugs: async () => new Set(),
    saveDrafts: vi.fn(async (drafts: DraftedProblem[]) => {
      saved.push(...drafts.map((d) => d.spec));
    }),
    ...over,
  };
  return Object.assign(deps, { saved });
}

describe('draftProblems pipeline', () => {
  it('drafts → validates → verifies → persists a good spec as a verified draft', async () => {
    const deps = makeDeps();

    const report = await draftProblems(deps, { tier: 'easy', count: 5 }, NOW);

    expect(report.created).toEqual(['sum-two']);
    expect(report.skipped).toEqual([]);
    expect(deps.saveDrafts).toHaveBeenCalledOnce();
    // The persisted draft carries the verification stamp + source.
    const passedDrafts = (deps.saveDrafts as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(passedDrafts[0]).toMatchObject({ source: 'curated', verifiedAt: NOW });
  });

  it('passes the existing-slug set to the drafter so it can avoid re-emitting', async () => {
    const drafter = new MockProblemDrafter([validSpec()]);
    const deps = makeDeps({ drafter, existingSlugs: async () => new Set(['sum-two']) });

    const report = await draftProblems(deps, { tier: 'easy', count: 5 }, NOW);

    // The drafter saw the existing slug and returned nothing.
    expect(drafter.requests[0]?.existingSlugs?.has('sum-two')).toBe(true);
    expect(report.created).toEqual([]);
  });

  it('REJECTS a structurally invalid spec via the kernel — never reaches the judge', async () => {
    const judge = new MockJudgeClient();
    const runSpy = vi.spyOn(judge, 'run');
    const deps = makeDeps({
      drafter: new MockProblemDrafter([validSpec({ hiddenTests: [] })]), // too few tests
      judge,
    });

    const report = await draftProblems(deps, { tier: 'easy', count: 5 }, NOW);

    expect(report.created).toEqual([]);
    expect(report.skipped[0]).toMatchObject({ slug: 'sum-two', reason: { kind: 'invalid' } });
    expect(runSpy).not.toHaveBeenCalled(); // validation gates verification
    expect(deps.saveDrafts).not.toHaveBeenCalled();
  });

  it('REJECTS a spec whose reference solution fails its own hidden tests (machine verify)', async () => {
    const deps = makeDeps({
      drafter: new MockProblemDrafter([validSpec()]),
      // Judge fails test index 1 → not passedAll.
      judge: new MockJudgeClient((s) => failingRun(s, [1])),
    });

    const report = await draftProblems(deps, { tier: 'easy', count: 5 }, NOW);

    expect(report.created).toEqual([]);
    expect(report.skipped[0]).toMatchObject({
      slug: 'sum-two',
      reason: { kind: 'verification-failed', testsPassed: 2, total: 3 },
    });
    expect(deps.saveDrafts).not.toHaveBeenCalled();
  });

  it('dedups a slug the drafter emits twice within one batch', async () => {
    const deps = makeDeps({
      drafter: new MockProblemDrafter([validSpec(), validSpec()]), // same slug twice
    });

    const report = await draftProblems(deps, { tier: 'easy', count: 5 }, NOW);

    expect(report.created).toEqual(['sum-two']);
    expect(report.skipped).toEqual([{ slug: 'sum-two', reason: { kind: 'duplicate-slug' } }]);
  });

  it('persists nothing when no candidate survives (no empty write)', async () => {
    const deps = makeDeps({ drafter: new MockProblemDrafter([]) });

    const report = await draftProblems(deps, { tier: 'easy', count: 5 }, NOW);

    expect(report.created).toEqual([]);
    expect(deps.saveDrafts).not.toHaveBeenCalled();
  });

  it('records the source as ai when an ai-sourced drafter is behind the seam', async () => {
    const deps = makeDeps({ drafter: new MockProblemDrafter([validSpec()], 'ai') });

    await draftProblems(deps, { tier: 'easy', count: 1 }, NOW);

    const passedDrafts = (deps.saveDrafts as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(passedDrafts[0].source).toBe('ai');
  });
});
