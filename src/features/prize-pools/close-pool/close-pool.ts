import {
  aggregateVotes,
  isJudgeable,
  reconcileBallots,
  type Ballot,
  type JudgedEntry,
  type ModerationStatus,
  type PoolDifficulty,
} from '../../../domain/prize-pools';
import { basePoolXp, poolRankPoints } from '../../../domain/gamification';

/**
 * Use-case: finalize a pool that has reached `closed` — turn the cast ballots
 * into standings (the M3 vote-aggregation kernel), then award every entrant
 * their XP and rank points and persist the results table the reveal page
 * renders. Invoked by the lifecycle cron's `finalize-results` effect, never a
 * request handler: closing is a TIME-DRIVEN transition (CLAUDE.md), so the
 * decision to close belongs to the scheduled job, and this slice only executes
 * the consequences.
 *
 * Division of labour, on purpose:
 *   - The slice owns the POOL-LOCAL derivation — who placed where, base XP, rank
 *     points. All pure, all unit-tested right here against mocked deps.
 *   - The streak bonus and new level depend on each entrant's PRIOR profile
 *     state, which must be read under a row lock to stay correct when one user
 *     is in two pools closing in the same tick. That read-compute-write lives in
 *     `deps.finalizeResults` (close-deps), using pure kernel fns under the lock.
 *
 * Relative imports (no `@/`): this file is on the `pools:tick` CLI's tsx graph
 * via close-deps — same constraint as tick-pools / assign-judges.
 */

/** One entrant's membership + submission state, as the close needs it. */
export interface CloseEntrant {
  userId: string;
  entryId: string;
  /** entry.submittedAt != null — they linked a repo + demo video. */
  hasSubmission: boolean;
  moderationStatus: ModerationStatus;
}

export interface CloseContext {
  difficulty: PoolDifficulty;
  /** Every entrant of the pool — including those who joined and never shipped. */
  entrants: CloseEntrant[];
  /** Judgeable entries (submitted + anti-cheat-cleared) — the aggregation field. */
  judgedEntries: JudgedEntry[];
  /** Every cast ballot (one per judge who discharged their duty). */
  ballots: Ballot[];
}

/** The fully-derived, pool-local award for one entrant, handed to the dep. */
export interface EntrantAward {
  userId: string;
  entryId: string;
  /** Shipped a judgeable entry (drives submit XP + the streak). */
  submitted: boolean;
  /** Completed their judging duty (drives judge XP + win eligibility). */
  judged: boolean;
  /** 1-based placement among eligible finishers, null if they didn't place. */
  placement: number | null;
  /** Mean normalized Borda score (0 if their entry wasn't judged). */
  score: number;
  /** Pool-local XP (join/submit/judge/win) — the streak bonus is added under lock. */
  baseXp: number;
  rankPoints: number;
}

export interface ClosePoolDeps {
  loadCloseContext(poolId: string): Promise<CloseContext | null>;
  /** Persist results + award XP/rank/streak/level — atomically & idempotently. */
  finalizeResults(poolId: string, awards: EntrantAward[]): Promise<{ finalized: number }>;
}

export type ClosePoolResult =
  | { ok: false; error: 'not-found' }
  | { ok: true; entrants: number; finalized: number; awards: EntrantAward[] };

export async function closePool(deps: ClosePoolDeps, poolId: string): Promise<ClosePoolResult> {
  const ctx = await deps.loadCloseContext(poolId);
  if (!ctx) return { ok: false, error: 'not-found' };

  // "Cast a ballot" === "completed your judging duty" (cast-vote enforced full
  // coverage at write time). Taken from the RAW ballots, BEFORE reconciliation,
  // so a judge whose ballot a late flag trims still keeps their win eligibility.
  const completedJudgeIds = ctx.ballots.map((b) => b.judgeId);
  const completed = new Set(completedJudgeIds);

  // Reconcile against late anti-cheat flags, then aggregate. judgedEntries is
  // already the currently-judgeable set, so a flagged entry is gone from both
  // the field and every ballot — aggregateVotes can't choke on a stale id.
  const ballots = reconcileBallots(ctx.ballots, ctx.judgedEntries);
  const { standings, finalPlacements } = aggregateVotes({
    entries: ctx.judgedEntries,
    ballots,
    completedJudgeIds,
  });

  const fieldSize = finalPlacements.length;
  const placementByEntry = new Map(finalPlacements.map((entryId, i) => [entryId, i + 1]));
  const scoreByEntry = new Map(standings.map((s) => [s.entryId, s.score]));

  const awards: EntrantAward[] = ctx.entrants.map((e) => {
    // A flagged/upheld entry is not a valid submission for reward — they keep
    // their join XP, but earn no submit XP and can't place (kernel rule).
    const submitted = e.hasSubmission && isJudgeable(e.moderationStatus);
    const judged = completed.has(e.userId);
    const placement = placementByEntry.get(e.entryId) ?? null;
    const score = scoreByEntry.get(e.entryId) ?? 0;
    const xp = basePoolXp({ submitted, judged, placement, fieldSize });
    return {
      userId: e.userId,
      entryId: e.entryId,
      submitted,
      judged,
      placement,
      score,
      baseXp: xp.total,
      rankPoints: poolRankPoints(placement, fieldSize, ctx.difficulty),
    };
  });

  const { finalized } = await deps.finalizeResults(poolId, awards);
  return { ok: true, entrants: ctx.entrants.length, finalized, awards };
}
