import { describe, expect, it, vi } from 'vitest';
import { LocalSimilarityClient } from '../../../infra/similarity';
import {
  scanSubmissions,
  type PoolSubmission,
  type PriorSubmission,
  type ScanSubmissionsDeps,
} from './scan-submissions';

/**
 * Slice behaviour: the kernel's assessOriginality decides each verdict (its
 * edges are tested in domain/), so these cover the ORCHESTRATION — who gets
 * compared against whom, which entries a scan is allowed to touch, and that a
 * flag is persisted exactly when (and only when) the predicate fails. The
 * similarity maths is the real LocalSimilarityClient (pure), so the fingerprints
 * tell the whole story.
 */

const NOW = new Date('2026-07-20T12:00:00Z');
const similarity = new LocalSimilarityClient();

/** A fingerprint standing in for "this entry's repo" — same repo ⇒ same tokens. */
function repo(name: string): string[] {
  return [`owner:org`, `name:${name}`];
}

function sub(overrides: Partial<PoolSubmission> & Pick<PoolSubmission, 'entryId'>): PoolSubmission {
  return {
    userId: `user-${overrides.entryId}`,
    moderationStatus: 'none',
    fingerprint: { entryId: overrides.entryId, tokens: repo(overrides.entryId) },
    ...overrides,
  };
}

function makeDeps(
  submissions: PoolSubmission[],
  priors: Record<string, PriorSubmission[]> = {},
): ScanSubmissionsDeps {
  return {
    loadPoolSubmissions: vi.fn(async () => submissions),
    loadPriorSubmissions: vi.fn(async (userId: string) => priors[userId] ?? []),
    compare: (a, b) => similarity.compare(a, b),
    flagEntry: vi.fn(async () => {}),
  };
}

describe('scanSubmissions — duplicate detection across entrants', () => {
  it('flags both entrants who submitted the same repo (co-entry collusion)', async () => {
    const same = { tokens: repo('todo-api') };
    const subs = [
      sub({ entryId: 'a', fingerprint: { entryId: 'a', ...same } }),
      sub({ entryId: 'b', fingerprint: { entryId: 'b', ...same } }),
    ];
    const deps = makeDeps(subs);

    const report = await scanSubmissions(deps, 'pool-1', NOW);

    expect(report.scanned).toBe(2);
    expect(report.flagged.map((f) => f.entryId).sort()).toEqual(['a', 'b']);
    expect(deps.flagEntry).toHaveBeenCalledTimes(2);
    expect(deps.flagEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'a', reasons: ['duplicate-co-entry'], flaggedAt: NOW }),
    );
  });

  it('leaves original, unrelated submissions untouched', async () => {
    const deps = makeDeps([sub({ entryId: 'a' }), sub({ entryId: 'b' }), sub({ entryId: 'c' })]);

    const report = await scanSubmissions(deps, 'pool-1', NOW);

    expect(report.scanned).toBe(3);
    expect(report.flagged).toEqual([]);
    expect(deps.flagEntry).not.toHaveBeenCalled();
  });

  it('does not treat one person twice as collusion (same userId not compared)', async () => {
    // Defensive: the unique (pool,user) index forbids this, but the rule must
    // not flag a person against themselves even if it somehow occurs.
    const same = repo('dup');
    const deps = makeDeps([
      sub({ entryId: 'a', userId: 'solo', fingerprint: { entryId: 'a', tokens: same } }),
      sub({ entryId: 'b', userId: 'solo', fingerprint: { entryId: 'b', tokens: same } }),
    ]);

    const report = await scanSubmissions(deps, 'pool-1', NOW);

    expect(report.flagged).toEqual([]);
  });
});

describe('scanSubmissions — reuse of the entrant own prior work', () => {
  it('flags a submission matching the user prior submission in another pool', async () => {
    const reused = repo('last-term-project');
    const priors: Record<string, PriorSubmission[]> = {
      'user-a': [{ entryId: 'old-entry', fingerprint: { entryId: 'old-entry', tokens: reused } }],
    };
    const deps = makeDeps(
      [sub({ entryId: 'a', userId: 'user-a', fingerprint: { entryId: 'a', tokens: reused } })],
      priors,
    );

    const report = await scanSubmissions(deps, 'pool-1', NOW);

    expect(report.flagged).toEqual([{ entryId: 'a', reasons: ['reused-prior-work'] }]);
    expect(deps.loadPriorSubmissions).toHaveBeenCalledWith('user-a', 'pool-1');
    expect(deps.flagEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'a',
        reasons: ['reused-prior-work'],
        matches: [{ kind: 'prior-own', ref: 'old-entry', score: 1 }],
      }),
    );
  });
});

describe('scanSubmissions — respects prior moderation decisions', () => {
  it('does not re-flag or re-evaluate an already-reviewed entry, but still compares against it', async () => {
    // `b` was cleared by the operator; `a` is identical to it. `a` must be
    // flagged (b is a valid comparison target) but `b` must be left alone.
    const same = repo('dup');
    const deps = makeDeps([
      sub({ entryId: 'a', fingerprint: { entryId: 'a', tokens: same } }),
      sub({
        entryId: 'b',
        moderationStatus: 'cleared',
        fingerprint: { entryId: 'b', tokens: same },
      }),
    ]);

    const report = await scanSubmissions(deps, 'pool-1', NOW);

    expect(report.scanned).toBe(1); // only `a` was eligible to be (re)scanned
    expect(report.flagged).toEqual([{ entryId: 'a', reasons: ['duplicate-co-entry'] }]);
    expect(deps.flagEntry).toHaveBeenCalledOnce();
    expect(deps.flagEntry).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'a' }));
  });

  it('an empty pool scans nothing', async () => {
    const deps = makeDeps([]);
    const report = await scanSubmissions(deps, 'pool-1', NOW);
    expect(report).toEqual({ scanned: 0, flagged: [] });
    expect(deps.flagEntry).not.toHaveBeenCalled();
  });
});
