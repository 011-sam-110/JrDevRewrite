'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { entries } from '@/infra/db/schema';
import { clearFlag, upholdFlag, type ReviewFlagDeps } from './review-flag';

/**
 * Server actions are public endpoints — the operator check runs HERE on every
 * call, not just on the page that renders the buttons.
 */
async function callerIsOperator(): Promise<boolean> {
  const identity = await getIdentity();
  return (
    identity !== null &&
    isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))
  );
}

const deps: ReviewFlagDeps = {
  getEntry: async (entryId) => {
    const row = await getDb().query.entries.findFirst({ where: eq(entries.id, entryId) });
    return row ? { id: row.id, moderationStatus: row.moderationStatus } : null;
  },
  setModeration: async (entryId, status, reviewedAt) => {
    await getDb()
      .update(entries)
      .set({ moderationStatus: status, reviewedAt })
      .where(eq(entries.id, entryId));
  },
};

export async function upholdFlagAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await upholdFlag(deps, String(formData.get('entryId') ?? ''), new Date());
  revalidatePath('/operator/flags');
}

export async function clearFlagAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await clearFlag(deps, String(formData.get('entryId') ?? ''), new Date());
  revalidatePath('/operator/flags');
}
