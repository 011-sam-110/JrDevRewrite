/**
 * The moderation (flag) lifecycle for a pool submission (M7). A submission
 * carries one of four states; this module owns the two pure rules over them:
 * what's judgeable, and what an automatic scan may touch — plus the operator's
 * uphold/clear transition. Kept pure so the exclusion rule is testable without a
 * DB and reused identically by the scan, the review slice, and (M8) judging.
 *
 *   none     — never flagged. Judgeable.
 *   flagged  — auto-flagged by a scan, awaiting operator review. EXCLUDED.
 *   upheld   — operator confirmed the flag (cheating). EXCLUDED for good.
 *   cleared  — operator dismissed the flag (false positive). Judgeable again.
 */

export const MODERATION_STATUSES = ['none', 'flagged', 'upheld', 'cleared'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

/** Statuses that keep a submission OUT of judging/results (pending or after review). */
export const JUDGING_EXCLUDED_STATUSES: readonly ModerationStatus[] = ['flagged', 'upheld'];

/**
 * A submission counts toward judging/results only when it isn't flagged or
 * upheld. This is THE exclusion rule "flagged submissions are excluded from
 * judging/results pending review" — M8 builds the judging set from judgeable
 * entries only.
 */
export function isJudgeable(status: ModerationStatus): boolean {
  return !JUDGING_EXCLUDED_STATUSES.includes(status);
}

/**
 * An automatic scan may only act on a never-reviewed (`none`) entry. It must not
 * re-flag an already-open flag, and — crucially — must never overturn an
 * operator's clear/uphold by re-flagging on the next run.
 */
export function canAutoFlag(status: ModerationStatus): boolean {
  return status === 'none';
}

export type ReviewDecision = 'uphold' | 'clear';

export type ReviewFlagOutcome =
  | { ok: true; status: 'upheld' | 'cleared' }
  | { ok: false; error: 'not-flagged' };

/**
 * The operator's review move: only an open `flagged` entry is reviewable, and it
 * resolves to `upheld` (confirmed) or `cleared` (dismissed). Anything else is a
 * no-op error — the same shape as the lifecycle's approvePool guard.
 */
export function reviewFlag(status: ModerationStatus, decision: ReviewDecision): ReviewFlagOutcome {
  if (status !== 'flagged') return { ok: false, error: 'not-flagged' };
  return { ok: true, status: decision === 'uphold' ? 'upheld' : 'cleared' };
}
