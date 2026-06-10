import type { SimilarityClient, SubmissionFingerprint } from './types';

/**
 * Dev/v1 similarity: Jaccard overlap of the two token sets — |A∩B| / |A∪B|.
 * With the identity-based fingerprint (owner + repo name) this means two entries
 * pointing at the SAME repo score 1.0 (the blatant collusion/reuse case we can
 * catch without cloning anything), same-owner-different-repo scores partial, and
 * unrelated repos score 0. A content-shingling client (clone + MinHash over the
 * file tree) slots in behind the same interface later (Needs from Sampo).
 */
export class LocalSimilarityClient implements SimilarityClient {
  compare(a: SubmissionFingerprint, b: SubmissionFingerprint): number {
    const left = new Set(a.tokens);
    const right = new Set(b.tokens);
    // Two fingerprintless submissions aren't "identical" — they're unknowable.
    if (left.size === 0 || right.size === 0) return 0;

    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection++;
    const union = left.size + right.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
