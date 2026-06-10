import { describe, expect, it, vi } from 'vitest';
import { XP_AWARDS, poolRankPoints, winXp } from '../../../domain/gamification';
import { closePool, type CloseContext, type ClosePoolDeps, type EntrantAward } from './close-pool';

/**
 * close-pool turns a judged pool into per-entrant awards. The XP/Elo numbers
 * themselves are the kernel's tested job; this slice's job is the DERIVATION —
 * who counts as submitted/judged, who placed where, and that the right award is
 * handed to the (idempotent) persistence dep. So the tests assert the awards
 * array, not the DB.
 */

function makeDeps(ctx: CloseContext | null): {
  deps: ClosePoolDeps;
  finalizeResults: ReturnType<typeof vi.fn>;
} {
  const finalizeResults = vi.fn(async (_poolId: string, awards: EntrantAward[]) => ({
    finalized: awards.length,
  }));
  return {
    deps: { loadCloseContext: async () => ctx, finalizeResults },
    finalizeResults,
  };
}

const awardOf = (r: Awaited<ReturnType<typeof closePool>>, userId: string): EntrantAward => {
  if (!r.ok) throw new Error('expected ok');
  const a = r.awards.find((x) => x.userId === userId);
  if (!a) throw new Error(`no award for ${userId}`);
  return a;
};

describe('closePool', () => {
  it('returns not-found when the pool context is missing', async () => {
    const { deps, finalizeResults } = makeDeps(null);
    const r = await closePool(deps, 'gone');
    expect(r).toEqual({ ok: false, error: 'not-found' });
    expect(finalizeResults).not.toHaveBeenCalled();
  });

  it('awards placement, win XP and rank points to eligible finishers', async () => {
    // Three entrants, all submitted + all judged → all eligible. Ballots make a
    // a clear winner: everyone ranks a > b > c.
    const ctx: CloseContext = {
      difficulty: 'beginner',
      entrants: [
        { userId: 'A', entryId: 'a', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'B', entryId: 'b', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'C', entryId: 'c', hasSubmission: true, moderationStatus: 'none' },
      ],
      judgedEntries: [
        { entryId: 'a', ownerId: 'A' },
        { entryId: 'b', ownerId: 'B' },
        { entryId: 'c', ownerId: 'C' },
      ],
      ballots: [
        { judgeId: 'A', ranking: ['b', 'c'] },
        { judgeId: 'B', ranking: ['a', 'c'] },
        { judgeId: 'C', ranking: ['a', 'b'] },
      ],
    };
    const { deps, finalizeResults } = makeDeps(ctx);
    const r = await closePool(deps, 'p1');
    if (!r.ok) throw new Error('expected ok');

    expect(r.entrants).toBe(3);
    const a = awardOf(r, 'A');
    expect(a.placement).toBe(1);
    expect(a.baseXp).toBe(XP_AWARDS.join + XP_AWARDS.submit + XP_AWARDS.judge + winXp(1, 3));
    expect(a.rankPoints).toBe(poolRankPoints(1, 3, 'beginner'));

    const c = awardOf(r, 'C');
    expect(c.placement).toBe(3);
    expect(c.rankPoints).toBeLessThan(a.rankPoints); // last earns least, but > 0
    expect(c.rankPoints).toBeGreaterThan(0);

    expect(finalizeResults).toHaveBeenCalledWith('p1', r.awards);
  });

  it('gives a non-submitter only join XP and no placement', async () => {
    const ctx: CloseContext = {
      difficulty: 'beginner',
      entrants: [
        { userId: 'A', entryId: 'a', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'B', entryId: 'b', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'C', entryId: 'c', hasSubmission: true, moderationStatus: 'none' },
        // Ghost: joined, never shipped, never judged.
        { userId: 'G', entryId: 'g', hasSubmission: false, moderationStatus: 'none' },
      ],
      judgedEntries: [
        { entryId: 'a', ownerId: 'A' },
        { entryId: 'b', ownerId: 'B' },
        { entryId: 'c', ownerId: 'C' },
      ],
      ballots: [
        { judgeId: 'A', ranking: ['b', 'c'] },
        { judgeId: 'B', ranking: ['a', 'c'] },
        { judgeId: 'C', ranking: ['a', 'b'] },
      ],
    };
    const { deps } = makeDeps(ctx);
    const r = await closePool(deps, 'p1');
    const g = awardOf(r, 'G');
    expect(g).toMatchObject({ submitted: false, judged: false, placement: null, rankPoints: 0 });
    expect(g.baseXp).toBe(XP_AWARDS.join);
  });

  it('keeps a submitter who skipped judging out of the award order (judge-to-win)', async () => {
    const ctx: CloseContext = {
      difficulty: 'intermediate',
      entrants: [
        { userId: 'A', entryId: 'a', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'B', entryId: 'b', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'C', entryId: 'c', hasSubmission: true, moderationStatus: 'none' },
      ],
      judgedEntries: [
        { entryId: 'a', ownerId: 'A' },
        { entryId: 'b', ownerId: 'B' },
        { entryId: 'c', ownerId: 'C' },
      ],
      // B never cast a ballot → not "completed" → ineligible to win.
      ballots: [
        { judgeId: 'A', ranking: ['b', 'c'] },
        { judgeId: 'C', ranking: ['a', 'b'] },
      ],
    };
    const { deps } = makeDeps(ctx);
    const r = await closePool(deps, 'p1');

    const b = awardOf(r, 'B');
    expect(b.judged).toBe(false);
    expect(b.placement).toBeNull(); // top score can't save you if you didn't judge
    expect(b.rankPoints).toBe(0);
    expect(b.baseXp).toBe(XP_AWARDS.join + XP_AWARDS.submit); // shipped, but no judge/win

    // Only A and C placed; the field that scales win XP is 2, not 3.
    const a = awardOf(r, 'A');
    expect(a.placement).toBe(1);
    expect(a.baseXp).toBe(XP_AWARDS.join + XP_AWARDS.submit + XP_AWARDS.judge + winXp(1, 2));
  });

  it('denies submit XP and placement to a flagged entry but keeps join XP', async () => {
    const ctx: CloseContext = {
      difficulty: 'beginner',
      entrants: [
        { userId: 'A', entryId: 'a', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'B', entryId: 'b', hasSubmission: true, moderationStatus: 'none' },
        // Cheater: submitted, judged, but anti-cheat upheld the flag.
        { userId: 'X', entryId: 'x', hasSubmission: true, moderationStatus: 'upheld' },
      ],
      // The flagged entry is NOT in the judgeable field (listJudgeableEntries excludes it).
      judgedEntries: [
        { entryId: 'a', ownerId: 'A' },
        { entryId: 'b', ownerId: 'B' },
      ],
      ballots: [
        { judgeId: 'A', ranking: ['b', 'x'] }, // ranked x before the flag — reconciled away
        { judgeId: 'B', ranking: ['a', 'x'] },
        { judgeId: 'X', ranking: ['a', 'b'] },
      ],
    };
    const { deps } = makeDeps(ctx);
    const r = await closePool(deps, 'p1');

    const x = awardOf(r, 'X');
    expect(x).toMatchObject({ submitted: false, placement: null, rankPoints: 0 });
    expect(x.baseXp).toBe(XP_AWARDS.join + XP_AWARDS.judge); // judged, but submission void
    // The pool still resolves cleanly over the surviving two entries.
    expect(awardOf(r, 'A').placement).toBe(1);
    expect(awardOf(r, 'B').placement).toBe(2);
  });

  it('closes a too-small pool with no ballots — everyone keeps participation XP', async () => {
    const ctx: CloseContext = {
      difficulty: 'beginner',
      entrants: [
        { userId: 'A', entryId: 'a', hasSubmission: true, moderationStatus: 'none' },
        { userId: 'B', entryId: 'b', hasSubmission: true, moderationStatus: 'none' },
      ],
      judgedEntries: [
        { entryId: 'a', ownerId: 'A' },
        { entryId: 'b', ownerId: 'B' },
      ],
      ballots: [], // below MIN_JUDGEABLE_ENTRIES → no judging round ran
    };
    const { deps } = makeDeps(ctx);
    const r = await closePool(deps, 'p1');
    if (!r.ok) throw new Error('expected ok');

    for (const a of r.awards) {
      expect(a.placement).toBeNull();
      expect(a.rankPoints).toBe(0);
      expect(a.baseXp).toBe(XP_AWARDS.join + XP_AWARDS.submit); // shipped, nobody judged
    }
  });
});
