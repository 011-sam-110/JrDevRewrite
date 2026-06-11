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

/** Tokens per shingle window — 3 keeps short solutions comparable while making
 * incidental same-language overlap (every JS file says `const`) score low. */
const SHINGLE_SIZE = 3;

/**
 * Battle-code fingerprint (M16): lowercase the source, split it into word
 * tokens, then take overlapping SHINGLE_SIZE-token windows as the set the
 * Jaccard client compares. Why shingles and not bare tokens: bare token sets
 * make any two solutions in the same language look similar (shared keywords);
 * shingles encode local ORDER, so only genuinely copied code overlaps heavily
 * — the cheap, dependency-free cousin of the MinHash plan for pool repos.
 * Whitespace/case/punctuation changes don't change the tokens, so trivial
 * reformatting can't hide a copy; systematic renaming degrades the score
 * gradually rather than defeating it outright.
 */
export function codeFingerprint(refId: string, code: string): SubmissionFingerprint {
  const tokens = code.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  if (tokens.length === 0) return { entryId: refId, tokens: [] };
  if (tokens.length < SHINGLE_SIZE) return { entryId: refId, tokens };

  const shingles: string[] = [];
  for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++) {
    shingles.push(tokens.slice(i, i + SHINGLE_SIZE).join(''));
  }
  return { entryId: refId, tokens: shingles };
}
