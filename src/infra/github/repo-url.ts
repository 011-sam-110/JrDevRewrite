/**
 * Parse a GitHub repo reference into { owner, repo }, or null if it isn't a
 * recognizable GitHub repo. Pure helper: the real client uses it to build API
 * calls; the mock uses it to validate the URL shape an entrant pasted. Lives in
 * infra/github (not the domain kernel) because the format is a GitHub I/O
 * concern, not a business rule.
 *
 * Accepts the forms students actually paste:
 *   https://github.com/owner/repo        github.com/owner/repo
 *   https://github.com/owner/repo.git    git@github.com:owner/repo.git
 *   owner/repo                            …with trailing path/slash/query.
 */
export interface RepoRef {
  owner: string;
  repo: string;
}

/** GitHub owner/repo name charset (no validation of length/edge dots needed here). */
const NAME = /^[A-Za-z0-9._-]+$/;

export function parseGitHubRepoUrl(raw: string): RepoRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip the known GitHub prefixes down to "owner/repo[/…]".
  const path = trimmed
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '');

  // Anything host-like left over means it wasn't a GitHub URL (e.g. gitlab).
  if (path.includes('://') || path.includes('@')) return null;

  const segments = path.split(/[/?#]/).filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repoRaw = segments[1];
  if (!owner || !repoRaw) return null;

  const repo = repoRaw.replace(/\.git$/i, '');
  if (!NAME.test(owner) || !NAME.test(repo)) return null;

  return { owner, repo };
}
