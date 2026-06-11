/**
 * Use-case: the operator reviews a drafted battle problem — approve it into the
 * playable bank, reject it (archival, mirrors pool rejection), or retire an
 * already-approved problem (rotation for leaked/stale problems). The draft/
 * approved status transitions are the kernel's `approveProblem`/`retireProblem`;
 * this slice only orchestrates and adds ONE infra-level precondition the kernel
 * can't know about: a draft must have been machine-VERIFIED (its reference
 * solution passed its own hidden tests) before an operator can approve it.
 *
 * Rejection is archival like pools: the row keeps status `draft`, a `rejectedAt`
 * stamp drops it out of the queue, and its slug stays claimed so a re-draft of
 * the same slug can't resurrect it.
 */

import { approveProblem, retireProblem, type ProblemStatus } from '@/domain/battles';

export interface BankProblem {
  id: string;
  status: ProblemStatus;
  /** Set when the reference solution passed its own hidden tests (verify gate). */
  verifiedAt: Date | null;
  /** Set when an operator archived the draft (rejection). */
  rejectedAt: Date | null;
}

export interface ReviewProblemDeps {
  getProblem(problemId: string): Promise<BankProblem | null>;
  setApproved(problemId: string, approvedAt: Date): Promise<void>;
  setRetired(problemId: string, retiredAt: Date): Promise<void>;
  markRejected(problemId: string, rejectedAt: Date): Promise<void>;
}

export type ProblemReviewResult =
  | { ok: true }
  | {
      ok: false;
      error: 'not-found' | 'not-a-draft' | 'not-approved' | 'already-rejected' | 'unverified';
    };

async function load(
  deps: ReviewProblemDeps,
  problemId: string,
): Promise<{ problem: BankProblem } | { failure: ProblemReviewResult & { ok: false } }> {
  const problem = await deps.getProblem(problemId);
  if (!problem) return { failure: { ok: false, error: 'not-found' } };
  return { problem };
}

/** Approve a verified draft into the bank. */
export async function approveProblemDraft(
  deps: ReviewProblemDeps,
  problemId: string,
  now: Date,
): Promise<ProblemReviewResult> {
  const loaded = await load(deps, problemId);
  if ('failure' in loaded) return loaded.failure;
  if (loaded.problem.rejectedAt !== null) return { ok: false, error: 'already-rejected' };

  const transition = approveProblem(loaded.problem.status);
  if (!transition.ok) return { ok: false, error: transition.error };
  // Machine verification is a hard precondition for entering the bank — a draft
  // whose reference solution never passed its tests must never be playable.
  if (loaded.problem.verifiedAt === null) return { ok: false, error: 'unverified' };

  await deps.setApproved(problemId, now);
  return { ok: true };
}

/** Archive a draft (rejection — never enters the bank). */
export async function rejectProblemDraft(
  deps: ReviewProblemDeps,
  problemId: string,
  now: Date,
): Promise<ProblemReviewResult> {
  const loaded = await load(deps, problemId);
  if ('failure' in loaded) return loaded.failure;
  if (loaded.problem.rejectedAt !== null) return { ok: false, error: 'already-rejected' };
  // Same precondition as approval: only a live draft is reviewable.
  if (!approveProblem(loaded.problem.status).ok) return { ok: false, error: 'not-a-draft' };

  await deps.markRejected(problemId, now);
  return { ok: true };
}

/** Rotate an approved problem out of the bank (leaked/stale). */
export async function retireBankProblem(
  deps: ReviewProblemDeps,
  problemId: string,
  now: Date,
): Promise<ProblemReviewResult> {
  const loaded = await load(deps, problemId);
  if ('failure' in loaded) return loaded.failure;

  const transition = retireProblem(loaded.problem.status);
  if (!transition.ok) return { ok: false, error: transition.error };

  await deps.setRetired(problemId, now);
  return { ok: true };
}
