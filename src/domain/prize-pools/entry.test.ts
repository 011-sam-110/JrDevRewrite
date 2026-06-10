import { describe, expect, it } from 'vitest';
import {
  ACTIVE_POOL_CAP,
  ACTIVE_POOL_STATUSES,
  checkJoin,
  difficultyUnlocked,
  isPoolDifficulty,
  POOL_DIFFICULTIES,
  type JoinCandidate,
  type JoinTarget,
} from './entry';

/**
 * Entry guards are pure so the join-pool slice (M5) and the pool listing UI
 * derive the SAME verdict from the same data. `checkJoin` collects EVERY
 * failed guard (not just the first) so the UI can explain all of them at once.
 */

const JOIN = new Date('2026-07-03T12:00:00Z');
const NOW = new Date('2026-07-01T12:00:00Z');

function candidate(overrides: Partial<JoinCandidate> = {}): JoinCandidate {
  return {
    jobRole: 'backend',
    globalRank: 0,
    activePoolCount: 0,
    alreadyEntered: false,
    ...overrides,
  };
}

function target(overrides: Partial<JoinTarget> = {}): JoinTarget {
  return {
    status: 'published',
    role: 'backend',
    difficulty: 'beginner',
    joinDeadline: JOIN,
    entrantCount: 10,
    entrantCap: 30,
    ...overrides,
  };
}

describe('checkJoin — happy path', () => {
  it('eligible user, open matching pool → ok', () => {
    expect(checkJoin(candidate(), target(), NOW)).toEqual({ ok: true });
  });

  it('extended pools accept joins too', () => {
    expect(checkJoin(candidate(), target({ status: 'extended' }), NOW)).toEqual({ ok: true });
  });
});

describe('checkJoin — single-guard rejections', () => {
  it('pool not open (draft)', () => {
    expect(checkJoin(candidate(), target({ status: 'draft' }), NOW)).toEqual({
      ok: false,
      reasons: ['pool-not-open'],
    });
  });

  it.each(['building', 'judging', 'closed', 'cancelled'] as const)(
    'pool not open (%s)',
    (status) => {
      const result = checkJoin(candidate(), target({ status }), NOW);
      expect(result).toEqual({ ok: false, reasons: ['pool-not-open'] });
    },
  );

  it('join window closed at the deadline instant', () => {
    expect(checkJoin(candidate(), target(), JOIN)).toEqual({
      ok: false,
      reasons: ['join-window-closed'],
    });
  });

  it('pool full', () => {
    expect(checkJoin(candidate(), target({ entrantCount: 30, entrantCap: 30 }), NOW)).toEqual({
      ok: false,
      reasons: ['pool-full'],
    });
  });

  it('last seat still joinable', () => {
    expect(checkJoin(candidate(), target({ entrantCount: 29, entrantCap: 30 }), NOW)).toEqual({
      ok: true,
    });
  });

  it('role mismatch', () => {
    expect(checkJoin(candidate({ jobRole: 'frontend' }), target({ role: 'backend' }), NOW)).toEqual(
      { ok: false, reasons: ['role-mismatch'] },
    );
  });

  it('difficulty locked behind rank', () => {
    expect(
      checkJoin(candidate({ globalRank: 0 }), target({ difficulty: 'advanced' }), NOW),
    ).toEqual({ ok: false, reasons: ['difficulty-locked'] });
  });

  it('active-pool soft cap (3) reached', () => {
    expect(checkJoin(candidate({ activePoolCount: ACTIVE_POOL_CAP }), target(), NOW)).toEqual({
      ok: false,
      reasons: ['active-pool-cap-reached'],
    });
  });

  it('one below the cap is fine', () => {
    expect(checkJoin(candidate({ activePoolCount: ACTIVE_POOL_CAP - 1 }), target(), NOW)).toEqual({
      ok: true,
    });
  });

  it('already entered this pool', () => {
    expect(checkJoin(candidate({ alreadyEntered: true }), target(), NOW)).toEqual({
      ok: false,
      reasons: ['already-entered'],
    });
  });
});

describe('checkJoin — reasons accumulate', () => {
  it('reports every failed guard, not just the first', () => {
    const result = checkJoin(
      candidate({ jobRole: 'ml', globalRank: 0, activePoolCount: 3, alreadyEntered: true }),
      target({ difficulty: 'advanced', entrantCount: 30 }),
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      reasons: [
        'pool-full',
        'role-mismatch',
        'difficulty-locked',
        'active-pool-cap-reached',
        'already-entered',
      ],
    });
  });
});

describe('difficultyUnlocked — global rank gates harder pools', () => {
  it('beginner is open to everyone, including rank 0', () => {
    expect(difficultyUnlocked(0, 'beginner')).toBe(true);
  });

  it.each(POOL_DIFFICULTIES)('$id unlocks exactly at its threshold', ({ id, unlockRank }) => {
    expect(difficultyUnlocked(unlockRank, id)).toBe(true);
    if (unlockRank > 0) expect(difficultyUnlocked(unlockRank - 1, id)).toBe(false);
  });

  it('higher rank keeps lower tiers unlocked (no upper bound)', () => {
    expect(difficultyUnlocked(9999, 'beginner')).toBe(true);
    expect(difficultyUnlocked(9999, 'advanced')).toBe(true);
  });
});

describe('difficulty + active-status vocabulary', () => {
  it('isPoolDifficulty narrows valid ids', () => {
    expect(isPoolDifficulty('beginner')).toBe(true);
    expect(isPoolDifficulty('intermediate')).toBe(true);
    expect(isPoolDifficulty('advanced')).toBe(true);
    expect(isPoolDifficulty('expert')).toBe(false);
    expect(isPoolDifficulty('')).toBe(false);
  });

  it('active statuses (for the cap) are everything between publish and close', () => {
    // The slice computes activePoolCount from THIS list — one shared definition.
    expect(ACTIVE_POOL_STATUSES).toEqual(['published', 'extended', 'building', 'judging']);
  });
});
