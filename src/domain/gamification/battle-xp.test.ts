import { describe, expect, it } from 'vitest';
import {
  advanceBattleStreak,
  BATTLE_STREAK_BONUS_CAP,
  BATTLE_STREAK_XP_STEP,
  battleStreakXp,
  battleXp,
  BATTLE_XP_AWARDS,
} from './battle-xp';
import { WIN_XP_BASE, XP_AWARDS } from './xp';

/**
 * Battle XP grants are DISTINCT from the pool grants (CLAUDE.md → battles add
 * their own grants in M11) but share the philosophy: XP rewards ACTIVITY (Elo
 * measures skill). The pinned relationships: winning beats showing up, a
 * single battle is worth much less than shipping a pool project (a battle is
 * minutes, a pool is days), forfeiting earns nothing, and a void grants
 * nothing because nothing happened.
 */

describe('BATTLE_XP_AWARDS (the pinned relationships)', () => {
  it('winning out-rewards participating', () => {
    expect(BATTLE_XP_AWARDS.win).toBeGreaterThan(BATTLE_XP_AWARDS.participation);
    expect(BATTLE_XP_AWARDS.participation).toBeGreaterThan(0);
  });

  it('a full battle win is worth less than a pool win — pools are the bigger investment', () => {
    const fullBattle = battleXp('win', 1 + BATTLE_STREAK_BONUS_CAP).total;
    expect(fullBattle).toBeLessThan(WIN_XP_BASE);
  });

  it('a battle win is worth more than a pool join but less than shipping a pool entry', () => {
    expect(BATTLE_XP_AWARDS.win).toBeGreaterThan(XP_AWARDS.join);
    expect(BATTLE_XP_AWARDS.win).toBeLessThan(XP_AWARDS.submit + XP_AWARDS.join);
  });
});

describe('battleXp', () => {
  it('a win earns participation + the win bonus', () => {
    const xp = battleXp('win', 1);
    expect(xp.participation).toBe(BATTLE_XP_AWARDS.participation);
    expect(xp.win).toBe(BATTLE_XP_AWARDS.win);
    expect(xp.streak).toBe(0);
    expect(xp.total).toBe(BATTLE_XP_AWARDS.participation + BATTLE_XP_AWARDS.win);
  });

  it('a loss still earns participation — losing a real match is activity', () => {
    const xp = battleXp('loss', 1);
    expect(xp.participation).toBe(BATTLE_XP_AWARDS.participation);
    expect(xp.win).toBe(0);
    expect(xp.total).toBe(BATTLE_XP_AWARDS.participation);
  });

  it('a draw earns participation only', () => {
    expect(battleXp('draw', 1).total).toBe(BATTLE_XP_AWARDS.participation);
  });

  it('forfeiting earns NOTHING — quitting is not activity we reward', () => {
    expect(battleXp('forfeited', 1)).toEqual({ participation: 0, win: 0, streak: 0, total: 0 });
  });

  it('adds the streak bonus on top for completed battles', () => {
    const xp = battleXp('loss', 3);
    expect(xp.streak).toBe(battleStreakXp(3));
    expect(xp.total).toBe(BATTLE_XP_AWARDS.participation + battleStreakXp(3));
  });
});

describe('battleStreakXp', () => {
  it('pays nothing for a streak of 0 or 1', () => {
    expect(battleStreakXp(0)).toBe(0);
    expect(battleStreakXp(1)).toBe(0);
  });

  it('adds a step per extra consecutive battle', () => {
    expect(battleStreakXp(2)).toBe(BATTLE_STREAK_XP_STEP);
    expect(battleStreakXp(4)).toBe(BATTLE_STREAK_XP_STEP * 3);
  });

  it('caps so the bonus cannot run away', () => {
    const capped = BATTLE_STREAK_XP_STEP * BATTLE_STREAK_BONUS_CAP;
    expect(battleStreakXp(1 + BATTLE_STREAK_BONUS_CAP)).toBe(capped);
    expect(battleStreakXp(100)).toBe(capped);
  });
});

describe('advanceBattleStreak (explicit reset rules)', () => {
  it('completing a battle extends the streak — win, lose or draw', () => {
    expect(advanceBattleStreak(0, 'completed')).toBe(1);
    expect(advanceBattleStreak(4, 'completed')).toBe(5);
  });

  it('forfeiting resets it to zero', () => {
    expect(advanceBattleStreak(7, 'forfeited')).toBe(0);
  });

  it('a voided battle leaves the streak untouched — nothing happened', () => {
    expect(advanceBattleStreak(7, 'voided')).toBe(7);
    expect(advanceBattleStreak(0, 'voided')).toBe(0);
  });
});
