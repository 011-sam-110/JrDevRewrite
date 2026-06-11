/**
 * The WebSocket edge of the realtime service: socket lifecycle, the auth
 * handshake, and routing parsed frames into rooms. NO battle rules live here —
 * the per-connection state machine below is purely transport ("are you
 * authenticated? are you in a room?"); everything battle-shaped is the room's
 * (and through it the kernel's) decision.
 *
 * Handshake protocol: a fresh socket must `hello {token}` within
 * HELLO_TIMEOUT_MS or be dropped; after `hello-ok` it may `join {battleId}`;
 * only then do ready/quit/progress mean anything.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { BattleEffect, BattleSnapshot } from '@/domain/battles';
import {
  parseClientEvent,
  serializeServerEvent,
  type RevealedProblem,
  type ServerEvent,
} from '@/lib/match-events';
import type { Authenticator } from './auth';
import { BattleRoom, type RoomConfig, type RoomDeps } from './room';

const HELLO_TIMEOUT_MS = 10_000;

/** Real clock + setTimeout-backed scheduler for production rooms. */
function realRoomDeps(
  onEffects: (effects: BattleEffect[], battle: BattleSnapshot) => void,
): RoomDeps {
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
 * The live set of rooms. M13's callers are the dev harness and tests; in M15
 * the battle slices create a room here at the `matched` transition and execute
 * the kernel effects the room forwards (record-result, apply-ratings).
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, BattleRoom>();

  create(
    config: RoomConfig,
    problem: RevealedProblem,
    onEffects: (effects: BattleEffect[], battle: BattleSnapshot) => void = () => {},
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
  log?: (line: string) => void;
}

export function startRealtimeServer(options: RealtimeServerOptions): Promise<RealtimeServer> {
  const registry = options.registry ?? new RoomRegistry();
  const log = options.log ?? (() => {});
  const wss = new WebSocketServer({ port: options.port });

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
            const target = registry.get(event.battleId);
            if (!target) {
              send({ type: 'error', code: 'unknown-battle' });
              return;
            }
            if (target.join({ userId, send })) room = target;
            return;
          }
          case 'ready':
          case 'quit':
          case 'progress': {
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
            else room.progress(userId, event.testsPassed);
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
    wss.once('error', reject);
    wss.on('listening', () => {
      const address = wss.address();
      const port = typeof address === 'object' && address !== null ? address.port : options.port;
      log(`realtime service listening on ws://localhost:${port}`);
      resolve({
        port,
        registry,
        close: () =>
          new Promise<void>((done, fail) => {
            for (const client of wss.clients) client.terminate();
            wss.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
