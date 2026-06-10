'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { ProfileVisibility } from '@/domain/gamification';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { ensureProfile } from '@/infra/db/profiles';
import { profiles } from '@/infra/db/schema';
import { setProfileVisibility, type SetVisibilityDeps } from './toggle-privacy';

/**
 * Server action: change the SIGNED-IN user's own profile visibility. The target
 * user is the session, never the form — so this endpoint can only ever toggle
 * your own privacy, no matter what's POSTed.
 */
const deps: SetVisibilityDeps = {
  setVisibility: async (userId: string, visibility: ProfileVisibility) => {
    await getDb()
      .update(profiles)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
  },
};

export async function setVisibilityAction(formData: FormData): Promise<void> {
  const identity = await getIdentity();
  if (!identity) return; // signed out — nothing to toggle

  // Materialize the row first so the UPDATE has something to hit (a brand-new
  // account may not have touched /pools yet).
  await ensureProfile(identity.userId);
  await setProfileVisibility(deps, identity.userId, String(formData.get('visibility') ?? ''));

  revalidatePath('/leaderboard');
  if (identity.githubUsername) revalidatePath(`/u/${identity.githubUsername}`);
}
