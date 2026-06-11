/**
 * `npm run dev:ws` — the local realtime service. Listens on REALTIME_PORT
 * (default 3001), accepts BOTH `dev:<userId>` tokens (the WS twin of
 * /dev/login; non-production only) and real Auth.js session tokens (what the
 * M14 arena client sends), and seeds one demo room so the service is
 * immediately pokeable:
 *
 *   battleId 'demo', players dev-a / dev-b. From two terminals or a browser
 *   console: connect, {"type":"hello","token":"dev:dev-a"}, {"type":"join",
 *   "battleId":"demo"}, {"type":"ready"} — when both seats are ready, both
 *   sockets receive the synchronized countdown and go.
 *
 * Thin entry point: wiring only. Relative imports so tsx runs it without
 * path-alias config (the cli.ts house pattern).
 */

import 'dotenv/config';
import { matchBattle, DEFAULT_TIME_LIMIT_SECONDS } from '../domain/battles';
import type { RevealedProblem } from '../lib/match-events';
import { DbSessionAuthenticator, DevTokenAuthenticator, type Authenticator } from './auth';
import { startRealtimeServer } from './server';

/** Dev tokens first (cheap, no DB); real session tokens otherwise. */
class DevComposite implements Authenticator {
  private readonly dev = new DevTokenAuthenticator();
  private readonly db = DbSessionAuthenticator.forDb();

  async authenticate(token: string): Promise<{ userId: string } | null> {
    if (token.startsWith('dev:')) return this.dev.authenticate(token);
    try {
      return await this.db.authenticate(token);
    } catch {
      return null; // no DB running — dev tokens still work
    }
  }
}

const DEMO_PROBLEM: RevealedProblem = {
  id: 'demo-problem',
  slug: 'sum-two-integers',
  title: 'Sum of Two Integers',
  statementMd: 'Read two space-separated integers `a` and `b` on one line. Print their sum.',
  tier: 'easy',
  timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
};

async function main(): Promise<void> {
  const port = Number(process.env.REALTIME_PORT ?? 3001);
  const server = await startRealtimeServer({
    port,
    authenticator: new DevComposite(),
    log: (line) => console.log(line),
  });

  const matched = matchBattle(
    {
      status: 'challenged',
      readyDeadline: null,
      readyA: false,
      readyB: false,
      goAt: null,
      timeLimitSeconds: DEMO_PROBLEM.timeLimitSeconds,
    },
    new Date(),
  );
  if (matched.ok) {
    server.registry.create(
      { battleId: 'demo', players: { a: 'dev-a', b: 'dev-b' }, battle: matched.battle },
      DEMO_PROBLEM,
      (effects, battle) =>
        console.log(`[demo] kernel effects: ${effects.join(', ')} → ${battle.status}`),
    );
    console.log(
      `demo room ready: battleId 'demo', players dev-a/dev-b (tokens dev:dev-a, dev:dev-b)`,
    );
  }

  console.log(`realtime service up on ws://localhost:${server.port}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
