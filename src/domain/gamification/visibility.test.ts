import { describe, expect, it } from 'vitest';
import {
  appearsInLeaderboard,
  canViewProfile,
  DEFAULT_VISIBILITY,
  isProfileVisibility,
  PROFILE_VISIBILITIES,
  toggleVisibility,
  type ProfileVisibility,
} from './visibility';

/**
 * The privacy rule (CLAUDE.md → Profiles: "Public by default, with a single
 * account-level private toggle"). Pure predicate, so the same decision governs
 * the profile page, the leaderboards, and search without drifting.
 */

describe('visibility constants', () => {
  it('defaults to public — the recruiter-facing portfolio is the thesis', () => {
    expect(DEFAULT_VISIBILITY).toBe('public');
  });

  it('recognises exactly the two known values', () => {
    expect([...PROFILE_VISIBILITIES].sort()).toEqual(['private', 'public']);
    expect(isProfileVisibility('public')).toBe(true);
    expect(isProfileVisibility('private')).toBe(true);
    expect(isProfileVisibility('hidden')).toBe(false);
    expect(isProfileVisibility('')).toBe(false);
  });
});

describe('toggleVisibility', () => {
  it('flips public ↔ private and round-trips', () => {
    expect(toggleVisibility('public')).toBe('private');
    expect(toggleVisibility('private')).toBe('public');
    expect(toggleVisibility(toggleVisibility('public'))).toBe('public');
  });
});

describe('canViewProfile', () => {
  it('the owner always sees their own profile, even when private', () => {
    expect(canViewProfile({ visibility: 'private', isOwner: true })).toBe(true);
    expect(canViewProfile({ visibility: 'public', isOwner: true })).toBe(true);
  });

  it('others see a public profile but not a private one', () => {
    expect(canViewProfile({ visibility: 'public', isOwner: false })).toBe(true);
    expect(canViewProfile({ visibility: 'private', isOwner: false })).toBe(false);
  });
});

describe('appearsInLeaderboard', () => {
  it('only public profiles surface in leaderboards / search', () => {
    expect(appearsInLeaderboard('public')).toBe(true);
    expect(appearsInLeaderboard('private')).toBe(false);
  });

  it('a private profile is hidden from the board even for its owner — the board is public', () => {
    // Leaderboards are a public surface; visibility alone decides inclusion, with
    // no per-viewer exception. (The owner still sees their own number on their
    // dashboard/profile — just not as a public board row.)
    const visibilities: ProfileVisibility[] = ['public', 'private'];
    for (const v of visibilities) {
      expect(appearsInLeaderboard(v)).toBe(v === 'public');
    }
  });
});
