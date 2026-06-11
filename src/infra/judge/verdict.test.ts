import { describe, expect, it } from 'vitest';
import { aggregateRun, JUDGE0_LANGUAGE_IDS, mapJudge0Status } from './verdict';
import type { TestResult } from './types';

describe('mapJudge0Status', () => {
  it('maps the queue states to pending', () => {
    expect(mapJudge0Status(1)).toBe('pending'); // In Queue
    expect(mapJudge0Status(2)).toBe('pending'); // Processing
  });

  it('maps the settled states to typed verdicts', () => {
    expect(mapJudge0Status(3)).toBe('accepted');
    expect(mapJudge0Status(4)).toBe('wrong-answer');
    expect(mapJudge0Status(5)).toBe('time-limit');
    expect(mapJudge0Status(6)).toBe('compile-error');
  });

  it('maps every runtime-error variant (7–12) to runtime-error', () => {
    for (const id of [7, 8, 9, 10, 11, 12]) {
      expect(mapJudge0Status(id), `status ${id}`).toBe('runtime-error');
    }
  });

  it('maps internal/exec-format errors (13, 14) and unknown ids to internal-error', () => {
    expect(mapJudge0Status(13)).toBe('internal-error');
    expect(mapJudge0Status(14)).toBe('internal-error');
    expect(mapJudge0Status(999)).toBe('internal-error');
    expect(mapJudge0Status(0)).toBe('internal-error');
  });
});

describe('aggregateRun', () => {
  const accepted = (i: number): TestResult => ({
    testIndex: i,
    verdict: 'accepted',
    timeSeconds: 0.1,
  });

  it('all accepted → passedAll with full count', () => {
    const run = aggregateRun([accepted(0), accepted(1), accepted(2)]);
    expect(run.passedAll).toBe(true);
    expect(run.testsPassed).toBe(3);
  });

  it('any non-accepted verdict breaks passedAll but partial credit counts', () => {
    const run = aggregateRun([
      accepted(0),
      { testIndex: 1, verdict: 'wrong-answer', timeSeconds: 0.1 },
      accepted(2),
    ]);
    expect(run.passedAll).toBe(false);
    expect(run.testsPassed).toBe(2);
  });

  it('an empty result set never counts as passedAll (nothing was proven)', () => {
    const run = aggregateRun([]);
    expect(run.passedAll).toBe(false);
    expect(run.testsPassed).toBe(0);
  });
});

describe('JUDGE0_LANGUAGE_IDS', () => {
  it('covers every battle language', () => {
    expect(Object.keys(JUDGE0_LANGUAGE_IDS).sort()).toEqual(
      ['cpp', 'java', 'javascript', 'python', 'typescript'].sort(),
    );
  });
});
