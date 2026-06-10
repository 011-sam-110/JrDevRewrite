import { describe, expect, it } from 'vitest';
import {
  assessOriginality,
  DEFAULT_ORIGINALITY_THRESHOLDS,
  type OriginalityThresholds,
  type SimilarityComparison,
} from './originality';

/**
 * The duplicate/reuse predicate is pure (CLAUDE.md → anti-cheat predicates are
 * a unit-testable kernel). It takes similarity SCORES (the infra adapter does
 * the actual comparing) and decides whether any cross the flagging threshold.
 * Written before the implementation — every branch covered, deterministic
 * regardless of input order.
 */

function cmp(kind: SimilarityComparison['kind'], ref: string, score: number): SimilarityComparison {
  return { kind, ref, score };
}

describe('assessOriginality — clears', () => {
  it('no comparisons at all (first/only submitter) — top score 0', () => {
    expect(assessOriginality([])).toEqual({ ok: true, topScore: 0 });
  });

  it('everything safely below threshold — reports the highest score seen', () => {
    const result = assessOriginality([cmp('co-entry', 'e2', 0.4), cmp('prior-own', 'e9', 0.61)]);
    expect(result).toEqual({ ok: true, topScore: 0.61 });
  });
});

describe('assessOriginality — flags duplicates of other entrants', () => {
  it('a co-entry at the threshold flags (inclusive boundary)', () => {
    const result = assessOriginality([cmp('co-entry', 'e2', 0.8)]);
    expect(result).toEqual({
      ok: false,
      flags: ['duplicate-co-entry'],
      matches: [{ kind: 'co-entry', ref: 'e2', score: 0.8 }],
      topScore: 0.8,
    });
  });

  it('a co-entry just below the threshold does not flag', () => {
    expect(assessOriginality([cmp('co-entry', 'e2', 0.7999)])).toEqual({
      ok: true,
      topScore: 0.7999,
    });
  });

  it('an identical repo (score 1) is the clearest collusion/reuse signal', () => {
    const result = assessOriginality([cmp('co-entry', 'e2', 1)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.flags).toEqual(['duplicate-co-entry']);
  });
});

describe('assessOriginality — flags reuse of the entrant own prior work', () => {
  it('a prior-own submission over threshold flags reuse', () => {
    const result = assessOriginality([cmp('prior-own', 'old-1', 0.95)]);
    expect(result).toEqual({
      ok: false,
      flags: ['reused-prior-work'],
      matches: [{ kind: 'prior-own', ref: 'old-1', score: 0.95 }],
      topScore: 0.95,
    });
  });
});

describe('assessOriginality — multiple signals', () => {
  it('raises both flags when both kinds cross threshold', () => {
    const result = assessOriginality([cmp('co-entry', 'e2', 0.9), cmp('prior-own', 'old-1', 0.85)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Deterministic flag order regardless of comparison order.
      expect(result.flags).toEqual(['duplicate-co-entry', 'reused-prior-work']);
    }
  });

  it('the same flag is not duplicated across several matching co-entries', () => {
    const result = assessOriginality([cmp('co-entry', 'e2', 0.9), cmp('co-entry', 'e3', 0.88)]);
    if (!result.ok) expect(result.flags).toEqual(['duplicate-co-entry']);
  });

  it('sorts matches by score desc, then ref asc — stable for the operator', () => {
    const result = assessOriginality([
      cmp('co-entry', 'e5', 0.9),
      cmp('co-entry', 'e2', 0.95),
      cmp('co-entry', 'e3', 0.9),
      cmp('co-entry', 'below', 0.1),
    ]);
    if (!result.ok) {
      expect(result.matches).toEqual([
        { kind: 'co-entry', ref: 'e2', score: 0.95 },
        { kind: 'co-entry', ref: 'e3', score: 0.9 },
        { kind: 'co-entry', ref: 'e5', score: 0.9 },
      ]);
    }
  });

  it('is order-independent — shuffled input yields the same verdict', () => {
    const a = assessOriginality([cmp('co-entry', 'e2', 0.9), cmp('prior-own', 'o1', 0.85)]);
    const b = assessOriginality([cmp('prior-own', 'o1', 0.85), cmp('co-entry', 'e2', 0.9)]);
    expect(a).toEqual(b);
  });
});

describe('assessOriginality — per-kind thresholds', () => {
  it('honours different thresholds for each kind', () => {
    const lenientReuse: OriginalityThresholds = { coEntry: 0.8, priorOwn: 0.99 };
    // 0.9 flags as a co-entry duplicate but is tolerated as own prior work.
    const result = assessOriginality(
      [cmp('co-entry', 'e2', 0.9), cmp('prior-own', 'o1', 0.9)],
      lenientReuse,
    );
    if (!result.ok) {
      expect(result.flags).toEqual(['duplicate-co-entry']);
      expect(result.matches).toEqual([{ kind: 'co-entry', ref: 'e2', score: 0.9 }]);
    }
  });

  it('exposes the default thresholds it uses', () => {
    expect(DEFAULT_ORIGINALITY_THRESHOLDS).toEqual({ coEntry: 0.8, priorOwn: 0.8 });
  });
});

describe('assessOriginality — defends against corrupt input', () => {
  it.each([1.5, -0.1, Number.NaN])('throws on an out-of-range score (%s)', (score) => {
    expect(() => assessOriginality([cmp('co-entry', 'e2', score)])).toThrow(RangeError);
  });
});
