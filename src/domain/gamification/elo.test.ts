import { describe, expect, it } from 'vitest';
import {
  applyBattleElo,
  decayedRating,
  ELO_FLOOR,
  ELO_START,
  expectedScore,
  INACTIVITY_DECAY_PER_WEEK,
  INACTIVITY_GRACE_DAYS,
  K_ESTABLISHED,
  K_PROVISIONAL,
  kFactor,
  PROVISIONAL_GAMES,
  type EloPlayer,
} from './elo';

/**
 * Battle Elo is a SEPARATE, global rating (binding decision: "XP rewards
 * activity, Elo measures head-to-head skill") — the can-go-down number that
 * pool rank deliberately is not. The relationships pinned here are the
 * contract: zero-sum between equal-K players, upsets move more points than
 * expected results, the floor catches free-fall, and inactivity drifts a
 * rating toward the baseline but never below it.
 */

const player = (rating: number, gamesPlayed = PROVISIONAL_GAMES): EloPlayer => ({
  rating,
  gamesPlayed,
});

describe('expectedScore', () => {
  it('equal ratings → 50/50', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('a 400-point favourite expects ~10:1 (the Elo scale constant)', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 5);
  });

  it('expectations are complementary: e(a,b) + e(b,a) = 1 (swept)', () => {
    for (const a of [800, 1000, 1200, 1457, 1900, 2400]) {
      for (const b of [800, 1100, 1200, 1633, 2200]) {
        expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 10);
      }
    }
  });

  it('is strictly monotonic in own rating', () => {
    let previous = 0;
    for (let r = 800; r <= 2400; r += 100) {
      const e = expectedScore(r, 1500);
      expect(e).toBeGreaterThan(previous);
      previous = e;
    }
  });
});

describe('kFactor (provisional players move faster)', () => {
  it('uses the provisional K until enough games are banked', () => {
    expect(kFactor(0)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_GAMES - 1)).toBe(K_PROVISIONAL);
  });

  it('settles to the established K at the boundary', () => {
    expect(kFactor(PROVISIONAL_GAMES)).toBe(K_ESTABLISHED);
    expect(kFactor(500)).toBe(K_ESTABLISHED);
  });

  it('provisional really is faster', () => {
    expect(K_PROVISIONAL).toBeGreaterThan(K_ESTABLISHED);
  });
});

describe('applyBattleElo', () => {
  it('an even win between established equals moves K/2 each way', () => {
    const { a, b } = applyBattleElo(player(1200), player(1200), 'a');
    expect(a).toBe(1200 + K_ESTABLISHED / 2);
    expect(b).toBe(1200 - K_ESTABLISHED / 2);
  });

  it('is exactly zero-sum between equal-K players (swept, above the floor)', () => {
    for (const ra of [1000, 1200, 1457, 1801]) {
      for (const rb of [1003, 1200, 1666]) {
        for (const result of ['a', 'b', 'draw'] as const) {
          const next = applyBattleElo(player(ra), player(rb), result);
          expect(next.a - ra + (next.b - rb), `${ra} vs ${rb} (${result})`).toBe(0);
        }
      }
    }
  });

  it('the winner never loses points; the loser never gains (swept)', () => {
    for (const ra of [900, 1200, 1800, 2300]) {
      for (const rb of [900, 1350, 2300]) {
        const next = applyBattleElo(player(ra), player(rb), 'a');
        expect(next.a).toBeGreaterThanOrEqual(ra);
        expect(next.b).toBeLessThanOrEqual(rb);
      }
    }
  });

  it('an upset moves more points than an expected win', () => {
    const upset = applyBattleElo(player(1200), player(1600), 'a');
    const expected = applyBattleElo(player(1600), player(1200), 'a');
    expect(upset.a - 1200).toBeGreaterThan(expected.a - 1600);
  });

  it('a draw between equals changes nothing', () => {
    expect(applyBattleElo(player(1200), player(1200), 'draw')).toEqual({ a: 1200, b: 1200 });
  });

  it('a draw rewards the underdog at the favourite’s expense', () => {
    const { a, b } = applyBattleElo(player(1100), player(1500), 'draw');
    expect(a).toBeGreaterThan(1100);
    expect(b).toBeLessThan(1500);
  });

  it('a provisional player moves further than an established one in the same match', () => {
    const fresh = applyBattleElo(player(1200, 0), player(1200), 'a');
    const settled = applyBattleElo(player(1200), player(1200), 'a');
    expect(fresh.a - 1200).toBeGreaterThan(settled.a - 1200);
  });

  it('the floor catches a losing rating (and breaks zero-sum, deliberately)', () => {
    const { a, b } = applyBattleElo(player(ELO_FLOOR + 3), player(ELO_FLOOR + 3), 'b');
    expect(a).toBe(ELO_FLOOR);
    expect(b).toBe(ELO_FLOOR + 3 + K_ESTABLISHED / 2);
  });

  it('never returns a rating below the floor (swept)', () => {
    for (const r of [ELO_FLOOR, ELO_FLOOR + 1, ELO_FLOOR + 10, 1200]) {
      const next = applyBattleElo(player(r, 0), player(2400, 0), 'b');
      expect(next.a).toBeGreaterThanOrEqual(ELO_FLOOR);
    }
  });

  it('returns integer ratings', () => {
    const { a, b } = applyBattleElo(player(1217), player(1392), 'a');
    expect(Number.isInteger(a)).toBe(true);
    expect(Number.isInteger(b)).toBe(true);
  });
});

describe('decayedRating (inactivity drifts toward the baseline)', () => {
  const HIGH = ELO_START + 100;

  it('no decay within the grace window', () => {
    expect(decayedRating(HIGH, 0)).toBe(HIGH);
    expect(decayedRating(HIGH, INACTIVITY_GRACE_DAYS)).toBe(HIGH);
  });

  it('decays per FULL week past the grace window', () => {
    expect(decayedRating(HIGH, INACTIVITY_GRACE_DAYS + 6)).toBe(HIGH); // partial week
    expect(decayedRating(HIGH, INACTIVITY_GRACE_DAYS + 7)).toBe(HIGH - INACTIVITY_DECAY_PER_WEEK);
    expect(decayedRating(HIGH, INACTIVITY_GRACE_DAYS + 21)).toBe(
      HIGH - 3 * INACTIVITY_DECAY_PER_WEEK,
    );
  });

  it('never decays below the starting rating — inactivity is not a skill signal', () => {
    expect(decayedRating(HIGH, 10_000)).toBe(ELO_START);
  });

  it('a rating at or below the start never decays at all', () => {
    expect(decayedRating(ELO_START, 10_000)).toBe(ELO_START);
    expect(decayedRating(ELO_FLOOR + 50, 10_000)).toBe(ELO_FLOOR + 50);
  });

  it('is monotonically non-increasing in days inactive (swept)', () => {
    let previous = Infinity;
    for (let days = 0; days <= 365; days += 13) {
      const r = decayedRating(1700, days);
      expect(r).toBeLessThanOrEqual(previous);
      previous = r;
    }
  });

  it('the constants make sense together: start above floor, grace positive', () => {
    expect(ELO_START).toBeGreaterThan(ELO_FLOOR);
    expect(INACTIVITY_GRACE_DAYS).toBeGreaterThan(0);
    expect(INACTIVITY_DECAY_PER_WEEK).toBeGreaterThan(0);
  });
});
