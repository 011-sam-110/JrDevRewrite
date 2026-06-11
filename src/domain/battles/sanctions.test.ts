import { describe, expect, it } from 'vitest';
import { ELO_FLOOR, K_PROVISIONAL } from '../gamification/elo';
import {
  applyCheatSanction,
  BAN_LADDER_DAYS,
  banDaysForStrikes,
  CHEAT_ELO_PENALTY,
  isBattleBanned,
  reviewBattleFlag,
} from './sanctions';
import { BATTLE_STATUSES } from './lifecycle';

/**
 * Confirmed-cheating sanctions (CLAUDE.md → battle anti-cheat: "confirmed
 * cheating → forfeit + Elo penalty + escalating bans"). The review move
 * mirrors M7's reviewFlag (only an open flag is reviewable, once); the ban
 * ladder and Elo penalty are pure rules the review slice executes.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-06-11T12:00:00Z');

describe('reviewBattleFlag', () => {
  it('upholds an open flag', () => {
    expect(reviewBattleFlag({ status: 'flagged', reviewOutcome: null }, 'uphold')).toEqual({
      ok: true,
      outcome: 'upheld',
    });
  });

  it('clears an open flag (false positive)', () => {
    expect(reviewBattleFlag({ status: 'flagged', reviewOutcome: null }, 'clear')).toEqual({
      ok: true,
      outcome: 'cleared',
    });
  });

  it('only a flagged battle is reviewable — every other status refuses', () => {
    for (const status of BATTLE_STATUSES) {
      if (status === 'flagged') continue;
      expect(reviewBattleFlag({ status, reviewOutcome: null }, 'uphold')).toEqual({
        ok: false,
        error: 'not-flagged',
      });
    }
  });

  it('a reviewed flag is settled for good — no second review can overturn it', () => {
    expect(reviewBattleFlag({ status: 'flagged', reviewOutcome: 'cleared' }, 'uphold')).toEqual({
      ok: false,
      error: 'already-reviewed',
    });
    expect(reviewBattleFlag({ status: 'flagged', reviewOutcome: 'upheld' }, 'clear')).toEqual({
      ok: false,
      error: 'already-reviewed',
    });
  });
});

describe('ban ladder', () => {
  it('escalates: first strike a week, second a month, third a year', () => {
    expect(BAN_LADDER_DAYS).toEqual([7, 30, 365]);
    expect(banDaysForStrikes(1)).toBe(7);
    expect(banDaysForStrikes(2)).toBe(30);
    expect(banDaysForStrikes(3)).toBe(365);
  });

  it('past the ladder the top rung repeats (every further offence costs a year)', () => {
    expect(banDaysForStrikes(4)).toBe(365);
    expect(banDaysForStrikes(10)).toBe(365);
  });

  it('throws below one strike — a ban without a strike is a logic error', () => {
    expect(() => banDaysForStrikes(0)).toThrow(RangeError);
    expect(() => banDaysForStrikes(-1)).toThrow(RangeError);
  });
});

describe('applyCheatSanction', () => {
  it('docks the Elo penalty, adds a strike, and bans per the ladder', () => {
    const s = applyCheatSanction({ elo: 1400, strikes: 0 }, NOW);
    expect(s).toEqual({
      elo: 1400 - CHEAT_ELO_PENALTY,
      strikes: 1,
      bannedUntil: new Date(NOW.getTime() + 7 * DAY),
    });
  });

  it('a second offence bans for the second rung', () => {
    const s = applyCheatSanction({ elo: 1200, strikes: 1 }, NOW);
    expect(s.strikes).toBe(2);
    expect(s.bannedUntil).toEqual(new Date(NOW.getTime() + 30 * DAY));
  });

  it('the penalty respects the Elo floor — a sanction cannot dig below it', () => {
    const s = applyCheatSanction({ elo: ELO_FLOOR + 10, strikes: 0 }, NOW);
    expect(s.elo).toBe(ELO_FLOOR);
  });

  it('the penalty strictly exceeds the biggest possible single-match gain', () => {
    // Forward-looking justice: v1 doesn't retroactively re-derive ratings
    // (cascades through later matches), so the flat penalty must at minimum
    // wipe out anything the cheat could have won. Max gain = K_PROVISIONAL.
    expect(CHEAT_ELO_PENALTY).toBeGreaterThan(K_PROVISIONAL);
  });
});

describe('isBattleBanned', () => {
  it('null means never banned', () => {
    expect(isBattleBanned(null, NOW)).toBe(false);
  });

  it('banned strictly before the expiry instant; the ban lifts AT it', () => {
    const until = new Date(NOW.getTime() + 1000);
    expect(isBattleBanned(until, NOW)).toBe(true);
    expect(isBattleBanned(until, until)).toBe(false); // deadlines inclusive, house-wide
    expect(isBattleBanned(until, new Date(until.getTime() + 1))).toBe(false);
  });
});
