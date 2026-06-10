import { isJobRole } from '@/domain/identity';

/**
 * Use-case: pick the launch job role during onboarding. Validation is the
 * kernel's `isJobRole` — form data is untrusted, so the check happens here
 * (server-side), not just in the UI.
 */
export interface SelectRoleDeps {
  setJobRole(userId: string, role: string): Promise<void>;
}

export type SelectRoleResult = { ok: true } | { ok: false; error: string };

export async function selectRole(
  deps: SelectRoleDeps,
  userId: string,
  roleInput: string,
): Promise<SelectRoleResult> {
  if (!isJobRole(roleInput)) return { ok: false, error: 'Pick one of the listed roles.' };
  await deps.setJobRole(userId, roleInput);
  return { ok: true };
}
