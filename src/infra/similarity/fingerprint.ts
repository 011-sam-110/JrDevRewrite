import { parseGitHubRepoUrl } from '../github';
import type { SubmissionFingerprint } from './types';

/**
 * v1 fingerprint: the normalized GitHub identity (owner + repo name) of the
 * submitted repo. Two entries pointing at the same repo share both tokens →
 * similarity 1.0, which is the obvious collusion/reuse signal detectable without
 * cloning. An unparseable/absent repo yields an empty fingerprint (scores 0
 * against everything — we don't guess). Lowercased because GitHub owner/repo are
 * case-insensitive. Content-shingling over the repo tree is the later upgrade.
 */
export function repoFingerprint(entryId: string, repoUrl: string | null): SubmissionFingerprint {
  const ref = repoUrl ? parseGitHubRepoUrl(repoUrl) : null;
  if (!ref) return { entryId, tokens: [] };
  return {
    entryId,
    tokens: [`owner:${ref.owner.toLowerCase()}`, `name:${ref.repo.toLowerCase()}`],
  };
}
