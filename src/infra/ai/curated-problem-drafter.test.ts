import { describe, expect, it } from 'vitest';
import { checkProblemSpec, PROBLEM_TIERS, type ProblemTier } from '@/domain/battles';
import { CuratedProblemDrafter } from './curated-problem-drafter';
import { PROBLEM_FIXTURES } from './problem-fixtures';

describe('PROBLEM_FIXTURES (the seed library)', () => {
  it('ships at least 30 problems across all three tiers', () => {
    expect(PROBLEM_FIXTURES.length).toBeGreaterThanOrEqual(30);
    const byTier: Record<ProblemTier, number> = { easy: 0, medium: 0, hard: 0 };
    for (const p of PROBLEM_FIXTURES) byTier[p.tier]++;
    for (const tier of PROBLEM_TIERS) {
      expect(byTier[tier], `tier ${tier}`).toBeGreaterThan(0);
    }
  });

  it('every fixture is structurally valid (the kernel gate the pipeline runs)', () => {
    for (const spec of PROBLEM_FIXTURES) {
      expect(checkProblemSpec(spec), spec.slug).toEqual({ ok: true });
    }
  });

  it('fixture slugs are unique (dedup key)', () => {
    const slugs = PROBLEM_FIXTURES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('CuratedProblemDrafter', () => {
  it('serves specs for the requested tier, capped at count', async () => {
    const drafter = new CuratedProblemDrafter();
    const easy = await drafter.draft({ tier: 'easy', count: 3 });
    expect(easy).toHaveLength(3);
    expect(easy.every((s) => s.tier === 'easy')).toBe(true);
  });

  it('skips slugs already in the bank', async () => {
    const drafter = new CuratedProblemDrafter();
    const all = await drafter.draft({ tier: 'easy', count: 100 });
    const skipOne = await drafter.draft({
      tier: 'easy',
      count: 100,
      existingSlugs: new Set([all[0]!.slug]),
    });
    expect(skipOne.map((s) => s.slug)).not.toContain(all[0]!.slug);
    expect(skipOne).toHaveLength(all.length - 1);
  });

  it('reports its source as curated', () => {
    expect(new CuratedProblemDrafter().source).toBe('curated');
  });
});
