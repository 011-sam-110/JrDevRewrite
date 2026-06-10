'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { listScannablePools, makePoolScanDeps } from './scan-deps';
import { scanSubmissions } from './scan-submissions';

/**
 * Operator-triggered run of the anti-cheat scan over every active pool. Server
 * actions are public endpoints, so the operator check runs HERE on every call —
 * the page hiding the button is cosmetics.
 */
async function callerIsOperator(): Promise<boolean> {
  const identity = await getIdentity();
  return (
    identity !== null &&
    isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))
  );
}

export async function scanSubmissionsAction(): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');

  const deps = makePoolScanDeps();
  const now = new Date();
  for (const poolId of await listScannablePools()) {
    await scanSubmissions(deps, poolId, now);
  }

  // Whatever the scan found, the refreshed flag queue is the truthful response.
  revalidatePath('/operator/flags');
}
