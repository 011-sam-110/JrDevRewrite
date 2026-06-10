import { describe, expect, it } from 'vitest';
import { checkEmailEligibility } from './email-eligibility';

/**
 * The enrolment gate (CLAUDE.md → Binding v1 decisions → Identity):
 * the verified @sussex.ac.uk address IS the login, so this predicate is the
 * security boundary deciding who can hold an account at all. Written test-first.
 */
describe('checkEmailEligibility', () => {
  describe('accepts', () => {
    it('a plain sussex address, normalized as-is', () => {
      expect(checkEmailEligibility('ab123@sussex.ac.uk')).toEqual({
        eligible: true,
        normalized: 'ab123@sussex.ac.uk',
      });
    });

    it('mixed casing, lowercasing the whole address', () => {
      // Sussex mailboxes are case-insensitive (Exchange); if we kept casing,
      // AB123@ and ab123@ would become two accounts sharing one inbox.
      expect(checkEmailEligibility('AB123@Sussex.AC.UK')).toEqual({
        eligible: true,
        normalized: 'ab123@sussex.ac.uk',
      });
    });

    it('surrounding whitespace, trimming it', () => {
      expect(checkEmailEligibility('  ab123@sussex.ac.uk\n')).toEqual({
        eligible: true,
        normalized: 'ab123@sussex.ac.uk',
      });
    });

    it('plus-addressing, stripping the tag so one mailbox = one account', () => {
      // ab123+pools@ delivers to ab123@ — without stripping, one student could
      // register unlimited accounts (multi-account abuse in a competitive game).
      expect(checkEmailEligibility('ab123+pools@sussex.ac.uk')).toEqual({
        eligible: true,
        normalized: 'ab123@sussex.ac.uk',
      });
    });

    it('dots in the local part, preserved (dot-stripping is a Gmail-ism)', () => {
      expect(checkEmailEligibility('a.b.123@sussex.ac.uk')).toEqual({
        eligible: true,
        normalized: 'a.b.123@sussex.ac.uk',
      });
    });
  });

  describe('rejects', () => {
    it('other domains', () => {
      expect(checkEmailEligibility('ab123@gmail.com')).toEqual({
        eligible: false,
        reason: 'wrong-domain',
      });
    });

    it('sussex subdomains — only the canonical student domain enrols', () => {
      // Strict by default: easy to loosen later, impossible to un-grant accounts.
      expect(checkEmailEligibility('ab123@informatics.sussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'wrong-domain',
      });
    });

    it('lookalike domains that merely end in the same letters', () => {
      expect(checkEmailEligibility('ab123@notsussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'wrong-domain',
      });
    });

    it('domains that merely start with sussex.ac.uk', () => {
      expect(checkEmailEligibility('ab123@sussex.ac.uk.evil.com')).toEqual({
        eligible: false,
        reason: 'wrong-domain',
      });
    });

    it('a missing local part', () => {
      expect(checkEmailEligibility('@sussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'malformed',
      });
    });

    it('a local part that is empty once the plus-tag is stripped', () => {
      expect(checkEmailEligibility('+pools@sussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'malformed',
      });
    });

    it('multiple @ signs', () => {
      expect(checkEmailEligibility('a@b@sussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'malformed',
      });
    });

    it('whitespace inside the address', () => {
      expect(checkEmailEligibility('ab 123@sussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'malformed',
      });
    });

    it('the empty string', () => {
      expect(checkEmailEligibility('')).toEqual({ eligible: false, reason: 'malformed' });
    });

    it('no @ at all', () => {
      expect(checkEmailEligibility('sussex.ac.uk')).toEqual({
        eligible: false,
        reason: 'malformed',
      });
    });
  });
});
