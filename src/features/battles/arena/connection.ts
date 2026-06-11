/**
 * The arena's connection seam. The Arena component talks to a battle through
 * this small interface, so the SAME component runs against the real realtime
 * service (`connectArenaSocket`, a browser WebSocket speaking the typed
 * contract) and against the in-browser mocked room (`mock-room.ts`) the M14
 * acceptance flow drives. M15 swaps nothing here — it only mints real tokens.
 */

import type { ArenaEvent } from './arena-state';
import { parseClientEvent, type ClientEvent, type ServerEvent } from '@/lib/match-events';

export interface ArenaDriver {
  send(event: ClientEvent): void;
  close(): void;
}

export interface ArenaSocketOptions {
  /** ws:// or wss:// endpoint of the realtime service. */
  url: string;
  /** Auth token for the hello handshake (dev token or session token). */
  token: string;
  battleId: string;
  onEvent(event: ArenaEvent): void;
}

/**
 * Server frames come from OUR typed service, so a structural sniff is enough —
 * the strict-parse direction is client→server (see `parseClientEvent`).
 */
function parseServerFrame(raw: string): ServerEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { type?: unknown }).type === 'string'
    ) {
      return value as ServerEvent;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Connect, run the hello→join handshake, surface every server event. */
export function connectArenaSocket(options: ArenaSocketOptions): ArenaDriver {
  const socket = new WebSocket(options.url);
  let closedByUs = false;

  const send = (event: ClientEvent): void => {
    // Round-trip through the strict parser: the client must never emit a frame
    // the server side of the contract would reject.
    if (socket.readyState === WebSocket.OPEN && parseClientEvent(JSON.stringify(event))) {
      socket.send(JSON.stringify(event));
    }
  };

  socket.addEventListener('open', () => {
    send({ type: 'hello', token: options.token });
  });

  socket.addEventListener('message', (msg: MessageEvent) => {
    const event = parseServerFrame(String(msg.data));
    if (!event) return;
    // The handshake is connection plumbing, handled here; everything else
    // (including hello-ok, which the reducer ignores) flows to the arena.
    if (event.type === 'hello-ok') send({ type: 'join', battleId: options.battleId });
    options.onEvent(event);
  });

  socket.addEventListener('close', () => {
    if (!closedByUs) options.onEvent({ type: 'connection-lost' });
  });

  return {
    send,
    close: () => {
      closedByUs = true;
      socket.close();
    },
  };
}
