import type { GitHubConnector, GitHubProfile } from './types';

/**
 * Dev/test stand-in for the GitHub OAuth dance: fabricates a deterministic
 * profile from the user's email local part, so the same user always "connects"
 * the same fake account (stable across re-runs, useful for seeding + e2e).
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
}
