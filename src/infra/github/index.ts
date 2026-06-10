import { MockGitHubConnector } from './mock-github';
import type { GitHubConnector } from './types';

export { MockGitHubConnector } from './mock-github';
export type { GitHubConnector, GitHubProfile } from './types';

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

/**
 * Adapter seam: the real OAuth connector (read-only scopes) slots in here once
 * Sampo registers a GitHub OAuth app (Needs from Sampo). Until then every
 * environment uses the mock, and the UI labels the button accordingly.
 */
export function getGitHubConnector(): GitHubConnector {
  if (isGitHubOAuthConfigured()) {
    throw new Error(
      'GitHub OAuth credentials detected but the real connector lands with M18 wiring — remove GITHUB_CLIENT_ID/SECRET or implement RealGitHubConnector.',
    );
  }
  return new MockGitHubConnector();
}
