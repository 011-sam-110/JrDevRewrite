import { describe, expect, it, vi } from 'vitest';
import { requestMagicLink } from './sign-in';

describe('requestMagicLink', () => {
  it('sends the link to the NORMALIZED address for an eligible email', async () => {
    const sendMagicLink = vi.fn().mockResolvedValue(undefined);

    const result = await requestMagicLink({ sendMagicLink }, '  AB123+x@Sussex.AC.UK ');

    expect(result).toEqual({ ok: true });
    expect(sendMagicLink).toHaveBeenCalledExactlyOnceWith('ab123@sussex.ac.uk');
  });

  it('rejects non-sussex emails without sending anything', async () => {
    const sendMagicLink = vi.fn();

    const result = await requestMagicLink({ sendMagicLink }, 'ab123@gmail.com');

    expect(result).toEqual({
      ok: false,
      error: 'Junior Dev is Sussex-only — sign in with your @sussex.ac.uk address.',
    });
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it('rejects malformed input with a distinct message', async () => {
    const sendMagicLink = vi.fn();

    const result = await requestMagicLink({ sendMagicLink }, 'not-an-email');

    expect(result).toEqual({
      ok: false,
      error: 'That does not look like a valid email address.',
    });
    expect(sendMagicLink).not.toHaveBeenCalled();
  });
});
