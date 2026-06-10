/**
 * The enrolment gate: only verified @sussex.ac.uk addresses may sign in
 * (CLAUDE.md → Binding v1 decisions → Identity). Pure — no I/O, so the
 * security boundary is unit-testable and reusable verbatim in the sign-in
 * action (friendly error) and the Auth.js callbacks (hard enforcement).
 */

export const ELIGIBLE_DOMAIN = 'sussex.ac.uk';

export type EmailEligibility =
  | { eligible: true; normalized: string }
  | { eligible: false; reason: 'malformed' | 'wrong-domain' };

export function checkEmailEligibility(raw: string): EmailEligibility {
  const trimmed = raw.trim().toLowerCase();

  const parts = trimmed.split('@');
  if (parts.length !== 2) return { eligible: false, reason: 'malformed' };
  const [localRaw, domain] = parts as [string, string];
  if (localRaw === '' || /\s/.test(trimmed)) return { eligible: false, reason: 'malformed' };

  // Exact-domain match: subdomains and lookalikes are out. Strict is the safe
  // default — loosening later is easy; revoking wrongly-granted accounts is not.
  if (domain !== ELIGIBLE_DOMAIN) return { eligible: false, reason: 'wrong-domain' };

  // Strip plus-addressing: ab123+anything@ delivers to ab123@, so the tag
  // would let one mailbox register many accounts.
  const local = localRaw.split('+')[0]!;
  if (local === '') return { eligible: false, reason: 'malformed' };

  return { eligible: true, normalized: `${local}@${domain}` };
}
