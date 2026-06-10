/**
 * Speed + penalty scoring (CLAUDE.md → Battle lifecycle, scoring). The binding
 * shape: the FIRST submission passing all hidden tests wins outright — penalty
 * NEVER overturns a decisive real-time win. Each rejected submission adds a
 * fixed penalty to the player's penalty-adjusted time, which decides the
 * TIMEOUT path (most tests passed → lowest penalty-adjusted time → draw) and
 * is recorded for stats either way. Pure: `(submissionHistory, timeLimit,
 * penaltyPerWrong) → outcome`. Times are SECONDS FROM THE GO — the wall-clock
 * anchor (goAt) lives in the lifecycle snapshot; keeping the scoring math in
 * plain offsets keeps it clock-free and trivially testable.
 *
 * The verdict data here comes from Judge0 (authoritative); a WS "I finished"
 * event never reaches this function.
 */

import type { PlayerSide } from './lifecycle';

/** Seconds added to penalty-adjusted time per rejected submission. */
export const DEFAULT_PENALTY_PER_WRONG_SECONDS = 60;
/** Minimum gap between one player's submissions — discourages judge-spam. */
export const SUBMISSION_COOLDOWN_SECONDS = 30;

/** One judged submission, as reported by the judge adapter. */
export interface BattleSubmission {
  player: PlayerSide;
  /** Seconds from the synchronized "go". */
  atSeconds: number;
  /** Judge0 verdict: every hidden test passed. */
  passedAll: boolean;
  /** How many hidden tests passed — the timeout-path score. */
  testsPassed: number;
}

/** One player's scored line — recorded for stats whatever the outcome. */
export interface PlayerScore {
  /** Best hidden-test count across in-window submissions (0 if none). */
  testsPassed: number;
  /** When they first passed ALL tests, or null if they never did. */
  solvedAtSeconds: number | null;
  /** Rejected submissions BEFORE their counting submission (the penalty base). */
  wrongSubmissions: number;
  /**
   * Time of their counting submission + penalty × wrongSubmissions — the
   * timeout tiebreaker; null when they have nothing scoreable.
   */
  penaltyAdjustedSeconds: number | null;
}

export type BattleOutcome =
  | {
      kind: 'decisive';
      winner: PlayerSide;
      /** The wall-clock-decisive instant, as seconds from the go. */
      decidedAtSeconds: number;
      players: Record<PlayerSide, PlayerScore>;
    }
  | {
      kind: 'timeout';
      winner: PlayerSide;
      basis: 'tests-passed' | 'penalty-time';
      players: Record<PlayerSide, PlayerScore>;
    }
  | { kind: 'draw'; players: Record<PlayerSide, PlayerScore> };

const EMPTY_SCORE: PlayerScore = {
  testsPassed: 0,
  solvedAtSeconds: null,
  wrongSubmissions: 0,
  penaltyAdjustedSeconds: null,
};

/**
 * Score one player's in-window submissions. The COUNTING submission is the
 * earliest one achieving their best result (a full solve beats any partial,
 * whatever the test counts say); penalty counts the submissions before it —
 * judge-spam AFTER your best changes nothing, and there is no reward for
 * volume, only for the best result and how cleanly you reached it.
 */
function scorePlayer(submissions: BattleSubmission[], penaltyPerWrong: number): PlayerScore {
  const [first, ...rest] = submissions;
  if (first === undefined) return EMPTY_SCORE;

  const better = (s: BattleSubmission, t: BattleSubmission): boolean => {
    if (s.passedAll !== t.passedAll) return s.passedAll;
    if (s.testsPassed !== t.testsPassed) return s.testsPassed > t.testsPassed;
    return s.atSeconds < t.atSeconds; // earliest occurrence of the best result
  };
  let counting = first;
  for (const s of rest) if (better(s, counting)) counting = s;

  const wrongBefore = submissions.filter(
    (s) => s.atSeconds < counting.atSeconds && !s.passedAll,
  ).length;

  return {
    testsPassed: counting.testsPassed,
    solvedAtSeconds: counting.passedAll ? counting.atSeconds : null,
    wrongSubmissions: wrongBefore,
    penaltyAdjustedSeconds: counting.atSeconds + penaltyPerWrong * wrongBefore,
  };
}

/**
 * Decide the outcome of a battle from its full submission history.
 *
 * - Decisive: the earliest in-window full solve wins at that instant. If both
 *   players solve at the LITERAL same second there is no "first" — only then
 *   does penalty-adjusted time speak, and if even that ties, it's a draw.
 * - Timeout: most tests passed wins; ties break on lowest penalty-adjusted
 *   time; still equal → draw. Zero tests passed by both is ALWAYS a draw —
 *   spamming rejected submissions must never beat silence.
 *
 * In-window means atSeconds < timeLimit (the deadline instant is closed, the
 * same convention as every pool deadline); late submissions are ignored
 * entirely — no score, no penalty. Throws on corrupt input rather than
 * guessing — this is the sole decider of a competitive result.
 */
export function scoreBattle(
  history: BattleSubmission[],
  timeLimitSeconds: number,
  penaltyPerWrongSeconds: number = DEFAULT_PENALTY_PER_WRONG_SECONDS,
): BattleOutcome {
  if (timeLimitSeconds <= 0) throw new RangeError('timeLimitSeconds must be positive');
  if (penaltyPerWrongSeconds < 0) throw new RangeError('penaltyPerWrongSeconds must be >= 0');
  for (const s of history) {
    if (s.atSeconds < 0) throw new RangeError('submission atSeconds must be >= 0');
    if (s.testsPassed < 0) throw new RangeError('submission testsPassed must be >= 0');
  }

  const inWindow = history.filter((s) => s.atSeconds < timeLimitSeconds);
  const players: Record<PlayerSide, PlayerScore> = {
    a: scorePlayer(
      inWindow.filter((s) => s.player === 'a'),
      penaltyPerWrongSeconds,
    ),
    b: scorePlayer(
      inWindow.filter((s) => s.player === 'b'),
      penaltyPerWrongSeconds,
    ),
  };

  const solvedA = players.a.solvedAtSeconds;
  const solvedB = players.b.solvedAtSeconds;

  // Decisive path — somebody fully solved it inside the window.
  if (solvedA !== null || solvedB !== null) {
    if (solvedB === null || (solvedA !== null && solvedA < solvedB)) {
      return { kind: 'decisive', winner: 'a', decidedAtSeconds: solvedA!, players };
    }
    if (solvedA === null || solvedB < solvedA) {
      return { kind: 'decisive', winner: 'b', decidedAtSeconds: solvedB, players };
    }
    // The pathological exact-same-instant double solve: no "first" exists, so
    // penalty-adjusted time gets its only say over a decisive result.
    const padA = players.a.penaltyAdjustedSeconds!;
    const padB = players.b.penaltyAdjustedSeconds!;
    if (padA !== padB) {
      const winner: PlayerSide = padA < padB ? 'a' : 'b';
      return { kind: 'decisive', winner, decidedAtSeconds: solvedA!, players };
    }
    return { kind: 'draw', players };
  }

  // Timeout path — nobody fully correct; most tests passed wins.
  if (players.a.testsPassed === 0 && players.b.testsPassed === 0) {
    return { kind: 'draw', players };
  }
  if (players.a.testsPassed !== players.b.testsPassed) {
    const winner: PlayerSide = players.a.testsPassed > players.b.testsPassed ? 'a' : 'b';
    return { kind: 'timeout', winner, basis: 'tests-passed', players };
  }
  const padA = players.a.penaltyAdjustedSeconds!;
  const padB = players.b.penaltyAdjustedSeconds!;
  if (padA !== padB) {
    const winner: PlayerSide = padA < padB ? 'a' : 'b';
    return { kind: 'timeout', winner, basis: 'penalty-time', players };
  }
  return { kind: 'draw', players };
}

/**
 * Seconds a player must still wait before submitting again (0 = clear to
 * submit). The per-submission cooldown is the judge-spam brake: the M15
 * submit-solution slice checks this BEFORE spending a Judge0 run.
 */
export function submissionCooldownRemaining(
  history: BattleSubmission[],
  player: PlayerSide,
  atSeconds: number,
  cooldownSeconds: number = SUBMISSION_COOLDOWN_SECONDS,
): number {
  const own = history.filter((s) => s.player === player);
  if (own.length === 0) return 0;
  const latest = Math.max(...own.map((s) => s.atSeconds));
  return Math.max(0, cooldownSeconds - (atSeconds - latest));
}
