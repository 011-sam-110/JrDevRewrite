/**
 * The edge of the realtime service: one HTTP listener carrying BOTH the
 * WebSocket upgrade (match transport) and a tiny internal HTTP surface
 * (/healthz for liveness, /internal/… for the Next-app pokes). NO battle
 * rules live here — the per-connection state machine below is purely
 * transport ("are you authenticated? are you in a room?"); everything
 * battle-shaped is the room's (and through it the kernel's) decision.
 *
 * Handshake protocol: a fresh socket must `hello {token}` within
 * HELLO_TIMEOUT_MS or be dropped; after `hello-ok` it may `join {battleId}`;
 * only then do ready/quit/progress mean anything.
 *
 * Rooms materialize LAZILY: a join for an unknown battleId asks the injected
 * `roomSource` (M15: the DB row written by accept-challenge/match-queue) —
 * so no cross-process "create room" call exists, the DB is the rendezvous.
 * This is also crash recovery: a service restart rebuilds any room from its
 * row on the next join, and a past readyDeadline immediately ticks to void.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { BattleEffect, BattleSnapshot, PlayerSide } from '@/domain/battles';
import {
  parseClientEvent,
  serializeServerEvent,
  type RevealedProblem,
  type ServerEvent,
} from '@/lib/match-events';
import type { Authenticator } from './auth';
import { BattleRoom, type RoomConfig, type RoomDeps, type RoomOutcome } from './room';

const HELLO_TIMEOUT_MS = 10_000;
const MAX_INTERNAL_BODY_BYTES = 64 * 1024;

export type OnRoomEffects = (
  effects: BattleEffect[],
  battle: BattleSnapshot,
  outcome?: RoomOutcome,
) => void;

/** Everything needed to materialize a room for a battle id, or null. */
export type RoomSource = (battleId: string) => Promise<{
  config: RoomConfig;
  problem: RevealedProblem;
  onEffects?: OnRoomEffects;
} | null>;

/** Real clock + setTimeout-backed scheduler for production rooms. */
function realRoomDeps(onEffects: OnRoomEffects): RoomDeps {
  return {
    now: () => new Date(),
    schedule: (when, fn) => {
      const timer = setTimeout(fn, Math.max(0, when.getTime() - Date.now()));
      return () => clearTimeout(timer);
    },
    onEffects,
  };
}

/**
 * The live set of rooms. Battle slices never call this directly from the Next
 * process — they write the battles row and the lazy `roomSource` path here
 * materializes the room on first join.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, BattleRoom>();

  create(
    config: RoomConfig,
    problem: RevealedProblem,
    onEffects: OnRoomEffects = () => {},
  ): BattleRoom {
    const room = new BattleRoom(config, problem, realRoomDeps(onEffects));
    this.rooms.set(config.battleId, room);
    return room;
  }

  get(battleId: string): BattleRoom | undefined {
    return this.rooms.get(battleId);
  }
}

export interface RealtimeServer {
  port: number;
  registry: RoomRegistry;
  close(): Promise<void>;
}

export interface RealtimeServerOptions {
  /** Pass 0 to let the OS pick a free port (integration tests do). */
  port: number;
  authenticator: Authenticator;
  registry?: RoomRegistry;
  /** Lazy room materialization for unknown battle ids (M15: from the DB). */
  roomSource?: RoomSource;
  log?: (line: string) => void;
}

export function startRealtimeServer(options: RealtimeServerOptions): Promise<RealtimeServer> {
  const registry = options.registry ?? new RoomRegistry();
  const log = options.log ?? (() => {});

  /* ------------------------------------------------ lazy room resolution */
  // One in-flight load per battleId: two players joining simultaneously must
  // get the SAME room, not two rooms racing for the registry slot.
  const loading = new Map<string, Promise<BattleRoom | null>>();
  function resolveRoom(battleId: string): Promise<BattleRoom | null> {
    const existing = registry.get(battleId);
    if (existing) return Promise.resolve(existing);
    const source = options.roomSource;
    if (!source) return Promise.resolve(null);

    let pending = loading.get(battleId);
    if (!pending) {
      pending = (async () => {
        try {
          const loaded = await source(battleId);
          if (!loaded) return null;
          return (
            registry.get(battleId) ??
            registry.create(loaded.config, loaded.problem, loaded.onEffects)
          );
        } finally {
          loading.delete(battleId);
        }
      })();
      loading.set(battleId, pending);
    }
    return pending;
  }

  /* --------------------------------------------------- internal HTTP edge */
  // Unauthenticated by default for the localhost dev topology; when
  // REALTIME_INTERNAL_SECRET is set (M18 prod), pokes must present it.
  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    const settled = /^\/internal\/battles\/([^/]+)\/settled$/.exec(url);
    if (req.method === 'POST' && settled?.[1]) {
      const secret = process.env.REALTIME_INTERNAL_SECRET;
      if (secret && req.headers['x-internal-secret'] !== secret) {
        res.writeHead(403);
        res.end();
        return;
      }
      const battleId = decodeURIComponent(settled[1]);
      const body = await readJsonBody(req);
      const rawWinner = (body as { winner?: unknown } | null)?.winner;
      const winner: PlayerSide | null = rawWinner === 'a' || rawWinner === 'b' ? rawWinner : null;

      const room = registry.get(battleId);
      // Telemetry is captured BEFORE the settle clears anything — this reply
      // is the only channel the signals have back to the authoritative row.
      const telemetry = room ? [...room.telemetryLog] : [];
      room?.settleFromAuthority(winner);
      log(`settled poke for ${battleId} (winner ${winner ?? 'none'})`);

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ telemetry }));
      return;
    }

    res.writeHead(404);
    res.end();
  }

  const httpServer: Server = createServer((req, res) => {
    handleHttp(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket: WebSocket) => {
    /** Per-socket transport state — who they are and where they are. */
    let userId: string | null = null;
    let room: BattleRoom | null = null;

    const send = (event: ServerEvent): void => {
      if (socket.readyState === socket.OPEN) socket.send(serializeServerEvent(event));
    };

    // An unauthenticated socket is a resource leak — drop it if no hello lands.
    const helloTimer = setTimeout(() => {
      if (userId === null) socket.close();
    }, HELLO_TIMEOUT_MS);

    socket.on('message', (raw: Buffer | string) => {
      const event = parseClientEvent(String(raw));
      if (!event) {
        send({ type: 'error', code: 'invalid-message' });
        return;
      }

      void (async () => {
        switch (event.type) {
          case 'hello': {
            if (userId !== null) {
              send({ type: 'error', code: 'already-authenticated' });
              return;
            }
            const identity = await options.authenticator.authenticate(event.token);
            if (!identity) {
              send({ type: 'error', code: 'auth-failed' });
              socket.close();
              return;
            }
            userId = identity.userId;
            clearTimeout(helloTimer);
            send({ type: 'hello-ok', userId });
            return;
          }
          case 'join': {
            if (userId === null) {
              send({ type: 'error', code: 'not-authenticated' });
              return;
            }
            const target = await resolveRoom(event.battleId);
            if (!target) {
              send({ type: 'error', code: 'unknown-battle' });
              return;
            }
            if (target.join({ userId, send })) room = target;
            return;
          }
          case 'ready':
          case 'quit':
          case 'progress':
          case 'telemetry': {
            if (userId === null) {
              send({ type: 'error', code: 'not-authenticated' });
              return;
            }
            if (!room) {
              send({ type: 'error', code: 'not-joined' });
              return;
            }
            if (event.type === 'ready') room.ready(userId);
            else if (event.type === 'quit') room.quit(userId);
            else if (event.type === 'progress') room.progress(userId, event.testsPassed);
            else room.recordTelemetry(userId, event.kind);
            return;
          }
        }
      })();
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (userId !== null && room) room.disconnect(userId);
    });
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, () => {
      const address = httpServer.address();
      const port = typeof address === 'object' && address !== null ? address.port : options.port;
      log(`realtime service listening on ws://localhost:${port}`);
      resolve({
        port,
        registry,
        close: () =>
          new Promise<void>((done, fail) => {
            for (const client of wss.clients) client.terminate();
            wss.close((wsErr) => {
              if (wsErr) {
                fail(wsErr);
                return;
              }
              httpServer.close((httpErr) => (httpErr ? fail(httpErr) : done()));
            });
          }),
      });
    });
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_INTERNAL_BODY_BYTES) return null;
    chunks.push(buf);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return null;
  }
}
