/**
 * Post-match battle anti-cheat (CLAUDE.md → Anti-cheat / battles: "plagiarism
 * diff of the winning submission against known bank solutions and the
 * opponent's; AI-generated-code likelihood heuristics" + the in-match
 * telemetry those heuristics read). PURE predicates over persisted evidence —
 * the M7 split applied to battles: infra/similarity COMPARES code and hands
 * back scores, the kernel JUDGES them; the room/arena CAPTURE telemetry, the
 * kernel interprets it.
 *
 * Three signal families (the roadmap's list, verbatim):
 *   - plagiarism      — the winning code matches a bank reference solution
 *                       (a leaked problem) or the opponent's submissions
 *                       (collusion / screen-sharing);
 *   - AI-likelihood   — battles BAN AI assistance and the editor blocks paste,
 *                       so sustained authoring speed beyond human typing, or
 *                       repeated paste attempts, are the honest tells we can
 *                       measure without pretending to "detect AI style";
 *   - cadence anomaly — timing that doesn't look like solving: a full solve
 *                       faster than the statement can be read, or an author
 *                       who wasn't even looking at the arena for most of the
 *                       time before their winning submission.
 *
 * A signal never convicts: it routes the settled battle through `flagBattle`
 * (lifecycle.ts) into the operator review queue. Elo/XP stay applied until a
 * human upholds the flag (sanctions.ts owns what happens then).
 *
 * Thresholds are tunable product dials; the SHAPE of each rule is binding and
 * tested. Like every kernel module: plain data in, plain data out.
 */

import type { PlayerSide } from './lifecycle';

/* ------------------------------------------------ in-match telemetry types */

/**
 * The in-match anti-cheat signal vocabulary. Defined HERE (not in the wire
 * contract) because the kernel's post-match predicates read these records —
 * types flow OUTWARD from the kernel: `lib/match-events` re-exports them for
 * the wire, the DB schema types its jsonb column with them.
 */
export const TELEMETRY_KINDS = ['paste-blocked', 'focus-lost', 'focus-regained'] as const;
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];

export function isTelemetryKind(value: unknown): value is TelemetryKind {
  return typeof value === 'string' && (TELEMETRY_KINDS as readonly string[]).includes(value);
}

/**
 * One captured in-match signal as the realtime room records it: the client
 * names only the KIND; `atSeconds` is stamped by the SERVER clock relative to
 * the go (never trust client timestamps — the GitHub repo-signal posture).
 */
export interface MatchTelemetryRecord {
  side: PlayerSide;
  kind: TelemetryKind;
  atSeconds: number;
}

/* --------------------------------------------------------- signal shapes */

/** What the winning code was compared against. */
export type BattleComparisonKind = 'bank-solution' | 'opponent-code';

/** One similarity score from infra/similarity — the comparing is infra's job. */
export interface BattleSimilarityComparison {
  kind: BattleComparisonKind;
  /** The matched artifact: a problem id (bank) or a submission id (opponent). */
  ref: string;
  /** Similarity in [0,1]; 1 = identical fingerprints. */
  score: number;
}

export type BattleCheatReason =
  | 'bank-plagiarism'
  | 'opponent-plagiarism'
  | 'ai-likelihood'
  | 'cadence-anomaly';

/** One piece of evidence for the operator — serializable (lands in jsonb). */
export interface BattleCheatSignal {
  reason: BattleCheatReason;
  /** Operator-readable evidence line. */
  detail: string;
  /** The matched artifact behind a plagiarism signal. */
  ref?: string;
  /** The measured number behind the signal (score, cps, count, seconds). */
  value?: number;
}

export interface BattleIntegrityThresholds {
  /** Inclusive similarity bound — at or above is plagiarism (the M7 convention). */
  plagiarism: number;
  /** Exclusive sustained chars-per-second bound — above is not typing. */
  maxCharsPerSecond: number;
  /** Paste attempts at or above this count are deliberate, not a slip. */
  pasteAttempts: number;
  /** A FULL solve faster than this can't include reading the statement. */
  minSolveSeconds: number;
  /** Fraction of pre-solve time spent unfocused that flags an absent author. */
  absentFraction: number;
  /** Absence means nothing until at least this much match time has elapsed. */
  minSecondsForAbsence: number;
}

export const DEFAULT_BATTLE_INTEGRITY_THRESHOLDS: BattleIntegrityThresholds = {
  plagiarism: 0.8,
  // Sustained pro typing is ~5 cps on prose; code (symbols, navigation,
  // thinking) is slower. 8 cps sustained over a whole solve is generous.
  maxCharsPerSecond: 8,
  pasteAttempts: 3,
  minSolveSeconds: 45,
  absentFraction: 0.5,
  minSecondsForAbsence: 60,
};

/* ------------------------------------------------------------- plagiarism */

const PLAGIARISM_REASON: Record<BattleComparisonKind, BattleCheatReason> = {
  'bank-solution': 'bank-plagiarism',
  'opponent-code': 'opponent-plagiarism',
};

/**
 * Judge the similarity scores infra computed: every comparison at or above
 * the threshold becomes a signal, worst first, so the operator sees ALL the
 * evidence ranked by strength. Throws on a score outside [0,1] — this feeds a
 * competitive sanction, so corrupt input must never silently pass.
 */
export function assessPlagiarism(
  comparisons: BattleSimilarityComparison[],
  thresholds: BattleIntegrityThresholds = DEFAULT_BATTLE_INTEGRITY_THRESHOLDS,
): BattleCheatSignal[] {
  for (const c of comparisons) {
    if (c.score < 0 || c.score > 1 || Number.isNaN(c.score)) {
      throw new RangeError(`similarity score out of range: ${c.score}`);
    }
  }
  return comparisons
    .filter((c) => c.score >= thresholds.plagiarism)
    .sort((x, y) => y.score - x.score)
    .map((c) => ({
      reason: PLAGIARISM_REASON[c.kind],
      detail:
        c.kind === 'bank-solution'
          ? `winning code matches a bank reference solution (${Math.round(c.score * 100)}% similar)`
          : `winning code matches an opponent submission (${Math.round(c.score * 100)}% similar)`,
      ref: c.ref,
      value: c.score,
    }));
}

/* ---------------------------------------------------------- AI-likelihood */

export interface AuthorshipEvidence {
  /** Length of the winning submission's source. */
  codeLength: number;
  /** Seconds from the go to the winning submission. */
  atSeconds: number;
  /** Paste attempts the editor blocked for this player (telemetry count). */
  pasteBlockedAttempts: number;
}

/**
 * AI-likelihood, honestly measurable: battles ban AI assistance and the arena
 * blocks paste, so the only legitimate way code enters the editor is typing.
 * Code arriving faster than a human can type, or repeated attempts to paste
 * past the block, are the strongest generated/injected-code tells we have —
 * deliberately NOT a "sounds like ChatGPT" style guess.
 */
export function assessAuthorship(
  evidence: AuthorshipEvidence,
  thresholds: BattleIntegrityThresholds = DEFAULT_BATTLE_INTEGRITY_THRESHOLDS,
): BattleCheatSignal[] {
  const signals: BattleCheatSignal[] = [];

  // max(atSeconds, 1): a submission stamped in the first second still divides.
  const cps = evidence.codeLength / Math.max(evidence.atSeconds, 1);
  if (cps > thresholds.maxCharsPerSecond) {
    signals.push({
      reason: 'ai-likelihood',
      detail: `winning code arrived at ${cps.toFixed(1)} chars/s sustained — beyond human typing with paste blocked`,
      value: cps,
    });
  }

  if (evidence.pasteBlockedAttempts >= thresholds.pasteAttempts) {
    signals.push({
      reason: 'ai-likelihood',
      detail: `${evidence.pasteBlockedAttempts} blocked paste attempts during the match`,
      value: evidence.pasteBlockedAttempts,
    });
  }

  return signals;
}

/* ------------------------------------------------------- cadence anomalies */

/**
 * Total seconds `side` spent unfocused in [0, untilSeconds): folds
 * focus-lost → focus-regained pairs from the server-stamped log; an unclosed
 * loss runs to the cap (they never came back before the moment of interest).
 * Tolerant of partial logs — a regained without a lost is ignored, never
 * guessed at.
 */
export function focusLossSeconds(
  telemetry: MatchTelemetryRecord[],
  side: PlayerSide,
  untilSeconds: number,
): number {
  let total = 0;
  let lostAt: number | null = null;
  for (const record of telemetry) {
    if (record.side !== side) continue;
    if (record.kind === 'focus-lost' && lostAt === null) {
      lostAt = record.atSeconds;
    } else if (record.kind === 'focus-regained' && lostAt !== null) {
      total += Math.max(0, Math.min(record.atSeconds, untilSeconds) - lostAt);
      lostAt = null;
    }
  }
  if (lostAt !== null && lostAt < untilSeconds) total += untilSeconds - lostAt;
  return total;
}

export interface CadenceEvidence {
  side: PlayerSide;
  /** Seconds from the go to the winning (counting) submission. */
  solvedAtSeconds: number;
  /** Whether that submission passed ALL hidden tests (a decisive full solve). */
  passedAll: boolean;
  telemetry: MatchTelemetryRecord[];
}

/**
 * Submission-timing anomalies:
 *   - instant solve — a FULL solve faster than the statement can be read and
 *     a solution typed. Only full solves: firing a quick partial probe (a
 *     stub that passes nothing) is a normal opening move.
 *   - absent author — unfocused for most of the elapsed time before the
 *     winning submission: consistent with solving in another window and
 *     transcribing. Needs a minimum elapsed time before absence means
 *     anything (everyone alt-tabs once early).
 */
export function assessCadence(
  evidence: CadenceEvidence,
  thresholds: BattleIntegrityThresholds = DEFAULT_BATTLE_INTEGRITY_THRESHOLDS,
): BattleCheatSignal[] {
  const signals: BattleCheatSignal[] = [];

  if (evidence.passedAll && evidence.solvedAtSeconds < thresholds.minSolveSeconds) {
    signals.push({
      reason: 'cadence-anomaly',
      detail: `full solve ${evidence.solvedAtSeconds}s after the reveal — faster than the statement can be read`,
      value: evidence.solvedAtSeconds,
    });
  }

  if (evidence.solvedAtSeconds >= thresholds.minSecondsForAbsence) {
    const absent = focusLossSeconds(evidence.telemetry, evidence.side, evidence.solvedAtSeconds);
    if (absent / evidence.solvedAtSeconds >= thresholds.absentFraction) {
      signals.push({
        reason: 'cadence-anomaly',
        detail: `winner was unfocused for ${absent}s of the ${evidence.solvedAtSeconds}s before their winning submission`,
        value: absent,
      });
    }
  }

  return signals;
}

/* --------------------------------------------------------------- composer */

export interface BattleIntegrityInput {
  /** Similarity scores for the winning code, computed by infra/similarity. */
  comparisons: BattleSimilarityComparison[];
  winnerSide: PlayerSide;
  winningCodeLength: number;
  /** Seconds from the go to the winning (counting) submission. */
  winningAtSeconds: number;
  winningPassedAll: boolean;
  /** The full server-stamped telemetry log (both sides; we filter). */
  telemetry: MatchTelemetryRecord[];
}

export type BattleIntegrityVerdict = { ok: true } | { ok: false; signals: BattleCheatSignal[] };

/**
 * The composed post-match verdict over the WINNING submission (the roadmap's
 * scope: the winner is who gained — losers' code is still retained in full
 * and stays comparable as evidence). Runs every family and collects ALL
 * signals (the checkJoin house style: report everything, not just the first
 * failure), so the operator reviews the complete picture in one pass.
 */
export function assessBattleIntegrity(
  input: BattleIntegrityInput,
  thresholds: BattleIntegrityThresholds = DEFAULT_BATTLE_INTEGRITY_THRESHOLDS,
): BattleIntegrityVerdict {
  const pasteBlockedAttempts = input.telemetry.filter(
    (t) => t.side === input.winnerSide && t.kind === 'paste-blocked',
  ).length;

  const signals = [
    ...assessPlagiarism(input.comparisons, thresholds),
    ...assessAuthorship(
      {
        codeLength: input.winningCodeLength,
        atSeconds: input.winningAtSeconds,
        pasteBlockedAttempts,
      },
      thresholds,
    ),
    ...assessCadence(
      {
        side: input.winnerSide,
        solvedAtSeconds: input.winningAtSeconds,
        passedAll: input.winningPassedAll,
        telemetry: input.telemetry,
      },
      thresholds,
    ),
  ];

  return signals.length === 0 ? { ok: true } : { ok: false, signals };
}
