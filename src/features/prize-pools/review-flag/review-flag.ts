import { reviewFlag, type ModerationStatus, type ReviewDecision } from '@/domain/prize-pools';

/**
 * Use-case: the operator reviews an anti-cheat flag — uphold it (confirmed
 * cheating; the entry stays excluded from judging/results) or clear it (false
 * positive; the entry is judgeable again). The "only an open flag is reviewable"
 * rule is the kernel's reviewFlag; this slice only orchestrates load → kernel
 * verdict → persist. Mirrors approve-pool's shape exactly.
 */

export interface FlaggedEntryRow {
  id: string;
  moderationStatus: ModerationStatus;
}

export interface ReviewFlagDeps {
  getEntry(entryId: string): Promise<FlaggedEntryRow | null>;
  setModeration(entryId: string, status: 'upheld' | 'cleared', reviewedAt: Date): Promise<void>;
}

export type ReviewFlagResult = { ok: true } | { ok: false; error: 'not-found' | 'not-flagged' };

async function review(
  deps: ReviewFlagDeps,
  entryId: string,
  decision: ReviewDecision,
  now: Date,
): Promise<ReviewFlagResult> {
  const entry = await deps.getEntry(entryId);
  if (!entry) return { ok: false, error: 'not-found' };

  const outcome = reviewFlag(entry.moderationStatus, decision);
  if (!outcome.ok) return { ok: false, error: outcome.error };

  await deps.setModeration(entryId, outcome.status, now);
  return { ok: true };
}

export function upholdFlag(
  deps: ReviewFlagDeps,
  entryId: string,
  now: Date,
): Promise<ReviewFlagResult> {
  return review(deps, entryId, 'uphold', now);
}

export function clearFlag(
  deps: ReviewFlagDeps,
  entryId: string,
  now: Date,
): Promise<ReviewFlagResult> {
  return review(deps, entryId, 'clear', now);
}
