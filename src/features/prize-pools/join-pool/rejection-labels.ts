import { ACTIVE_POOL_CAP, JOIN_CREDIT_COST, type JoinRejection } from '@/domain/prize-pools';

/**
 * Human phrasing for every kernel rejection reason. Lives in its own module
 * (not the action file) because 'use server' modules may only export async
 * functions at runtime.
 */
export const JOIN_REJECTION_LABELS: Record<JoinRejection, string> = {
  'pool-not-open': 'This pool is not open for joining.',
  'join-window-closed': 'The join window has closed.',
  'pool-full': 'This pool is full.',
  'role-mismatch': 'This pool is for a different job role.',
  'difficulty-locked': 'Your pool rank has not unlocked this difficulty yet.',
  'active-pool-cap-reached': `You are already in ${ACTIVE_POOL_CAP} active pools — finish one first.`,
  'insufficient-credits': `Joining costs ${JOIN_CREDIT_COST} credit and your balance is empty.`,
  'already-entered': 'You are already in this pool.',
};
