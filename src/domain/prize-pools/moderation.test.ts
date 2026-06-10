import { describe, expect, it } from 'vitest';
import {
  canAutoFlag,
  isJudgeable,
  MODERATION_STATUSES,
  reviewFlag,
  type ModerationStatus,
} from './moderation';

/**
 * The flag lifecycle is pure (CLAUDE.md → anti-cheat is a unit-testable kernel).
 * A submission's moderation status decides two things: whether it counts toward
 * judging/results, and whether an automatic scan is allowed to touch it. The
 * review transition (uphold/clear) is the operator's only move. Written before
 * the implementation.
 */

describe('isJudgeable — flagged work is excluded from judging/results', () => {
  it.each([
    ['none', true],
    ['cleared', true],
    ['flagged', false],
    ['upheld', false],
  ] as [ModerationStatus, boolean][])('%s → judgeable: %s', (status, expected) => {
    expect(isJudgeable(status)).toBe(expected);
  });

  it('covers every defined status (no status left undecided)', () => {
    for (const status of MODERATION_STATUSES) {
      expect(typeof isJudgeable(status)).toBe('boolean');
    }
  });
});

describe('canAutoFlag — a scan only acts on never-reviewed entries', () => {
  it('flags a fresh (none) entry', () => {
    expect(canAutoFlag('none')).toBe(true);
  });

  it.each(['flagged', 'upheld', 'cleared'] as ModerationStatus[])(
    'leaves a %s entry alone (no double-flag, no overturning the operator)',
    (status) => {
      expect(canAutoFlag(status)).toBe(false);
    },
  );
});

describe('reviewFlag — operator uphold/clear', () => {
  it('upholds a flagged entry (confirmed → excluded for good)', () => {
    expect(reviewFlag('flagged', 'uphold')).toEqual({ ok: true, status: 'upheld' });
  });

  it('clears a flagged entry (false positive → back in the running)', () => {
    expect(reviewFlag('flagged', 'clear')).toEqual({ ok: true, status: 'cleared' });
  });

  it.each(['none', 'upheld', 'cleared'] as ModerationStatus[])(
    'refuses to review a %s entry — only an open flag is reviewable',
    (status) => {
      expect(reviewFlag(status, 'uphold')).toEqual({ ok: false, error: 'not-flagged' });
      expect(reviewFlag(status, 'clear')).toEqual({ ok: false, error: 'not-flagged' });
    },
  );
});
