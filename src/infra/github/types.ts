/** A GitHub identity to link to a Junior Dev account (read-only access). */
export interface GitHubProfile {
  /** GitHub's stable numeric/user id — usernames can change, ids cannot. */
  githubId: string;
  username: string;
}

/**
 * The "connect a GitHub account" seam. M6 extends this adapter with the
 * repo-metadata + push-event reads that anti-cheat anchors on.
 */
export interface GitHubConnector {
  /** Obtain the GitHub identity to link for the signed-in user. */
  fetchProfileToConnect(input: { userId: string; email: string }): Promise<GitHubProfile>;
}
