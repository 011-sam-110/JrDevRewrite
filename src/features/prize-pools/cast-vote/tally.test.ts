import { describe, expect, it, vi } from 'vitest';
import type { Ballot } from '@/domain/prize-pools';
import { tallyPool, type TallyDeps } from './tally';

/**
 * Aggregation wiring (M8 acceptance #3): feed real ballots through the M3
 * vote-aggregation kernel. The kernel's scoring/eligibility maths is tested in
 * domain/; this proves the WIRING — completion is derived from "who cast a
 * ballot" (cast-vote enforced full coverage at write time), so a judge who
 * skipped their duty is excluded from the award order even if their own entry
 * won the most votes.
 */

const entries = [
  { entryId: 'a', ownerId: 'ua' },
  { entryId: 'b', ownerId: 'ub' },
  { entryId: 'c', ownerId: 'uc' },
];

function makeDeps(ballots: Ballot[]): TallyDeps {
  return {
    loadJudgedEntries: vi.fn(async () => entries),
    loadBallots: vi.fn(async () => ballots),
  };
}

describe('tallyPool — judge-to-win eligibility', () => {
  it('excludes the top-scoring entry when its owner skipped judging', async () => {
    // uc never votes, yet entry c wins every first-place vote it gets.
    const deps = makeDeps([
      { judgeId: 'ua', ranking: ['c', 'b'] },
      { judgeId: 'ub', ranking: ['c', 'a'] },
    ]);

    const result = await tallyPool(deps, 'pool-1');

    // Honest table: c is genuinely top by score…
    expect(result.standings[0]).toMatchObject({ entryId: 'c', eligibleToWin: false });
    // …but the award order skips it — uc didn't complete their duty.
    expect(result.finalPlacements).not.toContain('c');
    expect(result.finalPlacements.every((id) => id === 'a' || id === 'b')).toBe(true);
  });

  it('everyone who judged is eligible; the placements reflect the votes', async () => {
    const deps = makeDeps([
      { judgeId: 'ua', ranking: ['b', 'c'] },
      { judgeId: 'ub', ranking: ['a', 'c'] },
      { judgeId: 'uc', ranking: ['a', 'b'] },
    ]);

    const result = await tallyPool(deps, 'pool-1');

    expect(new Set(result.finalPlacements)).toEqual(new Set(['a', 'b', 'c']));
  });
});
