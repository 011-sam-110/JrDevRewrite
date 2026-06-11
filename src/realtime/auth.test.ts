import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbSessionAuthenticator, DevTokenAuthenticator } from './auth';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DevTokenAuthenticator', () => {
  it('accepts dev:<userId> tokens outside production', async () => {
    const auth = new DevTokenAuthenticator();
    await expect(auth.authenticate('dev:user-42')).resolves.toEqual({ userId: 'user-42' });
  });

  it('rejects tokens without the dev prefix or with an empty user id', async () => {
    const auth = new DevTokenAuthenticator();
    await expect(auth.authenticate('user-42')).resolves.toBeNull();
    await expect(auth.authenticate('dev:')).resolves.toBeNull();
    await expect(auth.authenticate('')).resolves.toBeNull();
  });

  it('refuses to authenticate ANYTHING in production (hard gate)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const auth = new DevTokenAuthenticator();
    await expect(auth.authenticate('dev:user-42')).resolves.toBeNull();
  });
});

describe('DbSessionAuthenticator', () => {
  const NOW = new Date('2026-06-11T12:00:00Z');
  const session = (expiresInSeconds: number) => ({
    userId: 'user-7',
    expires: new Date(NOW.getTime() + expiresInSeconds * 1000),
  });

  it('accepts a known, unexpired session token', async () => {
    const auth = new DbSessionAuthenticator(
      async () => session(3600),
      () => NOW,
    );
    await expect(auth.authenticate('tok')).resolves.toEqual({ userId: 'user-7' });
  });

  it('rejects an unknown token', async () => {
    const auth = new DbSessionAuthenticator(
      async () => null,
      () => NOW,
    );
    await expect(auth.authenticate('tok')).resolves.toBeNull();
  });

  it('rejects an expired session (deadline inclusive, like everywhere)', async () => {
    const auth = new DbSessionAuthenticator(
      async () => session(0),
      () => NOW,
    );
    await expect(auth.authenticate('tok')).resolves.toBeNull();
  });
});
