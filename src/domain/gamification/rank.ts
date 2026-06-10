import type { PoolDifficulty } from '../prize-pools';

/**
 * Global pool-rank movement (CLAUDE.md → Gamification: "Global pool rank drives
 * difficulty gating and the main ladder").
 *
 * Two deliberate v1 design choices:
 *   - Rank points are PURELY ADDITIVE — you never lose rank from a bad result.
 *     That makes difficulty unlocks (the entry.ts thresholds) a one-way ratchet
 *     and gives the product's "losses appear in aggregate stats only" stance for
 *     free. The zero-sum, can-go-down rating is Battle Elo's job (M11), not this.
 *   - Harder pools are worth more: the difficulty weight multiplies the
 *     placement share, so climbing into intermediate/advanced pools is the
 *     fastest way up the ladder — which is exactly the behaviour we want to pull.
 *
 * Constants are tunable dials; the thresholds they must eventually clear live in
 * domain/prize-pools/entry (beginner 0 · intermediate 100 · advanced 250).
 */

export const RANK_POINTS_BASE = 30;

/** How much each difficulty tier multiplies earned rank points. */
export const DIFFICULTY_RANK_WEIGHT: Record<PoolDifficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * Rank points earned for finishing `placement` (1-based) of `fieldSize` eligible
 * finishers in a pool of the given difficulty. Same linear placement share as
 * win XP (1st → full, last eligible → 1/fieldSize), scaled by RANK_POINTS_BASE
 * and the difficulty weight. Not placing (placement null / out of range) earns
 * nothing — rank is for finishers the field actually ranked.
 */
export function poolRankPoints(
  placement: number | null,
  fieldSize: number,
  difficulty: PoolDifficulty,
): number {
  if (placement == null || fieldSize <= 0) return 0;
  if (placement < 1 || placement > fieldSize) return 0;
  const share = (fieldSize - placement + 1) / fieldSize;
  return Math.round(RANK_POINTS_BASE * DIFFICULTY_RANK_WEIGHT[difficulty] * share);
}
