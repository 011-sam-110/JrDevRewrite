import { describe, expect, it, vi } from 'vitest';
import type { GitHubProfile } from '@/infra/github';
import { connectGitHub } from './connect-github';

describe('connectGitHub', () => {
  it('fetches the profile from the connector and links it to the user', async () => {
    const profile: GitHubProfile = { githubId: 'gh-42', username: 'octocat' };
    const github = { fetchProfileToConnect: vi.fn().mockResolvedValue(profile) };
    const linkGitHubAccount = vi.fn().mockResolvedValue(undefined);

    const result = await connectGitHub(
      { github, linkGitHubAccount },
      { userId: 'user-1', email: 'ab123@sussex.ac.uk' },
    );

    expect(result).toEqual(profile);
    expect(github.fetchProfileToConnect).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      email: 'ab123@sussex.ac.uk',
    });
    expect(linkGitHubAccount).toHaveBeenCalledExactlyOnceWith('user-1', profile);
  });

  it('does not link anything when the connector fails', async () => {
    const github = {
      fetchProfileToConnect: vi.fn().mockRejectedValue(new Error('github down')),
    };
    const linkGitHubAccount = vi.fn();

    await expect(
      connectGitHub({ github, linkGitHubAccount }, { userId: 'user-1', email: 'a@sussex.ac.uk' }),
    ).rejects.toThrow('github down');
    expect(linkGitHubAccount).not.toHaveBeenCalled();
  });
});
