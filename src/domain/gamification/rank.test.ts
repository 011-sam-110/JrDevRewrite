import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RANK_WEIGHT, poolRankPoints, RANK_POINTS_BASE } from './rank';

/**
 * Rank points feed difficulty gating, so the rules that matter are: better
 * placements earn more, harder pools earn more, and not placing earns nothing
 * (no rank from ghosting). Exact numbers are dials; these orderings are not.
 */

describe('poolRankPoints', () => {
  it('pays the base × weight to a sole first place', () => {
    expect(poolRankPoints(1, 1, 'beginner')).toBe(RANK_POINTS_BASE);
    expect(poolRankPoints(1, 1, 'advanced')).toBe(
      RANK_POINTS_BASE * DIFFICULTY_RANK_WEIGHT.advanced,
    );
  });

  it('decays with placement', () => {
    const first = poolRankPoints(1, 6, 'intermediate');
    const last = poolRankPoints(6, 6, 'intermediate');
    expect(first).toBeGreaterThan(last);
    expect(last).toBeGreaterThan(0);
  });

  it('pays strictly more for the same placement in a harder pool', () => {
    const beg = poolRankPoints(1, 8, 'beginner');
    const int = poolRankPoints(1, 8, 'intermediate');
    const adv = poolRankPoints(1, 8, 'advanced');
    expect(int).toBeGreaterThan(beg);
    expect(adv).toBeGreaterThan(int);
  });

  it('earns nothing for not placing', () => {
    expect(poolRankPoints(null, 6, 'advanced')).toBe(0);
    expect(poolRankPoints(0, 6, 'beginner')).toBe(0);
    expect(poolRankPoints(7, 6, 'beginner')).toBe(0);
    expect(poolRankPoints(1, 0, 'beginner')).toBe(0);
  });

  it('can clear the intermediate unlock with a few strong finishes', () => {
    // Sanity-check the curve against the entry.ts threshold (100): four
    // first-place beginner finishes in a full field should get you there.
    const oneWin = poolRankPoints(1, 30, 'beginner');
    expect(oneWin * 4).toBeGreaterThanOrEqual(100);
  });
});
