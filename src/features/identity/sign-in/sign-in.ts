import { checkEmailEligibility } from '@/domain/identity';

/**
 * Use-case: request a magic link. The eligibility DECISION is the kernel's
 * (domain/identity); this slice maps it to user-facing outcomes and hands the
 * normalized address to whatever actually sends the link (injected, so tests
 * never touch Auth.js).
 */
export interface SignInDeps {
  sendMagicLink(normalizedEmail: string): Promise<void>;
}

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function requestMagicLink(deps: SignInDeps, rawEmail: string): Promise<SignInResult> {
  const eligibility = checkEmailEligibility(rawEmail);
  if (!eligibility.eligible) {
    return {
      ok: false,
      error:
        eligibility.reason === 'wrong-domain'
          ? 'Junior Dev is Sussex-only — sign in with your @sussex.ac.uk address.'
          : 'That does not look like a valid email address.',
    };
  }
  await deps.sendMagicLink(eligibility.normalized);
  return { ok: true };
}
