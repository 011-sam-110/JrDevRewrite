import { describe, expect, it } from 'vitest';
import { BADGES, badgeStatsFrom, earnedBadgeIds, earnedBadges, type BadgeStats } from './badges';

/**
 * Badges are unlock rules as DATA + PURE predicates (CLAUDE.md → Gamification).
 * The tests pin the *shape* of the rules (a fresh account has nothing; shipping,
 * podiums, wins and streaks each unlock something; the unlock set only grows as
 * stats grow — monotonic), not the exact thresholds, which are tunable dials.
 */

const ZERO: BadgeStats = {
  poolsEntered: 0,
  poolsSubmitted: 0,
  wins: 0,
  podiums: 0,
  level: 1,
  poolStreak: 0,
  globalRank: 0,
};

describe('BADGES catalogue', () => {
  it('has unique ids', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every badge declares a name, description and tier', () => {
    for (const b of BADGES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(['bronze', 'silver', 'gold']).toContain(b.tier);
    }
  });
});

describe('earnedBadges', () => {
  it('a brand-new account has earned nothing', () => {
    expect(earnedBadges(ZERO)).toEqual([]);
  });

  it('entering one pool earns the entry badge', () => {
    const got = earnedBadgeIds({ ...ZERO, poolsEntered: 1 });
    expect(got).toContain('first-pool');
  });

  it('shipping a judgeable entry earns the shipper badge', () => {
    const got = earnedBadgeIds({ ...ZERO, poolsEntered: 1, poolsSubmitted: 1 });
    expect(got).toContain('shipper');
  });

  it('a top-3 finish earns the podium badge', () => {
    const got = earnedBadgeIds({ ...ZERO, poolsEntered: 1, poolsSubmitted: 1, podiums: 1 });
    expect(got).toContain('podium');
  });

  it('a win (1st place) earns the champion badge', () => {
    const got = earnedBadgeIds({
      ...ZERO,
      poolsEntered: 1,
      poolsSubmitted: 1,
      podiums: 1,
      wins: 1,
    });
    expect(got).toContain('champion');
  });

  it('streak milestones unlock at 3 and 5', () => {
    expect(earnedBadgeIds({ ...ZERO, poolStreak: 2 })).not.toContain('on-fire');
    expect(earnedBadgeIds({ ...ZERO, poolStreak: 3 })).toContain('on-fire');
    expect(earnedBadgeIds({ ...ZERO, poolStreak: 5 })).toContain('unstoppable');
  });

  it('a global rank unlocks the ranked badge', () => {
    expect(earnedBadgeIds({ ...ZERO, globalRank: 1 })).toContain('ranked');
    expect(earnedBadgeIds({ ...ZERO, globalRank: 0 })).not.toContain('ranked');
  });

  it('is monotonic: better stats never REMOVE a badge', () => {
    const weak: BadgeStats = {
      poolsEntered: 1,
      poolsSubmitted: 1,
      wins: 0,
      podiums: 0,
      level: 2,
      poolStreak: 1,
      globalRank: 10,
    };
    const strong: BadgeStats = {
      poolsEntered: 9,
      poolsSubmitted: 8,
      wins: 4,
      podiums: 6,
      level: 12,
      poolStreak: 7,
      globalRank: 400,
    };
    const weakSet = new Set(earnedBadgeIds(weak));
    const strongSet = new Set(earnedBadgeIds(strong));
    for (const id of weakSet) expect(strongSet.has(id)).toBe(true);
    expect(strongSet.size).toBeGreaterThan(weakSet.size);
  });

  it('returns the full badge definitions (name/description/tier), not just ids', () => {
    const [first] = earnedBadges({ ...ZERO, poolsEntered: 1 });
    expect(first).toMatchObject({ id: expect.any(String), name: expect.any(String) });
  });
});

describe('badgeStatsFrom', () => {
  it('derives stats from a list of closed-pool results + the profile', () => {
    const stats = badgeStatsFrom({
      profile: { level: 4, poolStreak: 3, globalRank: 120 },
      results: [
        { placement: 1, submitted: true },
        { placement: 2, submitted: true },
        { placement: null, submitted: true }, // shipped but didn't place
        { placement: null, submitted: false }, // joined, never shipped
      ],
    });
    expect(stats).toEqual({
      poolsEntered: 4,
      poolsSubmitted: 3,
      wins: 1,
      podiums: 2,
      level: 4,
      poolStreak: 3,
      globalRank: 120,
    });
  });

  it('a placement outside the top 3 is not a podium', () => {
    const stats = badgeStatsFrom({
      profile: { level: 1, poolStreak: 0, globalRank: 0 },
      results: [{ placement: 4, submitted: true }],
    });
    expect(stats.podiums).toBe(0);
    expect(stats.wins).toBe(0);
  });
});
