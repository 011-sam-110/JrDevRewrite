'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isJobRole } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { castVote } from './cast-vote';
import { castVoteErrorMessage } from './cast-vote-labels';
import { makeCastVoteDeps } from './cast-deps';

export type CastVoteActionState =
  | { status: 'idle' }
  | { status: 'submitted' }
  | { status: 'error'; message: string };

/**
 * Thin entry point: auth/onboarding guard, parse the ranking (an ordered,
 * comma-joined list of entry ids the JudgePanel submits), wire the real deps,
 * delegate to the slice. Every rule — coverage, structural validity, state
 * guards — is re-checked server-side inside castVote, so a stale or tampered
 * submit just lands an inline rejection.
 */
export async function castVoteAction(
  _prev: CastVoteActionState,
  formData: FormData,
): Promise<CastVoteActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete' || !identity.jobRole || !isJobRole(identity.jobRole)) {
    redirect('/onboarding');
  }

  const poolId = String(formData.get('poolId') ?? '');
  const ranking = String(formData.get('ranking') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const result = await castVote(
    makeCastVoteDeps(),
    { userId: identity.userId, poolId, ranking },
    new Date(),
  );

  if (!result.ok) return { status: 'error', message: castVoteErrorMessage(result) };

  revalidatePath(`/pools/${poolId}`);
  revalidatePath(`/pools/${poolId}/judge`);
  return { status: 'submitted' };
}
