/**
 * Gamification — XP grants for prize-pool participation (CLAUDE.md → Gamification:
 * "XP-granting actions (join, submit, vote/judge, win, streak) and the level
 * curve. Pure functions."). Battles add their own grants in M11; this module is
 * pools-only.
 *
 * XP is awarded ONCE, atomically, when a pool CLOSES (the close-pool slice),
 * computed from each entrant's participation — not dribbled out at each action.
 * One award site means one idempotency key and no partial state to reconcile.
 *
 * Every amount here is a tunable product number, not a derived fact. The SHAPE
 * of the rules is the binding part (shipping is worth far more than joining; the
 * win bonus scales with placement; streaks reward persistence) — the constants
 * are dials we expect to tune from engagement data.
 */

/** Flat XP for the discrete participation actions. */
export const XP_AWARDS = {
  /** Entering a pool at all — a small reward for showing up. */
  join: 10,
  /** Shipping a verified, judgeable entry — the act we most want to reward. */
  submit: 50,
  /** Completing your full judging duty (what makes you eligible to win). */
  judge: 30,
} as const;

/** The top finisher's win bonus; lower placements earn a decaying share of it. */
export const WIN_XP_BASE = 200;

/**
 * Win XP for finishing `placement` (1-based) in a field of `fieldSize` eligible
 * finishers. 1st earns the full WIN_XP_BASE; the last eligible finisher earns
 * WIN_XP_BASE/fieldSize; everyone between scales linearly. A placement outside
 * [1, fieldSize] (didn't place / ineligible) earns nothing.
 */
export function winXp(placement: number, fieldSize: number): number {
  if (fieldSize <= 0) return 0;
  if (placement < 1 || placement > fieldSize) return 0;
  const share = (fieldSize - placement + 1) / fieldSize; // 1st → 1, last → 1/fieldSize
  return Math.round(WIN_XP_BASE * share);
}

/** XP per extra pool in an unbroken participation streak. */
export const STREAK_XP_STEP = 15;
/** Streak XP stops growing past this many pools — keeps the curve bounded. */
export const STREAK_BONUS_CAP = 5;

/**
 * Streak XP for a participation streak of `streak` pools (the streak AFTER this
 * pool — see `advanceStreak`). A streak of 1 (your first, or your first after a
 * break) earns nothing; each additional consecutive completed pool adds
 * STREAK_XP_STEP, capped at STREAK_BONUS_CAP steps.
 */
export function streakXp(streak: number): number {
  if (streak <= 1) return 0;
  return STREAK_XP_STEP * Math.min(streak - 1, STREAK_BONUS_CAP);
}

/**
 * The participation streak AFTER a pool closes: completing the pool (shipping a
 * judgeable entry) extends the streak by one; failing to complete resets it to
 * 0. Only pools that actually CLOSE call this, so ghosting a *cancelled* pool
 * never breaks your streak — only a pool you joined and then didn't finish does.
 */
export function advanceStreak(previousStreak: number, completed: boolean): number {
  return completed ? previousStreak + 1 : 0;
}

/** One entrant's pool-local participation — everything `basePoolXp` needs. */
export interface PoolParticipation {
  /** Shipped a verified, judgeable entry (not flagged by anti-cheat). */
  submitted: boolean;
  /** Completed their judging duty (cast their assigned ballot). */
  judged: boolean;
  /** 1-based placement among eligible finishers, or null if they didn't place. */
  placement: number | null;
  /** Number of eligible finishers — scales the win bonus. */
  fieldSize: number;
}

export interface XpBreakdown {
  join: number;
  submit: number;
  judge: number;
  win: number;
  total: number;
}

/**
 * The pool-LOCAL XP an entrant earns — everything that depends only on what
 * happened in this pool (join/submit/judge/win). The streak bonus is deliberately
 * NOT included: it depends on the entrant's prior streak (profile state), which
 * the close slice reads under a row lock to stay race-safe, then adds via
 * `streakXp`. Keeping the two apart is what lets this function stay pure.
 */
export function basePoolXp(p: PoolParticipation): XpBreakdown {
  const join = XP_AWARDS.join;
  const submit = p.submitted ? XP_AWARDS.submit : 0;
  const judge = p.judged ? XP_AWARDS.judge : 0;
  const win = p.placement != null ? winXp(p.placement, p.fieldSize) : 0;
  return { join, submit, judge, win, total: join + submit + judge + win };
}
