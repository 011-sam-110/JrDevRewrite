'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/infra/db/client';
import { users } from '@/infra/db/schema';
import { getIdentity } from '../session';
import { selectRole } from './select-role';

export async function selectRoleAction(formData: FormData): Promise<void> {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const result = await selectRole(
    {
      setJobRole: async (userId, role) => {
        await getDb().update(users).set({ jobRole: role }).where(eq(users.id, userId));
      },
    },
    identity.userId,
    String(formData.get('role') ?? ''),
  );

  // Invalid role only happens with a tampered form — back to the start of the step.
  redirect(result.ok ? '/onboarding' : '/onboarding?error=role');
}
