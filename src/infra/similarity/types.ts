/**
 * The submission-similarity seam (CLAUDE.md → Anti-cheat / pools: "similarity
 * against the entrant's prior submissions and other entries"). A slice hands two
 * fingerprints and gets back a [0,1] score; the pure originality predicate then
 * decides whether that score is too high. Same interface whether the score comes
 * from the v1 identity-based local client or a future content-shingling client,
 * so scan-submissions never changes.
 */

export interface SubmissionFingerprint {
  /** The entry this fingerprint represents (carried so callers can correlate). */
  entryId: string;
  /**
   * Normalized comparison tokens with SET semantics (order/duplication ignored).
   * v1: the GitHub identity of the submitted repo. Later: shingles over the repo
   * file tree, so copied code in a freshly-created repo still collides.
   */
  tokens: string[];
}

export interface SimilarityClient {
  /** Similarity in [0,1]; 1 = identical fingerprints, 0 = disjoint. */
  compare(a: SubmissionFingerprint, b: SubmissionFingerprint): number;
}
