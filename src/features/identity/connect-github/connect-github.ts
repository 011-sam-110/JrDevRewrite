import type { GitHubConnector, GitHubProfile } from '@/infra/github';

/**
 * Use-case: link the mandatory GitHub account. Pure orchestration over the
 * connector seam — the mock connector serves dev/test until OAuth creds land,
 * and this slice doesn't know the difference (that's the point of the port).
 */
export interface ConnectGitHubDeps {
  github: Pick<GitHubConnector, 'fetchProfileToConnect'>;
  linkGitHubAccount(userId: string, profile: GitHubProfile): Promise<void>;
}

export async function connectGitHub(
  deps: ConnectGitHubDeps,
  user: { userId: string; email: string },
): Promise<GitHubProfile> {
  const profile = await deps.github.fetchProfileToConnect(user);
  await deps.linkGitHubAccount(user.userId, profile);
  return profile;
}
