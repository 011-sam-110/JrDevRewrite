/**
 * Profile visibility — the privacy rule (CLAUDE.md → Profiles: "Public by
 * default, with a single account-level private toggle; losses appear in
 * aggregate stats only"). Pure, so the profile page, the leaderboards, and
 * search all gate on the SAME decision and can't drift out of agreement.
 *
 * Two values only. Public is the default because the recruiter-facing portfolio
 * is the product thesis; private is the single escape hatch that hides the
 * account from every public surface (profile view by others, leaderboards,
 * search) while leaving the owner full sight of their own numbers.
 */

export const PROFILE_VISIBILITIES = ['public', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export const DEFAULT_VISIBILITY: ProfileVisibility = 'public';

export function isProfileVisibility(value: string): value is ProfileVisibility {
  return (PROFILE_VISIBILITIES as readonly string[]).includes(value);
}

/** The opposite visibility — what the privacy toggle switches to. */
export function toggleVisibility(v: ProfileVisibility): ProfileVisibility {
  return v === 'public' ? 'private' : 'public';
}

/**
 * Can this viewer see this profile in full? The owner always can (so you can
 * check your own private profile); everyone else only when it's public.
 */
export function canViewProfile(args: { visibility: ProfileVisibility; isOwner: boolean }): boolean {
  return args.isOwner || args.visibility === 'public';
}

/**
 * Does this profile appear on public leaderboards / in search? Visibility alone
 * decides — there is no per-viewer exception, because the board itself is a
 * public surface. A private account is simply absent from it.
 */
export function appearsInLeaderboard(visibility: ProfileVisibility): boolean {
  return visibility === 'public';
}
