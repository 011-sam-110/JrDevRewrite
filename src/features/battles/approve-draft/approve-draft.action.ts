'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { problems } from '@/infra/db/schema';
import {
  approveProblemDraft,
  rejectProblemDraft,
  retireBankProblem,
  type ReviewProblemDeps,
} from './approve-draft';

/**
 * Server actions are public HTTP endpoints — the page hiding the buttons is
 * cosmetics, so the operator check runs HERE, on every call (the M4 pattern).
 */
async function callerIsOperator(): Promise<boolean> {
  const identity = await getIdentity();
  return (
    identity !== null &&
    isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))
  );
}

const deps: ReviewProblemDeps = {
  getProblem: async (problemId) => {
    const row = await getDb().query.problems.findFirst({ where: eq(problems.id, problemId) });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      verifiedAt: row.verifiedAt,
      rejectedAt: row.rejectedAt,
    };
  },
  setApproved: async (problemId, approvedAt) => {
    await getDb()
      .update(problems)
      .set({ status: 'approved', approvedAt })
      .where(eq(problems.id, problemId));
  },
  setRetired: async (problemId, retiredAt) => {
    await getDb()
      .update(problems)
      .set({ status: 'retired', retiredAt })
      .where(eq(problems.id, problemId));
  },
  markRejected: async (problemId, rejectedAt) => {
    // Rejection is archival: keep status 'draft' but stamp rejectedAt (the
    // draft queue filters these out), the pools `rejectedAt` pattern.
    await getDb().update(problems).set({ rejectedAt }).where(eq(problems.id, problemId));
  },
};

export async function approveProblemAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await approveProblemDraft(deps, String(formData.get('problemId') ?? ''), new Date());
  revalidatePath('/operator/problems');
}

export async function rejectProblemAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await rejectProblemDraft(deps, String(formData.get('problemId') ?? ''), new Date());
  revalidatePath('/operator/problems');
}

export async function retireProblemAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await retireBankProblem(deps, String(formData.get('problemId') ?? ''), new Date());
  revalidatePath('/operator/problems');
}
