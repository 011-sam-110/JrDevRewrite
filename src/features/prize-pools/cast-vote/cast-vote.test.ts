import { describe, expect, it, vi } from 'vitest';
import { castVote, type CastVoteDeps, type JudgingContext } from './cast-vote';

/**
 * The judging-submission slice: a judge ranks their assigned set. The kernel
 * owns both validation rules (checkAssignmentBallot for "ranked exactly my
 * assigned set", checkBallot for structural validity incl. self-vote
 * impossibility); this slice orchestrates load → both gates → persist, and
 * touches the DB only when every gate passes. Tests pin the gate order and the
 * guards (judging-state, assigned, at-most-once).
 */

const NOW = new Date('2026-07-20T12:00:00Z');

/** A 3-entry pool: the judge owns e-self, is assigned the other two. */
function baseContext(overrides: Partial<JudgingContext> = {}): JudgingContext {
  return {
    poolStatus: 'judging',
    assignedEntryIds: ['e-a', 'e-b'],
    judgedEntries: [
      { entryId: 'e-self', ownerId: 'judge-1' },
      { entryId: 'e-a', ownerId: 'user-a' },
      { entryId: 'e-b', ownerId: 'user-b' },
    ],
    alreadyVoted: false,
    ...overrides,
  };
}

function makeDeps(ctx: JudgingContext | null, overrides: Partial<CastVoteDeps> = {}): CastVoteDeps {
  return {
    loadJudgingContext: vi.fn(async () => ctx),
    recordBallot: vi.fn(async () => {}),
    ...overrides,
  };
}

const input = (ranking: string[]) => ({ userId: 'judge-1', poolId: 'pool-1', ranking });

describe('castVote — happy path', () => {
  it('records the ballot when it ranks exactly the assigned set', async () => {
    const deps = makeDeps(baseContext());
    const result = await castVote(deps, input(['e-b', 'e-a']), NOW);

    expect(result).toEqual({ ok: true });
    expect(deps.recordBallot).toHaveBeenCalledWith({
      poolId: 'pool-1',
      judgeUserId: 'judge-1',
      ranking: ['e-b', 'e-a'],
      submittedAt: NOW,
    });
  });
});

describe('castVote — state & duty guards (no DB write)', () => {
  it('rejects when the pool is not in judging', async () => {
    const deps = makeDeps(baseContext({ poolStatus: 'building' }));
    const result = await castVote(deps, input(['e-a', 'e-b']), NOW);

    expect(result).toEqual({ ok: false, error: 'not-judging' });
    expect(deps.recordBallot).not.toHaveBeenCalled();
  });

  it('rejects a non-entrant / unassigned judge', async () => {
    const deps = makeDeps(baseContext({ assignedEntryIds: [] }));
    const result = await castVote(deps, input([]), NOW);

    expect(result).toEqual({ ok: false, error: 'not-assigned' });
    expect(deps.recordBallot).not.toHaveBeenCalled();
  });

  it('rejects a second ballot (judging duty is at-most-once)', async () => {
    const deps = makeDeps(baseContext({ alreadyVoted: true }));
    const result = await castVote(deps, input(['e-a', 'e-b']), NOW);

    expect(result).toEqual({ ok: false, error: 'already-voted' });
    expect(deps.recordBallot).not.toHaveBeenCalled();
  });

  it('returns not-found when there is no judging context', async () => {
    const deps = makeDeps(null);
    const result = await castVote(deps, input(['e-a']), NOW);

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('castVote — ballot validity (kernel-gated)', () => {
  it('rejects an incomplete ranking (coverage)', async () => {
    const deps = makeDeps(baseContext());
    const result = await castVote(deps, input(['e-a']), NOW);

    expect(result).toEqual({ ok: false, error: 'coverage', reasons: ['incomplete'] });
    expect(deps.recordBallot).not.toHaveBeenCalled();
  });

  it('rejects ranking an entry outside the assigned set (coverage)', async () => {
    const deps = makeDeps(baseContext());
    const result = await castVote(deps, input(['e-a', 'e-b', 'e-self']), NOW);

    // Own entry isn't assigned → caught as unassigned before checkBallot's self-vote.
    expect(result).toEqual({ ok: false, error: 'coverage', reasons: ['unassigned-entry'] });
    expect(deps.recordBallot).not.toHaveBeenCalled();
  });
});
