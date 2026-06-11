/**
 * Sanctions for confirmed battle cheating (CLAUDE.md → Anti-cheat / battles:
 * "confirmed cheating → forfeit + Elo penalty + escalating bans"). The
 * automatic scan only FLAGS (anti-cheat.ts → lifecycle's flagBattle); a human
 * operator decides. This module owns the pure rules behind that decision:
 *
 *   - the review move itself — mirrors M7's `reviewFlag`: only an open flag
 *     is reviewable, and a decision is final (a re-run scan or a second
 *     operator click can never overturn it);
 *   - the strike ladder — escalating bans keyed to how many times this
 *     player has been caught (strikes live on the profile);
 *   - the Elo penalty — flat, floored at the rating floor. Deliberately
 *     FORWARD-looking: v1 never retroactively re-derives ratings (the
 *     cheater's tainted gain already propagated into later matches'
 *     K-exchanges; unwinding that cascades through every subsequent result).
 *     Instead the flat penalty is pinned by test to exceed the biggest
 *     possible single-match gain, so cheating is always net-negative.
 *
 * The review slice executes these rules; the forfeit flip (the wronged
 * opponent becomes the recorded winner, reason 'cheating-confirmed') is the
 * slice writing what the kernel decided.
 */

import { ELO_FLOOR } from '../gamification/elo';
import type { BattleStatus } from './lifecycle';

export type BattleReviewDecision = 'uphold' | 'clear';
export type BattleReviewOutcome = 'upheld' | 'cleared';

export type ReviewBattleFlagResult =
  | { ok: true; outcome: BattleReviewOutcome }
  | { ok: false; error: 'not-flagged' | 'already-reviewed' };

/**
 * The operator's review move over a flagged battle. The battle's lifecycle
 * status stays `flagged` (terminal in the transition table — the flag is
 * history, not a phase); the review OUTCOME is what resolves, exactly once.
 */
export function reviewBattleFlag(
  battle: { status: BattleStatus; reviewOutcome: BattleReviewOutcome | null },
  decision: BattleReviewDecision,
): ReviewBattleFlagResult {
  if (battle.status !== 'flagged') return { ok: false, error: 'not-flagged' };
  if (battle.reviewOutcome !== null) return { ok: false, error: 'already-reviewed' };
  return { ok: true, outcome: decision === 'uphold' ? 'upheld' : 'cleared' };
}

/**
 * Flat rating penalty for a confirmed cheat. Must stay strictly greater than
 * K_PROVISIONAL (the biggest single-match gain) — pinned by test — so a
 * caught cheat is always worse off than never having played.
 */
export const CHEAT_ELO_PENALTY = 100;

/**
 * The escalating ban ladder, in days, by strike count (1-based). Past the
 * last rung, the top rung repeats — a year per further offence is effectively
 * permanent on a degree timescale without needing a separate "forever" state.
 */
export const BAN_LADDER_DAYS: readonly number[] = [7, 30, 365];

export function banDaysForStrikes(strikes: number): number {
  if (strikes < 1) throw new RangeError('a ban requires at least one strike');
  return BAN_LADDER_DAYS[Math.min(strikes, BAN_LADDER_DAYS.length) - 1]!;
}

export interface CheatSanction {
  /** Rating after the penalty, floored at ELO_FLOOR. */
  elo: number;
  /** Strike count after this confirmation. */
  strikes: number;
  /** Battle ban expiry per the ladder. */
  bannedUntil: Date;
}

const DAY_MS = 86_400_000;

/** The full sanction for one confirmed cheat, from the profile's prior state. */
export function applyCheatSanction(
  profile: { elo: number; strikes: number },
  now: Date,
): CheatSanction {
  const strikes = profile.strikes + 1;
  return {
    elo: Math.max(ELO_FLOOR, profile.elo - CHEAT_ELO_PENALTY),
    strikes,
    bannedUntil: new Date(now.getTime() + banDaysForStrikes(strikes) * DAY_MS),
  };
}

/**
 * The entry guard the battle slices check: banned strictly until the expiry
 * instant; AT it the ban has lifted (deadlines inclusive, the house rule).
 */
export function isBattleBanned(bannedUntil: Date | null, now: Date): boolean {
  return bannedUntil !== null && now.getTime() < bannedUntil.getTime();
}
