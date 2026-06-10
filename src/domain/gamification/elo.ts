/**
 * Battle Elo — a SEPARATE, global rating (CLAUDE.md → Gamification: "Battle
 * Elo is a separate, global rating — XP rewards activity, Elo measures
 * head-to-head skill"). This is the number that CAN go down, which pool rank
 * deliberately is not: pool rank is the additive ladder/difficulty ratchet,
 * Elo is the honest skill estimate that drives the battle ladder and queue
 * pairing (M15 prefers Elo proximity).
 *
 * Classic Elo: expected score on the 400-point logistic scale, K-factor
 * stepped down once a player has banked enough games (a provisional rating
 * should find its level fast, an established one should be stable), a hard
 * floor so a losing streak can't dig a pit nobody climbs out of, and
 * inactivity decay that drifts a dormant HIGH rating back toward the baseline
 * — a stale rating is not evidence of current skill, but inactivity is not
 * evidence of its absence either, so decay never drops anyone below the start.
 *
 * The constants are tunable dials; the SHAPE (zero-sum exchange, upsets move
 * more than expected results, floor, decay-to-baseline) is the binding part.
 */

/** Every player's first rating — also the baseline inactivity decays toward. */
export const ELO_START = 1200;
/** No rating ever drops below this — the climb back must stay plausible. */
export const ELO_FLOOR = 800;
/** K while a rating is still finding its level (first PROVISIONAL_GAMES). */
export const K_PROVISIONAL = 40;
/** K once established — even, so the equal-ratings exchange (K/2) is whole. */
export const K_ESTABLISHED = 24;
/** Rated battles before a player's K settles to K_ESTABLISHED. */
export const PROVISIONAL_GAMES = 10;
/** Days of inactivity before decay starts. */
export const INACTIVITY_GRACE_DAYS = 28;
/** Rating lost per FULL week of inactivity past the grace window. */
export const INACTIVITY_DECAY_PER_WEEK = 10;

/** What the Elo update needs to know about one player — plain data. */
export interface EloPlayer {
  rating: number;
  /** Rated battles completed BEFORE this one — selects the K-factor. */
  gamesPlayed: number;
}

/** Who won, from the resolve/forfeit outcome ('draw' covers the draw paths). */
export type BattleEloOutcome = 'a' | 'b' | 'draw';

/**
 * Probability-like expected score for `rating` against `opponentRating` on
 * the standard logistic curve: equal ratings → 0.5, +400 → 10:1 (~0.909).
 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

/** Provisional players move fast; established ratings are stable. */
export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
}

/**
 * Apply one battle result to both ratings: delta = K × (score − expected),
 * rounded to integers, floored at ELO_FLOOR.
 *
 * When both players share a K, B's delta is the exact NEGATION of A's rounded
 * delta rather than an independently-rounded computation — floating-point
 * expectations don't sum to exactly 1, and rounding each side separately can
 * leak a point. Zero-sum between equal-K players is a tested invariant; the
 * only sanctioned breaks are mixed K (a provisional player legitimately moves
 * further than an established one) and the floor catching a loser.
 */
export function applyBattleElo(
  a: EloPlayer,
  b: EloPlayer,
  outcome: BattleEloOutcome,
): { a: number; b: number } {
  const scoreA = outcome === 'a' ? 1 : outcome === 'b' ? 0 : 0.5;
  const expectedA = expectedScore(a.rating, b.rating);
  const kA = kFactor(a.gamesPlayed);
  const kB = kFactor(b.gamesPlayed);

  const deltaA = Math.round(kA * (scoreA - expectedA));
  // scoreB − expectedB = (1 − scoreA) − (1 − expectedA) = expectedA − scoreA.
  const deltaB = kA === kB ? -deltaA : Math.round(kB * (expectedA - scoreA));

  return {
    a: Math.max(ELO_FLOOR, a.rating + deltaA),
    b: Math.max(ELO_FLOOR, b.rating + deltaB),
  };
}

/**
 * The rating after `daysInactive` days without a rated battle: untouched
 * within the grace window, then INACTIVITY_DECAY_PER_WEEK per FULL week,
 * never below ELO_START. Ratings at or below the start never decay at all —
 * decay corrects stale HIGH ratings on the ladder; it is not a punishment,
 * and it must never push anyone toward the floor.
 */
export function decayedRating(rating: number, daysInactive: number): number {
  if (rating <= ELO_START) return rating;
  const weeksPast = Math.floor(Math.max(0, daysInactive - INACTIVITY_GRACE_DAYS) / 7);
  return Math.max(ELO_START, rating - weeksPast * INACTIVITY_DECAY_PER_WEEK);
}
