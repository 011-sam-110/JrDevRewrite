'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/infra/db/client';
import { accounts, users } from '@/infra/db/schema';
import { getGitHubConnector } from '@/infra/github';
import { getIdentity } from '../session';
import { connectGitHub } from './connect-github';

export async function connectGitHubAction(): Promise<void> {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  await connectGitHub(
    {
      github: getGitHubConnector(),
      linkGitHubAccount: async (userId, profile) => {
        const db = getDb();
        // Idempotent: re-clicking "connect" must not throw on the unique link.
        await db
          .insert(accounts)
          .values({
            userId,
            type: 'oauth',
            provider: 'github',
            providerAccountId: profile.githubId,
            scope: 'read:user',
          })
          .onConflictDoNothing();
        await db
          .update(users)
          .set({ githubUsername: profile.username })
          .where(eq(users.id, userId));
      },
    },
    { userId: identity.userId, email: identity.email },
  );

  redirect('/dashboard');
}
