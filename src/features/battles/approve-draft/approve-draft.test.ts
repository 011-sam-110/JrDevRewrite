import { describe, expect, it, vi } from 'vitest';
import {
  approveProblemDraft,
  rejectProblemDraft,
  retireBankProblem,
  type BankProblem,
  type ReviewProblemDeps,
} from './approve-draft';

const NOW = new Date('2026-06-11T12:00:00Z');
const VERIFIED = new Date('2026-06-11T10:00:00Z');

function problem(overrides: Partial<BankProblem> = {}): BankProblem {
  return {
    id: 'prob-1',
    status: 'draft',
    verifiedAt: VERIFIED,
    rejectedAt: null,
    ...overrides,
  };
}

function makeDeps(p: BankProblem | null): ReviewProblemDeps {
  return {
    getProblem: vi.fn().mockResolvedValue(p),
    setApproved: vi.fn().mockResolvedValue(undefined),
    setRetired: vi.fn().mockResolvedValue(undefined),
    markRejected: vi.fn().mockResolvedValue(undefined),
  };
}

describe('approveProblemDraft', () => {
  it('approves a verified draft into the bank', async () => {
    const deps = makeDeps(problem());

    const result = await approveProblemDraft(deps, 'prob-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.setApproved).toHaveBeenCalledExactlyOnceWith('prob-1', NOW);
  });

  it('REFUSES to approve an unverified draft (machine-verify is a precondition)', async () => {
    const deps = makeDeps(problem({ verifiedAt: null }));

    const result = await approveProblemDraft(deps, 'prob-1', NOW);

    expect(result).toEqual({ ok: false, error: 'unverified' });
    expect(deps.setApproved).not.toHaveBeenCalled();
  });

  it('refuses to approve anything that is not a draft (kernel rule)', async () => {
    const deps = makeDeps(problem({ status: 'approved' }));
    expect(await approveProblemDraft(deps, 'prob-1', NOW)).toEqual({
      ok: false,
      error: 'not-a-draft',
    });
  });

  it('refuses to approve a draft already rejected', async () => {
    const deps = makeDeps(problem({ rejectedAt: new Date('2026-06-10T00:00:00Z') }));
    expect(await approveProblemDraft(deps, 'prob-1', NOW)).toEqual({
      ok: false,
      error: 'already-rejected',
    });
  });

  it('reports an unknown problem id', async () => {
    expect(await approveProblemDraft(makeDeps(null), 'ghost', NOW)).toEqual({
      ok: false,
      error: 'not-found',
    });
  });
});

describe('rejectProblemDraft', () => {
  it('archives a draft by stamping rejectedAt', async () => {
    const deps = makeDeps(problem());

    const result = await rejectProblemDraft(deps, 'prob-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.markRejected).toHaveBeenCalledExactlyOnceWith('prob-1', NOW);
  });

  it('refuses to reject a problem that already left draft', async () => {
    const deps = makeDeps(problem({ status: 'approved' }));
    expect(await rejectProblemDraft(deps, 'prob-1', NOW)).toEqual({
      ok: false,
      error: 'not-a-draft',
    });
  });

  it('refuses a double rejection', async () => {
    const deps = makeDeps(problem({ rejectedAt: new Date('2026-06-10T00:00:00Z') }));
    expect(await rejectProblemDraft(deps, 'prob-1', NOW)).toEqual({
      ok: false,
      error: 'already-rejected',
    });
  });
});

describe('retireBankProblem', () => {
  it('retires an approved problem (rotation)', async () => {
    const deps = makeDeps(problem({ status: 'approved' }));

    const result = await retireBankProblem(deps, 'prob-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.setRetired).toHaveBeenCalledExactlyOnceWith('prob-1', NOW);
  });

  it('refuses to retire a draft (only bank problems rotate; drafts get rejected)', async () => {
    const deps = makeDeps(problem({ status: 'draft' }));
    expect(await retireBankProblem(deps, 'prob-1', NOW)).toEqual({
      ok: false,
      error: 'not-approved',
    });
  });

  it('refuses to retire an already-retired problem', async () => {
    const deps = makeDeps(problem({ status: 'retired' }));
    expect(await retireBankProblem(deps, 'prob-1', NOW)).toEqual({
      ok: false,
      error: 'not-approved',
    });
  });

  it('reports an unknown problem id', async () => {
    expect(await retireBankProblem(makeDeps(null), 'ghost', NOW)).toEqual({
      ok: false,
      error: 'not-found',
    });
  });
});
