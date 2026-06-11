import { describe, expect, it } from 'vitest';
import {
  approveProblem,
  BATTLE_LANGUAGES,
  checkProblemSpec,
  isBattleLanguage,
  isPlayable,
  isProblemTier,
  MIN_HIDDEN_TESTS,
  PROBLEM_STATUSES,
  PROBLEM_TIERS,
  retireProblem,
  type ProblemSpec,
} from './problems';

/** A fully valid spec the cases below break one field at a time. */
function validSpec(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
  return {
    slug: 'sum-two-numbers',
    title: 'Sum Two Numbers',
    statementMd: 'Read two integers and print their sum.',
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

describe('problem tiers & statuses', () => {
  it('defines exactly three difficulty tiers (binding: 3 tiers)', () => {
    expect(PROBLEM_TIERS).toEqual(['easy', 'medium', 'hard']);
  });

  it('defines the draft/approved/retired status space (binding)', () => {
    expect(PROBLEM_STATUSES).toEqual(['draft', 'approved', 'retired']);
  });

  it('isProblemTier narrows correctly', () => {
    expect(isProblemTier('easy')).toBe(true);
    expect(isProblemTier('medium')).toBe(true);
    expect(isProblemTier('hard')).toBe(true);
    expect(isProblemTier('beginner')).toBe(false); // pool difficulty ≠ problem tier
    expect(isProblemTier('')).toBe(false);
  });
});

describe('battle languages (v1 set — pending confirmation from Sampo)', () => {
  it('covers Python, JavaScript, TypeScript, Java, C++', () => {
    expect(BATTLE_LANGUAGES).toEqual(['python', 'javascript', 'typescript', 'java', 'cpp']);
  });

  it('isBattleLanguage narrows correctly', () => {
    expect(isBattleLanguage('python')).toBe(true);
    expect(isBattleLanguage('cpp')).toBe(true);
    expect(isBattleLanguage('rust')).toBe(false);
    expect(isBattleLanguage('')).toBe(false);
  });
});

describe('checkProblemSpec', () => {
  it('accepts a valid spec', () => {
    expect(checkProblemSpec(validSpec())).toEqual({ ok: true });
  });

  it('collects ALL failed reasons, not just the first', () => {
    const verdict = checkProblemSpec(
      validSpec({ slug: '', title: ' ', statementMd: '', referenceSolution: '', hiddenTests: [] }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error('unreachable');
    expect(verdict.reasons).toEqual(
      expect.arrayContaining([
        'missing-slug',
        'missing-title',
        'missing-statement',
        'missing-reference-solution',
        'too-few-hidden-tests',
      ]),
    );
  });

  it('rejects a malformed slug (uppercase / spaces / non-url-safe)', () => {
    for (const slug of ['Sum Two', 'UPPER', 'a_b', 'a--b ', 'ünïcode']) {
      const verdict = checkProblemSpec(validSpec({ slug }));
      expect(verdict, slug).toEqual({ ok: false, reasons: ['malformed-slug'] });
    }
    expect(checkProblemSpec(validSpec({ slug: 'two-sum-2' }))).toEqual({ ok: true });
  });

  it(`requires at least MIN_HIDDEN_TESTS (${MIN_HIDDEN_TESTS}) IO pairs`, () => {
    const tests = validSpec().hiddenTests.slice(0, MIN_HIDDEN_TESTS - 1);
    expect(checkProblemSpec(validSpec({ hiddenTests: tests }))).toEqual({
      ok: false,
      reasons: ['too-few-hidden-tests'],
    });
  });

  it('rejects a hidden test with an empty expected output (nothing to judge against)', () => {
    const spec = validSpec();
    spec.hiddenTests = [...spec.hiddenTests, { input: '9 9', expectedOutput: '  ' }];
    expect(checkProblemSpec(spec)).toEqual({ ok: false, reasons: ['empty-expected-output'] });
  });

  it('allows a hidden test with empty INPUT (some problems read nothing)', () => {
    const spec = validSpec();
    spec.hiddenTests = [...spec.hiddenTests, { input: '', expectedOutput: 'hello' }];
    expect(checkProblemSpec(spec)).toEqual({ ok: true });
  });

  it('rejects duplicate hidden-test inputs (a duplicate adds no signal, skews scoring)', () => {
    const spec = validSpec();
    spec.hiddenTests = [...spec.hiddenTests, { input: '1 2', expectedOutput: '3' }];
    expect(checkProblemSpec(spec)).toEqual({ ok: false, reasons: ['duplicate-test-input'] });
  });

  it('rejects an unsupported tier or reference language', () => {
    expect(checkProblemSpec(validSpec({ tier: 'beginner' as never }))).toEqual({
      ok: false,
      reasons: ['invalid-tier'],
    });
    expect(checkProblemSpec(validSpec({ referenceLanguage: 'rust' as never }))).toEqual({
      ok: false,
      reasons: ['unsupported-language'],
    });
  });
});

describe('approveProblem (draft → approved, the operator gate)', () => {
  it('approves a draft', () => {
    expect(approveProblem('draft')).toEqual({ ok: true, status: 'approved' });
  });

  it('rejects approving anything but a draft', () => {
    expect(approveProblem('approved')).toEqual({ ok: false, error: 'not-a-draft' });
    expect(approveProblem('retired')).toEqual({ ok: false, error: 'not-a-draft' });
  });
});

describe('retireProblem (approved → retired, the rotation move)', () => {
  it('retires an approved problem', () => {
    expect(retireProblem('approved')).toEqual({ ok: true, status: 'retired' });
  });

  it('rejects retiring anything but an approved problem', () => {
    expect(retireProblem('draft')).toEqual({ ok: false, error: 'not-approved' });
    expect(retireProblem('retired')).toEqual({ ok: false, error: 'not-approved' });
  });
});

describe('isPlayable', () => {
  it('only approved problems may be served into a battle', () => {
    expect(isPlayable('approved')).toBe(true);
    expect(isPlayable('draft')).toBe(false);
    expect(isPlayable('retired')).toBe(false);
  });
});
