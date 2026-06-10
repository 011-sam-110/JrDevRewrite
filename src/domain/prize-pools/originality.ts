/**
 * Pool anti-cheat — the duplicate/reuse predicate (M7). Pools ALLOW AI tools;
 * what anti-cheat polices is AUTHENTICITY (CLAUDE.md → Anti-cheat / pools).
 * M6 anchored that on the repo's freshness (created in-window, pushed in-window).
 * This rule is the second authenticity layer: similarity against OTHER entrants'
 * submissions (collusion / copying) and against the entrant's OWN prior work
 * (reuse across competitions — the fresh-repo-per-competition rule, at the level
 * of content rather than repo age).
 *
 * Pure on purpose: the actual comparing is an I/O concern handed to
 * infra/similarity (it may eventually clone repos and shingle file trees); this
 * predicate only takes the resulting SCORES and decides whether any cross the
 * flagging threshold. That keeps every edge unit-testable without a network or a
 * real corpus, and keeps the *policy* (what counts as too-similar) in one place.
 */

/** Who a submission was compared against. */
export type SimilarityKind = 'co-entry' | 'prior-own';

export interface SimilarityComparison {
  kind: SimilarityKind;
  /** The entry compared against — surfaced so the operator can inspect the pair. */
  ref: string;
  /** Similarity in [0,1] from infra/similarity (1 = identical, 0 = unrelated). */
  score: number;
}

export interface OriginalityThresholds {
  /** Min similarity to another entrant's submission to flag collusion/copying. */
  coEntry: number;
  /** Min similarity to the entrant's own prior submission to flag reuse. */
  priorOwn: number;
}

/**
 * Tunable until we have real engagement data on false-positive rates. 0.8 is
 * deliberately high: with the v1 identity-based fingerprint an exact repo reuse
 * scores 1.0, so the threshold catches the blatant cases without snaring
 * coincidental name overlap. Content-shingling will want its own calibration.
 */
export const DEFAULT_ORIGINALITY_THRESHOLDS: OriginalityThresholds = {
  coEntry: 0.8,
  priorOwn: 0.8,
};

export type OriginalityFlag = 'duplicate-co-entry' | 'reused-prior-work';

export interface SimilarityMatch {
  kind: SimilarityKind;
  ref: string;
  score: number;
}

export type OriginalityVerdict =
  | { ok: true; topScore: number }
  | { ok: false; flags: OriginalityFlag[]; matches: SimilarityMatch[]; topScore: number };

const THRESHOLD_KEY: Record<SimilarityKind, keyof OriginalityThresholds> = {
  'co-entry': 'coEntry',
  'prior-own': 'priorOwn',
};

const FLAG_FOR_KIND: Record<SimilarityKind, OriginalityFlag> = {
  'co-entry': 'duplicate-co-entry',
  'prior-own': 'reused-prior-work',
};

/** Fixed flag order so the verdict is identical no matter how input was ordered. */
const FLAG_ORDER: readonly OriginalityFlag[] = ['duplicate-co-entry', 'reused-prior-work'];

/**
 * Decide whether a submission looks like a duplicate or reuse. A comparison is a
 * match when its score meets the threshold for its kind (inclusive); any match
 * fails the submission and surfaces the offending pairs (sorted worst-first) for
 * operator review. `topScore` rides along even on a clear so the scan can record
 * how close a clean submission came.
 */
export function assessOriginality(
  comparisons: readonly SimilarityComparison[],
  thresholds: OriginalityThresholds = DEFAULT_ORIGINALITY_THRESHOLDS,
): OriginalityVerdict {
  for (const c of comparisons) {
    // A score outside [0,1] (or NaN) means the adapter is broken — refuse to
    // make an authenticity call on garbage rather than silently mis-flag.
    if (!(c.score >= 0 && c.score <= 1)) {
      throw new RangeError(`similarity score out of range [0,1]: ${c.score} (ref ${c.ref})`);
    }
  }

  const topScore = comparisons.reduce((max, c) => Math.max(max, c.score), 0);

  const matches: SimilarityMatch[] = comparisons
    .filter((c) => c.score >= thresholds[THRESHOLD_KEY[c.kind]])
    .map((c) => ({ kind: c.kind, ref: c.ref, score: c.score }))
    .sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));

  if (matches.length === 0) return { ok: true, topScore };

  const present = new Set(matches.map((m) => FLAG_FOR_KIND[m.kind]));
  const flags = FLAG_ORDER.filter((f) => present.has(f));

  return { ok: false, flags, matches, topScore };
}
