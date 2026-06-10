import {
  checkAssignmentBallot,
  checkBallot,
  type AssignmentBallotRejection,
  type BallotRejection,
  type JudgedEntry,
  type PoolStatus,
} from '@/domain/prize-pools';

/**
 * Use-case: a judge submits their ranking of the submissions they were assigned.
 * Two pure gates from the kernel, in order:
 *   1. checkAssignmentBallot — the ranking covers EXACTLY the assigned set (the
 *      "complete your judging duty" rule that drives win-eligibility);
 *   2. checkBallot — structural validity: ≥2 entries, no dupes, no self-vote,
 *      the judge is a real entrant.
 * The slice only orchestrates load → both gates → persist, and writes nothing
 * until both pass. State guards (judging-open, assigned, at-most-once) are slice
 * concerns and run first.
 */

export interface JudgingContext {
  poolStatus: PoolStatus;
  /** This judge's assigned review set (empty = not assigned / not an entrant). */
  assignedEntryIds: string[];
  /** Every judgeable entry in the pool — what checkBallot validates against. */
  judgedEntries: JudgedEntry[];
  alreadyVoted: boolean;
}

export interface RecordedBallot {
  poolId: string;
  judgeUserId: string;
  ranking: string[];
  submittedAt: Date;
}

export interface CastVoteDeps {
  loadJudgingContext(userId: string, poolId: string): Promise<JudgingContext | null>;
  recordBallot(ballot: RecordedBallot): Promise<void>;
}

export interface CastVoteInput {
  userId: string;
  poolId: string;
  /** Entry ids, best first. */
  ranking: string[];
}

export type CastVoteResult =
  | { ok: true }
  | { ok: false; error: 'not-found' | 'not-judging' | 'not-assigned' | 'already-voted' }
  | { ok: false; error: 'coverage'; reasons: AssignmentBallotRejection[] }
  | { ok: false; error: 'ballot'; reasons: BallotRejection[] };

export async function castVote(
  deps: CastVoteDeps,
  input: CastVoteInput,
  now: Date,
): Promise<CastVoteResult> {
  const ctx = await deps.loadJudgingContext(input.userId, input.poolId);
  if (!ctx) return { ok: false, error: 'not-found' };

  // State guards (slice-owned): the round must be open, the judge must have a
  // duty, and they can only discharge it once.
  if (ctx.poolStatus !== 'judging') return { ok: false, error: 'not-judging' };
  if (ctx.assignedEntryIds.length === 0) return { ok: false, error: 'not-assigned' };
  if (ctx.alreadyVoted) return { ok: false, error: 'already-voted' };

  // Gate 1: the ranking must be exactly the assigned set.
  const coverage = checkAssignmentBallot(input.ranking, ctx.assignedEntryIds);
  if (!coverage.ok) return { ok: false, error: 'coverage', reasons: coverage.reasons };

  // Gate 2: structural validity (defence in depth — a correct assignment can't
  // produce a self-vote, but a tampered client request could).
  const ballot = { judgeId: input.userId, ranking: input.ranking };
  const structural = checkBallot(ballot, ctx.judgedEntries);
  if (!structural.ok) return { ok: false, error: 'ballot', reasons: structural.reasons };

  await deps.recordBallot({
    poolId: input.poolId,
    judgeUserId: input.userId,
    ranking: input.ranking,
    submittedAt: now,
  });
  return { ok: true };
}
