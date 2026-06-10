import type { OriginalityFlag } from '@/domain/prize-pools';

/** Human-readable explanations of each anti-cheat flag for the operator console. */
export const FLAG_LABELS: Record<OriginalityFlag, string> = {
  'duplicate-co-entry': 'Duplicate of another entrant’s submission',
  'reused-prior-work': 'Reuses the entrant’s own prior submission',
};
