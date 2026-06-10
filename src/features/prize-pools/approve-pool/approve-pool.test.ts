import { describe, expect, it, vi } from 'vitest';
import { approveDraft, rejectDraft, type ApprovePoolDeps, type DraftPool } from './approve-pool';

const NOW = new Date('2026-06-10T12:00:00Z');

function draft(overrides: Partial<DraftPool> = {}): DraftPool {
  return {
    id: 'pool-1',
    status: 'draft',
    rejectedAt: null,
    windows: { joinHours: 72, buildHours: 168, judgingHours: 72 },
    ...overrides,
  };
}

function makeDeps(pool: DraftPool | null): ApprovePoolDeps {
  return {
    getPool: vi.fn().mockResolvedValue(pool),
    publishPool: vi.fn().mockResolvedValue(undefined),
    markRejected: vi.fn().mockResolvedValue(undefined),
  };
}

describe('approveDraft', () => {
  it('publishes a draft with deadlines scheduled from the approval instant', async () => {
    const deps = makeDeps(draft());

    const result = await approveDraft(deps, 'pool-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.publishPool).toHaveBeenCalledExactlyOnceWith('pool-1', {
      status: 'published',
      publishedAt: NOW,
      joinDeadline: new Date('2026-06-13T12:00:00Z'),
      buildDeadline: new Date('2026-06-20T12:00:00Z'),
      judgingDeadline: new Date('2026-06-23T12:00:00Z'),
    });
  });

  it('refuses a pool that is not a draft (kernel rule, not re-derived here)', async () => {
    const deps = makeDeps(draft({ status: 'published' }));

    const result = await approveDraft(deps, 'pool-1', NOW);

    expect(result).toEqual({ ok: false, error: 'not-a-draft' });
    expect(deps.publishPool).not.toHaveBeenCalled();
  });

  it('refuses a draft the operator already rejected', async () => {
    const deps = makeDeps(draft({ rejectedAt: new Date('2026-06-09T00:00:00Z') }));

    const result = await approveDraft(deps, 'pool-1', NOW);

    expect(result).toEqual({ ok: false, error: 'already-rejected' });
    expect(deps.publishPool).not.toHaveBeenCalled();
  });

  it('reports an unknown pool id', async () => {
    const deps = makeDeps(null);
    expect(await approveDraft(deps, 'ghost', NOW)).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('rejectDraft', () => {
  it('archives a draft by stamping rejectedAt', async () => {
    const deps = makeDeps(draft());

    const result = await rejectDraft(deps, 'pool-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.markRejected).toHaveBeenCalledExactlyOnceWith('pool-1', NOW);
  });

  it('refuses to reject a pool that already left draft', async () => {
    const deps = makeDeps(draft({ status: 'building' }));

    const result = await rejectDraft(deps, 'pool-1', NOW);

    expect(result).toEqual({ ok: false, error: 'not-a-draft' });
    expect(deps.markRejected).not.toHaveBeenCalled();
  });

  it('refuses a double rejection', async () => {
    const deps = makeDeps(draft({ rejectedAt: new Date('2026-06-09T00:00:00Z') }));

    const result = await rejectDraft(deps, 'pool-1', NOW);

    expect(result).toEqual({ ok: false, error: 'already-rejected' });
    expect(deps.markRejected).not.toHaveBeenCalled();
  });

  it('reports an unknown pool id', async () => {
    const deps = makeDeps(null);
    expect(await rejectDraft(deps, 'ghost', NOW)).toEqual({ ok: false, error: 'not-found' });
  });
});
