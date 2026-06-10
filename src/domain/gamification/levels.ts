/**
 * Level curve — total XP → level (CLAUDE.md → Gamification: "the level curve").
 * Pure. Level 1 is the floor (0 XP); each level costs MORE than the last, so
 * early levels come fast and later ones are a grind — the standard RPG shape
 * that keeps progression feeling rewarding without ever finishing.
 *
 * Thresholds are TRIANGULAR: reaching level L needs LEVEL_BASE · (L-1)·L/2 XP.
 * The per-level cost is therefore LEVEL_BASE·(L-1) — a flat step bigger each
 * level. With LEVEL_BASE = 100 that's L2=100, L3=300, L4=600, L5=1000, …
 */

export const LEVEL_BASE = 100;

/** Cumulative XP required to REACH `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (LEVEL_BASE * (level - 1) * level) / 2;
}

/**
 * The level a given total XP buys: the highest L whose threshold is ≤ xp. A
 * bounded loop (not the closed-form quadratic) on purpose — it sidesteps the
 * floating-point rounding that makes the inverse wrong exactly at level
 * boundaries, and L grows only as ~√xp so the cost is negligible.
 */
export function levelForXp(xp: number): number {
  if (xp < 0) throw new RangeError(`xp cannot be negative: ${xp}`);
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (next threshold − current threshold). */
  xpForNextLevel: number;
  /** Fraction toward the next level in [0,1). */
  fraction: number;
}

/** Everything a progress bar needs: current level + how far into it `xp` is. */
export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor; // = LEVEL_BASE·level > 0
  const into = xp - floor;
  return {
    level,
    xpIntoLevel: into,
    xpForNextLevel: span,
    fraction: span === 0 ? 0 : into / span,
  };
}
