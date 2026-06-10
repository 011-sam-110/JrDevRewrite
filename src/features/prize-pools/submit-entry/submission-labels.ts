import type { FreshnessFlag, SubmissionRejection } from '@/domain/prize-pools';
import type { RepoVerificationFailure, SubmitEntryResult } from './submit-entry';

/**
 * Human phrasing for every submit-entry failure. Its own module (not the
 * action file) because 'use server' modules may only export async functions at
 * runtime — and the form's client component imports the message mapper.
 */

const WINDOW_LABELS: Record<SubmissionRejection, string> = {
  'not-an-entrant': 'Join this pool before you can submit.',
  'build-window-not-open': 'The build window has not opened yet.',
  'build-window-closed': 'The build window has closed — submissions are no longer accepted.',
  'already-submitted': 'You have already submitted your entry for this pool.',
};

const REPO_FAILURE_LABELS: Record<RepoVerificationFailure, string> = {
  'invalid-url': "That does not look like a GitHub repository URL — paste the repo's https link.",
  'not-found': "We couldn't find that repository — make sure it's public and the URL is right.",
  forbidden: "We don't have read access to that repository.",
  'rate-limited': 'GitHub is rate-limiting us right now — try again in a minute.',
};

const FRESHNESS_FLAG_LABELS: Record<FreshnessFlag, string> = {
  'repo-predates-window':
    'This repository was created before the build window opened — use a fresh repo made after the window started.',
  'no-in-window-pushes':
    "We couldn't find any commits pushed during the build window — push your work to GitHub, then resubmit.",
};

/** Map any failure result to a single user-facing sentence. */
export function submitErrorMessage(result: Extract<SubmitEntryResult, { ok: false }>): string {
  switch (result.error) {
    case 'not-found':
      return 'Pool not found.';
    case 'missing-video':
      return 'Attach a short demo video (30–90s) to submit.';
    case 'window':
      return result.reasons.map((r) => WINDOW_LABELS[r]).join(' ');
    case 'repo':
      return REPO_FAILURE_LABELS[result.reason];
    case 'not-fresh':
      return result.flags.map((f) => FRESHNESS_FLAG_LABELS[f]).join(' ');
  }
}
