import { describe, expect, it } from 'vitest';
import {
  advanceStreak,
  basePoolXp,
  STREAK_BONUS_CAP,
  STREAK_XP_STEP,
  streakXp,
  WIN_XP_BASE,
  winXp,
  XP_AWARDS,
} from './xp';

/**
 * XP is the product's currency, so its rules are pinned by tests: shipping must
 * out-reward joining, the win bonus must decay with placement, and the streak
 * bonus must reward persistence without running away. The numbers are dials, but
 * these RELATIONSHIPS are the binding contract.
 */

describe('winXp', () => {
  it('pays the full base to first place', () => {
    expect(winXp(1, 5)).toBe(WIN_XP_BASE);
    expect(winXp(1, 1)).toBe(WIN_XP_BASE); // sole eligible finisher still "won"
  });

  it('decays linearly to the last eligible finisher', () => {
    // field of 5: shares 5/5,4/5,3/5,2/5,1/5 → 200,160,120,80,40
    expect(winXp(1, 5)).toBe(200);
    expect(winXp(2, 5)).toBe(160);
    expect(winXp(3, 5)).toBe(120);
    expect(winXp(4, 5)).toBe(80);
    expect(winXp(5, 5)).toBe(40);
  });

  it('is monotonic — a better placement never earns less', () => {
    for (let n = 1; n <= 12; n++) {
      for (let p = 2; p <= n; p++) {
        expect(winXp(p - 1, n)).toBeGreaterThanOrEqual(winXp(p, n));
      }
    }
  });

  it('earns nothing for a placement outside the field (didn’t place)', () => {
    expect(winXp(0, 5)).toBe(0);
    expect(winXp(6, 5)).toBe(0);
    expect(winXp(1, 0)).toBe(0);
    expect(winXp(-1, 5)).toBe(0);
  });
});

describe('streakXp', () => {
  it('pays nothing for a streak of 0 or 1 (no persistence yet)', () => {
    expect(streakXp(0)).toBe(0);
    expect(streakXp(1)).toBe(0);
  });

  it('adds a step per extra consecutive pool', () => {
    expect(streakXp(2)).toBe(STREAK_XP_STEP);
    expect(streakXp(3)).toBe(STREAK_XP_STEP * 2);
  });

  it('caps so the bonus cannot run away', () => {
    const capped = STREAK_XP_STEP * STREAK_BONUS_CAP;
    expect(streakXp(1 + STREAK_BONUS_CAP)).toBe(capped);
    expect(streakXp(50)).toBe(capped);
  });
});

describe('advanceStreak', () => {
  it('extends the streak when the pool was completed', () => {
    expect(advanceStreak(0, true)).toBe(1);
    expect(advanceStreak(4, true)).toBe(5);
  });

  it('resets to zero when the pool was not completed', () => {
    expect(advanceStreak(9, false)).toBe(0);
    expect(advanceStreak(0, false)).toBe(0);
  });
});

describe('basePoolXp', () => {
  it('always grants join XP to an entrant', () => {
    const xp = basePoolXp({ submitted: false, judged: false, placement: null, fieldSize: 0 });
    expect(xp.join).toBe(XP_AWARDS.join);
    expect(xp.submit).toBe(0);
    expect(xp.judge).toBe(0);
    expect(xp.win).toBe(0);
    expect(xp.total).toBe(XP_AWARDS.join);
  });

  it('rewards shipping more than judging more than joining', () => {
    expect(XP_AWARDS.submit).toBeGreaterThan(XP_AWARDS.judge);
    expect(XP_AWARDS.judge).toBeGreaterThan(XP_AWARDS.join);
  });

  it('sums every earned component for a full participation + a win', () => {
    const xp = basePoolXp({ submitted: true, judged: true, placement: 1, fieldSize: 4 });
    expect(xp.submit).toBe(XP_AWARDS.submit);
    expect(xp.judge).toBe(XP_AWARDS.judge);
    expect(xp.win).toBe(winXp(1, 4));
    expect(xp.total).toBe(XP_AWARDS.join + XP_AWARDS.submit + XP_AWARDS.judge + winXp(1, 4));
  });

  it('grants no win XP when the entrant did not place', () => {
    const xp = basePoolXp({ submitted: true, judged: false, placement: null, fieldSize: 6 });
    expect(xp.win).toBe(0);
    expect(xp.total).toBe(XP_AWARDS.join + XP_AWARDS.submit);
  });
});
