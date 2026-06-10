/** A GitHub identity to link to a Junior Dev account (read-only access). */
export interface GitHubProfile {
  /** GitHub's stable numeric/user id — usernames can change, ids cannot. */
  githubId: string;
  username: string;
}

/**
 * Server-side repo signals that pool anti-cheat anchors on (CLAUDE.md → repo
 * rule): the repo's creation time and its push-event timeline. NEVER local
 * commit timestamps — those are client-set and forgeable.
 */
export interface RepoSignals {
  createdAt: Date;
  /** Server-side push-event timestamps, newest-or-oldest order irrelevant. */
  pushedAt: Date[];
}

/**
 * Outcome of reading a repo's signals. Discriminated so the slice can tell a
 * repo that genuinely doesn't exist from a transient throttle: `rate-limited`
 * is the rate-limit awareness the real client maps from GitHub's 403 +
 * `X-RateLimit-Remaining: 0`, and the slice surfaces it as "try again".
 */
export type RepoSignalsResult =
  | { ok: true; signals: RepoSignals }
  | { ok: false; reason: 'invalid-url' | 'not-found' | 'forbidden' | 'rate-limited' };

/**
 * The GitHub access seam. `fetchProfileToConnect` links an account at
 * onboarding; `fetchRepoSignals` reads the anti-cheat signals at submission.
 * Both read-only.
 */
export interface GitHubConnector {
  /** Obtain the GitHub identity to link for the signed-in user. */
  fetchProfileToConnect(input: { userId: string; email: string }): Promise<GitHubProfile>;
  /** Read a competition repo's server-side creation + push signals. */
  fetchRepoSignals(input: { repoUrl: string }): Promise<RepoSignalsResult>;
}
