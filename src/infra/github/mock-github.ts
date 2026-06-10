import { parseGitHubRepoUrl } from './repo-url';
import type { GitHubConnector, GitHubProfile, RepoSignalsResult } from './types';

/**
 * Dev/test stand-in for the GitHub OAuth dance + repo reads: fabricates a
 * deterministic profile from the user's email local part, so the same user
 * always "connects" the same fake account (stable across re-runs, useful for
 * seeding + e2e).
 */
export class MockGitHubConnector implements GitHubConnector {
  async fetchProfileToConnect({
    userId,
    email,
  }: {
    userId: string;
    email: string;
  }): Promise<GitHubProfile> {
    const local = email.split('@')[0] ?? 'student';
    return {
      githubId: `mock-${userId}`,
      username: `${local}-dev`,
    };
  }

  /**
   * Returns signals for a freshly-built repo: created "now" with a push "now".
   * Created-now is the latest possible timestamp, so it always passes the
   * freshness check for a pool that is currently `building` (its window opened
   * in the past and closes in the future) — keeping the dev + e2e happy path
   * green without a live GitHub account. An unparseable URL is the one failure
   * the mock models, so the slice's invalid-URL branch is still exercised.
   */
  async fetchRepoSignals({ repoUrl }: { repoUrl: string }): Promise<RepoSignalsResult> {
    if (!parseGitHubRepoUrl(repoUrl)) return { ok: false, reason: 'invalid-url' };
    const now = new Date();
    return { ok: true, signals: { createdAt: now, pushedAt: [now] } };
  }
}
