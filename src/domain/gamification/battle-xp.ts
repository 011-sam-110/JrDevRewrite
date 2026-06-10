/**
 * Gamification — XP grants for live battles (CLAUDE.md → Gamification: battle
 * participation and battle wins are XP-granting actions; battle streaks have
 * explicit reset rules). DISTINCT from the pool grants in `xp.ts` but the same
 * philosophy: XP rewards ACTIVITY — Elo (`elo.ts`) measures skill.
 *
 * The pinned relationships (tested against the pool constants, not just in
 * isolation): winning out-rewards showing up; a single battle — minutes of
 * work — is worth much less than shipping a pool project — days of it; a loss
 * in a real match still earns participation; a FORFEIT earns nothing (quitting
 * is not activity we reward); a VOID grants nothing and touches nothing,
 * because nothing happened. The constants are tunable dials.
 *
 * Like pool XP, battle XP is awarded ONCE, by the resolve-battle slice (M15),
 * when the battle settles — one award site, one idempotency key.
 */

/** Flat XP for the discrete battle actions. */
export const BATTLE_XP_AWARDS = {
  /** Completing a real match — win, lose or draw. */
  participation: 5,
  /** The win bonus, on top of participation. */
  win: 25,
} as const;

/** XP per extra battle in an unbroken completion streak. */
export const BATTLE_STREAK_XP_STEP = 5;
/** Streak XP stops growing past this many extra battles — bounded curve. */
export const BATTLE_STREAK_BONUS_CAP = 5;

/**
 * Streak XP for a completion streak of `streak` battles (the streak AFTER
 * this battle — see `advanceBattleStreak`; the same convention as the pool
 * `streakXp`). A streak of 1 earns nothing; each additional consecutive
 * completed battle adds a step, capped.
 */
export function battleStreakXp(streak: number): number {
  if (streak <= 1) return 0;
  return BATTLE_STREAK_XP_STEP * Math.min(streak - 1, BATTLE_STREAK_BONUS_CAP);
}

/** How one battle ended FOR ONE PLAYER (a void never reaches the XP award). */
export type BattleXpResult = 'win' | 'loss' | 'draw' | 'forfeited';

export interface BattleXpBreakdown {
  participation: number;
  win: number;
  streak: number;
  total: number;
}

/**
 * The XP one player earns from one settled battle, given their result and
 * their streak AFTER it. Pure: the resolve-battle slice reads the prior
 * streak under its row lock, advances it via `advanceBattleStreak`, and
 * passes the new value in — the same split that keeps pool XP race-safe.
 */
export function battleXp(result: BattleXpResult, streakAfter: number): BattleXpBreakdown {
  if (result === 'forfeited') {
    return { participation: 0, win: 0, streak: 0, total: 0 };
  }
  const participation = BATTLE_XP_AWARDS.participation;
  const win = result === 'win' ? BATTLE_XP_AWARDS.win : 0;
  const streak = battleStreakXp(streakAfter);
  return { participation, win, streak, total: participation + win + streak };
}

/** What this battle did to the player's streak clock. */
export type BattleStreakOutcome = 'completed' | 'forfeited' | 'voided';

/**
 * The explicit streak reset rules: completing a battle (win, lose or draw)
 * extends the streak; forfeiting resets it to zero; a VOIDED battle leaves it
 * untouched — nothing happened, so nothing advances and nothing breaks
 * (mirrors how a cancelled pool never touches the pool streak).
 */
export function advanceBattleStreak(previousStreak: number, outcome: BattleStreakOutcome): number {
  if (outcome === 'voided') return previousStreak;
  return outcome === 'completed' ? previousStreak + 1 : 0;
}
