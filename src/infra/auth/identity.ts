import { and, eq } from 'drizzle-orm';
import { onboardingStatus, type OnboardingStatus } from '@/domain/identity';
import { getDb } from '@/infra/db/client';
import { accounts, users } from '@/infra/db/schema';
import { auth } from './auth';

/**
 * The one identity loader every guarded page and action uses. Session
 * (Auth.js) + user row + GitHub link, folded through the kernel's
 * onboardingStatus rule so all guards agree on where an account stands.
 * Lives in infra/auth (not a feature) because slices in every feature need
 * it — cross-slice imports are the smell VSA exists to kill.
 */
export interface Identity {
  userId: string;
  email: string;
  jobRole: string | null;
  githubUsername: string | null;
  status: OnboardingStatus;
}

export async function getIdentity(): Promise<Identity | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.email) return null;

  const githubLink = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'github')),
  });

  return {
    userId: user.id,
    email: user.email,
    jobRole: user.jobRole,
    githubUsername: user.githubUsername,
    status: onboardingStatus({
      jobRole: user.jobRole,
      githubConnected: githubLink !== undefined,
    }),
  };
}
