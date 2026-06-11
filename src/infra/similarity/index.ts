import { LocalSimilarityClient } from './local-similarity';
import type { SimilarityClient } from './types';

export { LocalSimilarityClient } from './local-similarity';
export { codeFingerprint, repoFingerprint } from './fingerprint';
export type { SimilarityClient, SubmissionFingerprint } from './types';

/**
 * Adapter seam: a real content-similarity client (clone the repo, shingle its
 * file tree, MinHash) slots in here once we ingest repo contents (Needs from
 * Sampo). Until then every environment uses the identity-based local client —
 * mirrors how infra/video and infra/github gate their real clients.
 */
export function getSimilarityClient(): SimilarityClient {
  return new LocalSimilarityClient();
}
