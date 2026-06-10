import {
  assessOriginality,
  canAutoFlag,
  DEFAULT_ORIGINALITY_THRESHOLDS,
  type ModerationStatus,
  type OriginalityFlag,
  type OriginalityThresholds,
  type SimilarityComparison,
  type SimilarityMatch,
} from '../../../domain/prize-pools';
import type { SubmissionFingerprint } from '../../../infra/similarity';

/**
 * Use-case: the anti-cheat scan over a pool's submissions (CLAUDE.md → "duplicate
 * /reuse detection: similarity against the entrant's prior submissions and other
 * entries"). The kernel's assessOriginality owns the verdict; infra/similarity
 * owns the comparing; this slice orchestrates which pairs get compared and
 * persists a flag when the predicate fails.
 *
 * It is naturally a POST-HOC pass (you can only compare entrants against each
 * other once they've submitted), so it runs over the whole pool — operator-
 * triggered from the console and host-cron'd via `npm run pools:scan`. The
 * automatic hook into the building→judging transition lands with judging (M8),
 * which builds its judge set from judgeable entries only.
 *
 * Relative imports (no `@/`) so the `pools:scan` tsx CLI needs no alias config.
 */

export interface PoolSubmission {
  entryId: string;
  userId: string;
  moderationStatus: ModerationStatus;
  fingerprint: SubmissionFingerprint;
}

export interface PriorSubmission {
  entryId: string;
  fingerprint: SubmissionFingerprint;
}

export interface FlaggedEntry {
  entryId: string;
  reasons: OriginalityFlag[];
  matches: SimilarityMatch[];
  flaggedAt: Date;
}

export interface ScanSubmissionsDeps {
  /** Every SUBMITTED entry in the pool — all of them are comparison targets. */
  loadPoolSubmissions(poolId: string): Promise<PoolSubmission[]>;
  /** The user's submitted entries in OTHER pools (their prior work). */
  loadPriorSubmissions(userId: string, excludePoolId: string): Promise<PriorSubmission[]>;
  /** Similarity in [0,1] via infra/similarity. */
  compare(a: SubmissionFingerprint, b: SubmissionFingerprint): number;
  /** Persist a raised flag (moderation_status → flagged + evidence). */
  flagEntry(entry: FlaggedEntry): Promise<void>;
}

export interface ScanReport {
  /** How many entries were actually evaluated (auto-flaggable ones only). */
  scanned: number;
  flagged: { entryId: string; reasons: OriginalityFlag[] }[];
}

export async function scanSubmissions(
  deps: ScanSubmissionsDeps,
  poolId: string,
  now: Date,
  thresholds: OriginalityThresholds = DEFAULT_ORIGINALITY_THRESHOLDS,
): Promise<ScanReport> {
  const submissions = await deps.loadPoolSubmissions(poolId);
  const report: ScanReport = { scanned: 0, flagged: [] };

  for (const submission of submissions) {
    // Already flagged/upheld/cleared entries are left alone — a re-scan must not
    // double-flag an open case nor overturn the operator. They remain valid
    // comparison TARGETS below; they just aren't re-evaluated themselves.
    if (!canAutoFlag(submission.moderationStatus)) continue;
    report.scanned++;

    const comparisons: SimilarityComparison[] = [];

    // Against every OTHER entrant in this pool (a different person — copying).
    for (const other of submissions) {
      if (other.entryId === submission.entryId) continue;
      if (other.userId === submission.userId) continue;
      comparisons.push({
        kind: 'co-entry',
        ref: other.entryId,
        score: deps.compare(submission.fingerprint, other.fingerprint),
      });
    }

    // Against this entrant's own prior submissions (reuse across competitions).
    const priors = await deps.loadPriorSubmissions(submission.userId, poolId);
    for (const prior of priors) {
      comparisons.push({
        kind: 'prior-own',
        ref: prior.entryId,
        score: deps.compare(submission.fingerprint, prior.fingerprint),
      });
    }

    const verdict = assessOriginality(comparisons, thresholds);
    if (!verdict.ok) {
      await deps.flagEntry({
        entryId: submission.entryId,
        reasons: verdict.flags,
        matches: verdict.matches,
        flaggedAt: now,
      });
      report.flagged.push({ entryId: submission.entryId, reasons: verdict.flags });
    }
  }

  return report;
}
