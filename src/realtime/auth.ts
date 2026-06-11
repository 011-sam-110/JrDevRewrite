/**
 * Who is on the other end of a socket? The realtime service trusts NOTHING a
 * client sends except a token it can verify — this seam is the verification.
 * Same adapter pattern as infra/github and infra/judge: an interface, a real
 * implementation, and a dev fallback so the service runs without extra setup.
 */

import { eq } from 'drizzle-orm';

export interface Authenticator {
  /** Resolve a handshake token to a user, or null to refuse the socket. */
  authenticate(token: string): Promise<{ userId: string } | null>;
}

/**
 * Dev-only: `dev:<userId>` tokens, the WS twin of `/dev/login`. Hard-gated out
 * of production INSIDE the call (not just at wiring time) so a mis-wired prod
 * deploy fails closed.
 */
export class DevTokenAuthenticator implements Authenticator {
  async authenticate(token: string): Promise<{ userId: string } | null> {
    if (process.env.NODE_ENV === 'production') return null;
    if (!token.startsWith('dev:')) return null;
    const userId = token.slice('dev:'.length);
    return userId.length > 0 ? { userId } : null;
  }
}

type SessionLookup = (token: string) => Promise<{ userId: string; expires: Date } | null>;

/**
 * The real authenticator: the token IS an Auth.js database-session token (the
 * value of the session cookie). The browser already holds one; M15's arena
 * client passes it on connect, and we verify it against the same sessions
 * table Auth.js writes. Lookup + clock are injected so the expiry rule is
 * unit-testable; `forDb()` wires the real Drizzle query.
 */
export class DbSessionAuthenticator implements Authenticator {
  constructor(
    private readonly lookup: SessionLookup,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static forDb(): DbSessionAuthenticator {
    return new DbSessionAuthenticator(async (token) => {
      // Lazy imports keep the DB driver off the dev/test path entirely.
      const [{ getDb }, { sessions }] = await Promise.all([
        import('@/infra/db/client'),
        import('@/infra/db/schema'),
      ]);
      const row = await getDb().query.sessions.findFirst({
        where: eq(sessions.sessionToken, token),
      });
      return row ? { userId: row.userId, expires: row.expires } : null;
    });
  }

  async authenticate(token: string): Promise<{ userId: string } | null> {
    if (token.length === 0) return null;
    const session = await this.lookup(token);
    if (!session) return null;
    // Deadlines are inclusive, as everywhere: now === expires is expired.
    if (this.now().getTime() >= session.expires.getTime()) return null;
    return { userId: session.userId };
  }
}
