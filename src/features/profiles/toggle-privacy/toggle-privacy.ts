import { isProfileVisibility, type ProfileVisibility } from '@/domain/gamification';

/**
 * Use-case: set the signed-in user's profile visibility. The form posts the
 * desired target (the toggle computes the opposite of the current state), which
 * makes the action IDEMPOTENT — a double submit lands the same value, not an
 * unintended flip-back.
 *
 * The slice owns no rule: it validates the requested value against the kernel's
 * visibility union (so an out-of-band POST can't write garbage) and delegates
 * the write to a mockable dep. What public/private MEAN lives in
 * domain/gamification/visibility and is enforced wherever profiles are read.
 */

export interface SetVisibilityDeps {
  setVisibility(userId: string, visibility: ProfileVisibility): Promise<void>;
}

export type SetVisibilityResult =
  | { ok: true; visibility: ProfileVisibility }
  | { ok: false; error: 'invalid-visibility' };

export async function setProfileVisibility(
  deps: SetVisibilityDeps,
  userId: string,
  visibility: string,
): Promise<SetVisibilityResult> {
  if (!isProfileVisibility(visibility)) return { ok: false, error: 'invalid-visibility' };
  await deps.setVisibility(userId, visibility);
  return { ok: true, visibility };
}
