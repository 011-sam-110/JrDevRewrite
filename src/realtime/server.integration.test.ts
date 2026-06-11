/**
 * Transport integration: a REAL server, two REAL sockets. The headline
 * assertion is the binding correctness property from CLAUDE.md — "the
 * identical problem is revealed to both at the same instant. Simultaneity is
 * a correctness property — test it." The kernel half (one shared goAt) is
 * M11's; this verifies the transport half: both clients receive the identical
 * go payload, and the skew between their arrival instants is bounded.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { COUNTDOWN_SECONDS, matchBattle, type BattleSnapshot } from '@/domain/battles';
import {
  parseClientEvent,
  type ClientEvent,
  type RevealedProblem,
  type ServerEvent,
} from '@/lib/match-events';
import { DevTokenAuthenticator } from './auth';
import { startRealtimeServer, type RealtimeServer } from './server';

/** Generous for CI, far below anything a player could perceive or exploit. */
const SIMULTANEITY_TOLERANCE_MS = 150;

const PROBLEM: RevealedProblem = {
  id: 'p1',
  slug: 'sum-two-integers',
  title: 'Sum of Two Integers',
  statementMd: 'Read two integers and print their sum.',
  tier: 'easy',
  timeLimitSeconds: 300,
};

function matchedBattle(now: Date): BattleSnapshot {
  const result = matchBattle(
    {
      status: 'challenged',
      readyDeadline: null,
      readyA: false,
      readyB: false,
      goAt: null,
      timeLimitSeconds: PROBLEM.timeLimitSeconds,
    },
    now,
  );
  if (!result.ok) throw new Error('unreachable');
  return result.battle;
}

/** A tiny promise-based client: every received event is timestamped. */
class TestSocket {
  private received: { event: ServerEvent; atMs: number }[] = [];
  private waiters: {
    type: ServerEvent['type'];
    resolve: (hit: { event: ServerEvent; atMs: number }) => void;
  }[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw: Buffer | string) => {
      // Server events are our own contract; reuse the client parser's JSON
      // handling by going through JSON directly (events are trusted here).
      const event = JSON.parse(String(raw)) as ServerEvent;
      const hit = { event, atMs: performance.now() };
      // Deliver to exactly one place: a pending waiter, or the buffer.
      const i = this.waiters.findIndex((w) => w.type === event.type);
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(hit);
      else this.received.push(hit);
    });
  }

  static connect(port: number): Promise<TestSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.once('open', () => resolve(new TestSocket(socket)));
      socket.once('error', reject);
    });
  }

  send(event: ClientEvent): void {
    this.socket.send(JSON.stringify(event));
  }

  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  /** Resolve with (and consume) the next event of `type`, buffered or future. */
  next<T extends ServerEvent['type']>(
    type: T,
    timeoutMs = 10_000,
  ): Promise<{ event: Extract<ServerEvent, { type: T }>; atMs: number }> {
    const seenIndex = this.received.findIndex((r) => r.event.type === type);
    const promise =
      seenIndex >= 0
        ? Promise.resolve(this.received.splice(seenIndex, 1)[0]!)
        : new Promise<{ event: ServerEvent; atMs: number }>((resolve, reject) => {
            this.waiters.push({ type, resolve });
            setTimeout(() => reject(new Error(`timed out waiting for '${type}'`)), timeoutMs);
          });
    return promise as Promise<{ event: Extract<ServerEvent, { type: T }>; atMs: number }>;
  }

  close(): void {
    this.socket.close();
  }
}

let server: RealtimeServer;

beforeAll(async () => {
  server = await startRealtimeServer({ port: 0, authenticator: new DevTokenAuthenticator() });
});

afterAll(async () => {
  await server.close();
});

describe('the synchronized go over real sockets', () => {
  it(
    'both clients receive the identical countdown + go, within the skew tolerance',
    { timeout: 20_000 },
    async () => {
      server.registry.create(
        { battleId: 'sim-1', players: { a: 'u-a', b: 'u-b' }, battle: matchedBattle(new Date()) },
        PROBLEM,
      );

      const a = await TestSocket.connect(server.port);
      const b = await TestSocket.connect(server.port);

      a.send({ type: 'hello', token: 'dev:u-a' });
      b.send({ type: 'hello', token: 'dev:u-b' });
      await Promise.all([a.next('hello-ok'), b.next('hello-ok')]);

      a.send({ type: 'join', battleId: 'sim-1' });
      b.send({ type: 'join', battleId: 'sim-1' });
      const [stateA, stateB] = await Promise.all([a.next('room-state'), b.next('room-state')]);
      expect(stateA.event.side).toBe('a');
      expect(stateB.event.side).toBe('b');
      expect(stateA.event.problem).toBeNull(); // nothing revealed yet

      const readySent = performance.now();
      a.send({ type: 'ready' });
      b.send({ type: 'ready' });

      // 1. The countdown names ONE instant, byte-identical on both sockets.
      const [cdA, cdB] = await Promise.all([a.next('countdown'), b.next('countdown')]);
      expect(cdA.event.goAt).toBe(cdB.event.goAt);
      const goAt = new Date(cdA.event.goAt).getTime();

      // 2. The go: identical payload (the reveal), bounded skew between sockets.
      const [goA, goB] = await Promise.all([a.next('go'), b.next('go')]);
      expect(goA.event).toEqual(goB.event);
      expect(goA.event.problem).toEqual(PROBLEM);
      expect(Math.abs(goA.atMs - goB.atMs)).toBeLessThan(SIMULTANEITY_TOLERANCE_MS);

      // 3. The go fired at goAt, not early: at least the countdown length after
      //    ready (minus the tolerance for clock granularity), never before.
      const earliest = readySent + COUNTDOWN_SECONDS * 1000 - SIMULTANEITY_TOLERANCE_MS;
      expect(goA.atMs).toBeGreaterThanOrEqual(earliest);
      expect(Date.now()).toBeGreaterThanOrEqual(goAt);

      a.close();
      b.close();
    },
  );

  it('enforces the handshake: join before hello is rejected, bad tokens are dropped', async () => {
    const socket = await TestSocket.connect(server.port);
    socket.send({ type: 'join', battleId: 'sim-1' });
    const err = await socket.next('error');
    expect(err.event.code).toBe('not-authenticated');

    socket.send({ type: 'hello', token: 'not-a-dev-token' });
    const failed = await socket.next('error', 5000);
    // The first error is consumed above; the next one is the auth failure.
    expect(['auth-failed', 'not-authenticated']).toContain(failed.event.code);
    socket.close();
  });

  it('rejects malformed frames with invalid-message', async () => {
    const socket = await TestSocket.connect(server.port);
    socket.sendRaw('garbage {{{');
    const err = await socket.next('error');
    expect(err.event.code).toBe('invalid-message');
    expect(parseClientEvent('garbage {{{')).toBeNull(); // same rule, same answer
    socket.close();
  });
});

/* ------------------------------------------- M15: HTTP surface + lazy rooms */

describe('the internal HTTP surface', () => {
  it('serves /healthz on the same port as the WS upgrade', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('404s anything else', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/internal/unknown`);
    expect(res.status).toBe(404);
  });

  it(
    'a settled poke resolves a live room, broadcasts the winner, and replies with telemetry',
    { timeout: 20_000 },
    async () => {
      server.registry.create(
        { battleId: 'poke-1', players: { a: 'p-a', b: 'p-b' }, battle: matchedBattle(new Date()) },
        PROBLEM,
      );
      const a = await TestSocket.connect(server.port);
      const b = await TestSocket.connect(server.port);
      a.send({ type: 'hello', token: 'dev:p-a' });
      b.send({ type: 'hello', token: 'dev:p-b' });
      await Promise.all([a.next('hello-ok'), b.next('hello-ok')]);
      a.send({ type: 'join', battleId: 'poke-1' });
      b.send({ type: 'join', battleId: 'poke-1' });
      await Promise.all([a.next('room-state'), b.next('room-state')]);
      a.send({ type: 'ready' });
      b.send({ type: 'ready' });
      await Promise.all([a.next('go'), b.next('go')]); // live

      a.send({ type: 'telemetry', kind: 'paste-blocked' });
      // Telemetry is fire-and-forget; give the frame a beat to land.
      await new Promise((r) => setTimeout(r, 200));

      const res = await fetch(`http://127.0.0.1:${server.port}/internal/battles/poke-1/settled`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winner: 'a' }),
      });
      expect(res.status).toBe(200);
      const ack = (await res.json()) as { telemetry: { kind: string; side: string }[] };
      expect(ack.telemetry).toEqual([
        { side: 'a', kind: 'paste-blocked', atSeconds: expect.any(Number) as number },
      ]);

      const [sA, sB] = await Promise.all([a.next('battle-status'), b.next('battle-status')]);
      expect(sA.event).toEqual({
        type: 'battle-status',
        status: 'resolved',
        winner: 'a',
        reason: null,
      });
      expect(sB.event).toEqual(sA.event);

      a.close();
      b.close();
    },
  );
});

describe('lazy room materialization', () => {
  it('an unknown battle loads ONCE through the roomSource even under a simultaneous join', async () => {
    let calls = 0;
    const lazy = await startRealtimeServer({
      port: 0,
      authenticator: new DevTokenAuthenticator(),
      roomSource: async (battleId) => {
        calls++;
        await new Promise((r) => setTimeout(r, 50)); // widen the race window
        return {
          config: {
            battleId,
            players: { a: 'lz-a', b: 'lz-b' },
            battle: matchedBattle(new Date()),
          },
          problem: PROBLEM,
        };
      },
    });
    try {
      const a = await TestSocket.connect(lazy.port);
      const b = await TestSocket.connect(lazy.port);
      a.send({ type: 'hello', token: 'dev:lz-a' });
      b.send({ type: 'hello', token: 'dev:lz-b' });
      await Promise.all([a.next('hello-ok'), b.next('hello-ok')]);

      a.send({ type: 'join', battleId: 'lazy-1' });
      b.send({ type: 'join', battleId: 'lazy-1' });
      const [stateA, stateB] = await Promise.all([a.next('room-state'), b.next('room-state')]);

      expect(calls).toBe(1); // one load, one room — not a room per joiner
      expect(stateA.event.side).toBe('a');
      expect(stateB.event.side).toBe('b');
      expect(lazy.registry.get('lazy-1')).toBeDefined();

      a.close();
      b.close();
    } finally {
      await lazy.close();
    }
  });

  it('a battle the source does not know stays unknown', async () => {
    const lazy = await startRealtimeServer({
      port: 0,
      authenticator: new DevTokenAuthenticator(),
      roomSource: async () => null,
    });
    try {
      const a = await TestSocket.connect(lazy.port);
      a.send({ type: 'hello', token: 'dev:lz-a' });
      await a.next('hello-ok');
      a.send({ type: 'join', battleId: 'missing' });
      const err = await a.next('error');
      expect(err.event.code).toBe('unknown-battle');
      a.close();
    } finally {
      await lazy.close();
    }
  });
});
