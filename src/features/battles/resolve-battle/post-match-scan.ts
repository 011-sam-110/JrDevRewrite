/**
 * post-match-scan — the automatic battle anti-cheat pass (CLAUDE.md →
 * Anti-cheat / battles, post-match). Lives INSIDE the resolve-battle slice
 * because it is settlement's epilogue: every scored conclusion (decisive,
 * timeout, forfeit) triggers exactly one scan over the evidence settlement
 * just persisted — full submission history, the server-stamped telemetry log,
 * and the problem's bank reference solution.
 *
 * Division of labour (the M7 pattern, applied to battles):
 *   - infra/similarity COMPARES code (shingled fingerprints, Jaccard);
 *   - the kernel (domain/battles/anti-cheat) JUDGES the scores + telemetry;
 *   - any signal routes through the kernel's `flagBattle` (the only legal
 *     resolved/forfeited → flagged move) into the operator queue.
 *
 * Elo/XP STAY applied while flagged (binding) — the scan accuses, the
 * operator decides (review-battle-flag slice). A scan is idempotent by
 * construction: an already-flagged battle is not scannable, and an honest
 * battle re-scanned writes nothing, so the operator "re-scan recent battles"
 * action and the automatic trigger can coexist safely.
 *
 * Relative imports — this runs in BOTH processes (Next actions and the
 * realtime service's tsx entry), like everything else in this slice.
 */

import {
  assessBattleIntegrity,
  flagBattle,
  type BattleCheatSignal,
  type BattleSimilarityComparison,
  type BattleStatus,
  type MatchTelemetryRecord,
  type PlayerSide,
} from '../../../domain/battles';
import { codeFingerprint, type SubmissionFingerprint } from '../../../infra/similarity';

export interface ScanSubmissionRow {
  id: string;
  side: PlayerSide;
  code: string;
  atSeconds: number;
  passedAll: boolean;
  testsPassed: number;
}

export interface BattleScanContext {
  status: BattleStatus;
  winnerSide: PlayerSide | null;
  timeLimitSeconds: number;
  /** The room's server-stamped log, persisted at settlement. */
  telemetry: MatchTelemetryRecord[];
  /** Known bank solutions for THIS problem (the leaked-solution corpus). */
  bankSolutions: { ref: string; code: string }[];
  /** The battle's full judged history (retained in full since M15). */
  submissions: ScanSubmissionRow[];
}

export interface PostMatchScanDeps {
  loadScanContext(battleId: string): Promise<BattleScanContext | null>;
  /** Similarity in [0,1] via infra/similarity. */
  compare(a: SubmissionFingerprint, b: SubmissionFingerprint): number;
  /** Persist the flag: status → flagged (conditional) + evidence. */
  flagBattle(battleId: string, signals: BattleCheatSignal[], flaggedAt: Date): Promise<void>;
}

export type ScanBattleReport =
  | { scanned: false; reason: 'not-found' | 'not-scannable' | 'no-winner' | 'no-submission' }
  | { scanned: true; flagged: boolean; signals: BattleCheatSignal[] };

/**
 * The winner's COUNTING submission — the same rule the scoring kernel uses to
 * decide the result (earliest full solve, else the earliest occurrence of
 * their best partial). What won the battle is what gets policed.
 */
function countingSubmission(own: ScanSubmissionRow[]): ScanSubmissionRow | null {
  const [first, ...rest] = own;
  if (first === undefined) return null;
  const better = (s: ScanSubmissionRow, t: ScanSubmissionRow): boolean => {
    if (s.passedAll !== t.passedAll) return s.passedAll;
    if (s.testsPassed !== t.testsPassed) return s.testsPassed > t.testsPassed;
    return s.atSeconds < t.atSeconds;
  };
  let counting = first;
  for (const s of rest) if (better(s, counting)) counting = s;
  return counting;
}

export async function scanBattle(
  deps: PostMatchScanDeps,
  battleId: string,
  now: Date,
): Promise<ScanBattleReport> {
  const ctx = await deps.loadScanContext(battleId);
  if (!ctx) return { scanned: false, reason: 'not-found' };

  // Only a freshly-settled battle is scannable. `flagged` deliberately isn't:
  // a re-run must never double-flag an open case nor disturb a review — the
  // pools scan's canAutoFlag posture, expressed through the status here.
  if (ctx.status !== 'resolved' && ctx.status !== 'forfeited') {
    return { scanned: false, reason: 'not-scannable' };
  }
  if (ctx.winnerSide === null) return { scanned: false, reason: 'no-winner' };

  const winning = countingSubmission(ctx.submissions.filter((s) => s.side === ctx.winnerSide));
  if (!winning) return { scanned: false, reason: 'no-submission' };

  // Infra compares; the kernel will judge the scores.
  const winnerPrint = codeFingerprint(winning.id, winning.code);
  const comparisons: BattleSimilarityComparison[] = [
    ...ctx.bankSolutions.map(
      (bank): BattleSimilarityComparison => ({
        kind: 'bank-solution',
        ref: bank.ref,
        score: deps.compare(winnerPrint, codeFingerprint(bank.ref, bank.code)),
      }),
    ),
    ...ctx.submissions
      .filter((s) => s.side !== ctx.winnerSide)
      .map(
        (opp): BattleSimilarityComparison => ({
          kind: 'opponent-code',
          ref: opp.id,
          score: deps.compare(winnerPrint, codeFingerprint(opp.id, opp.code)),
        }),
      ),
  ];

  const verdict = assessBattleIntegrity({
    comparisons,
    winnerSide: ctx.winnerSide,
    winningCodeLength: winning.code.length,
    winningAtSeconds: winning.atSeconds,
    winningPassedAll: winning.passedAll,
    telemetry: ctx.telemetry,
  });
  if (verdict.ok) return { scanned: true, flagged: false, signals: [] };

  // The kernel owns the transition: resolved/forfeited → flagged is the only
  // legal move, and Elo/XP stay applied (flagBattle's contract).
  const flagged = flagBattle({
    status: ctx.status,
    readyDeadline: null,
    readyA: true,
    readyB: true,
    goAt: null,
    timeLimitSeconds: ctx.timeLimitSeconds,
  });
  if (!flagged.ok) return { scanned: false, reason: 'not-scannable' };

  await deps.flagBattle(battleId, verdict.signals, now);
  return { scanned: true, flagged: true, signals: verdict.signals };
}
