import { describe, expect, it } from 'vitest';
import { parseGitHubRepoUrl } from './repo-url';

describe('parseGitHubRepoUrl — accepts', () => {
  it.each([
    ['https://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['http://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['https://www.github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['octocat/hello-world', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world.git', 'octocat', 'hello-world'],
    ['git@github.com:octocat/hello-world.git', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/tree/main', 'octocat', 'hello-world'],
    ['  https://github.com/octocat/hello-world?tab=readme  ', 'octocat', 'hello-world'],
    ['octocat/dot.name_repo-2', 'octocat', 'dot.name_repo-2'],
  ])('parses %s', (input, owner, repo) => {
    expect(parseGitHubRepoUrl(input)).toEqual({ owner, repo });
  });
});

describe('parseGitHubRepoUrl — rejects', () => {
  it.each([
    [''],
    ['   '],
    ['octocat'],
    ['https://github.com/octocat'],
    ['https://gitlab.com/octocat/hello-world'],
    ['https://example.com/octocat/hello-world'],
    ['not a url at all'],
    ['https://github.com//hello-world'],
  ])('rejects %s', (input) => {
    expect(parseGitHubRepoUrl(input)).toBeNull();
  });
});
