/**
 * The typed match-event contract (CLAUDE.md → `lib/`: "shared utils, types,
 * match-event contract") — the single wire vocabulary shared by the realtime
 * service (`src/realtime/`) and every client of it (the M14 arena, the
 * integration tests). Both sides import THESE types, so the service and the
 * browser can't drift apart silently.
 *
 * Two trust levels, deliberately asymmetric:
 *   - client → server frames are UNTRUSTED wire input. `parseClientEvent` is
 *     the only way in: strict structural validation, null on anything off.
 *   - server → client frames are produced by our own typed code, so
 *     `serializeServerEvent` is just a typed JSON.stringify.
 *
 * The contract reuses the kernel's unions (`BattleStatus`, `PlayerSide`,
 * `ProblemTier`) — typed end to end, the same rule as the DB schema.
 */

import type { BattleStatus, ForfeitReason, PlayerSide, ProblemTier } from '@/domain/battles';

/** What the opponent-facing reveal carries — no reference solution, no tests. */
export interface RevealedProblem {
  id: string;
  slug: string;
  title: string;
  statementMd: string;
  tier: ProblemTier;
  timeLimitSeconds: number;
}

/* ---------------------------------- client → server ---------------------- */

export type ClientEvent =
  | { type: 'hello'; token: string }
  | { type: 'join'; battleId: string }
  | { type: 'ready' }
  | { type: 'quit' }
  | { type: 'progress'; testsPassed: number };

/* ---------------------------------- server → client ---------------------- */

/** Who is currently connected / ready, per seat. */
export interface SideFlags {
  a: boolean;
  b: boolean;
}

/**
 * The full resync snapshot, sent on every (re)join. `problem` is null until
 * the battle is live — holding the statement back until the synchronized
 * reveal is a transport duty, and the resync path must honor it too.
 */
export interface RoomStateEvent {
  type: 'room-state';
  battleId: string;
  side: PlayerSide;
  status: BattleStatus;
  presence: SideFlags;
  ready: SideFlags;
  /** ISO instant of the synchronized go; null before the countdown starts. */
  goAt: string | null;
  /** ISO instant the live window ends; null before the countdown starts. */
  endsAt: string | null;
  /** Revealed only once live — null in every earlier phase. */
  problem: RevealedProblem | null;
}

export type MatchErrorCode =
  | 'not-authenticated'
  | 'already-authenticated'
  | 'auth-failed'
  | 'invalid-message'
  | 'unknown-battle'
  | 'not-a-player'
  | 'not-joined'
  | 'not-matched'
  | 'ready-window-closed'
  | 'not-live';

export type ServerEvent =
  | { type: 'hello-ok'; userId: string }
  | RoomStateEvent
  | { type: 'presence'; presence: SideFlags }
  | { type: 'ready-state'; ready: SideFlags }
  | { type: 'countdown'; goAt: string }
  | { type: 'go'; problem: RevealedProblem; endsAt: string }
  | { type: 'timer'; remainingSeconds: number }
  | { type: 'opponent-progress'; testsPassed: number }
  | {
      type: 'battle-status';
      status: BattleStatus;
      winner: PlayerSide | null;
      reason: ForfeitReason | null;
    }
  | { type: 'error'; code: MatchErrorCode };

/* ---------------------------------- wire parsing ------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Parse one raw WS frame into a typed client event, or null. Strict on shape
 * (a frame the contract doesn't know is dropped, never guessed at), tolerant
 * of unknown EXTRA fields (a newer client must not break an older server) —
 * accepted events are rebuilt field by field so extras never travel further.
 */
export function parseClientEvent(raw: string): ClientEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case 'hello':
      return nonEmptyString(value.token) ? { type: 'hello', token: value.token } : null;
    case 'join':
      return nonEmptyString(value.battleId) ? { type: 'join', battleId: value.battleId } : null;
    case 'ready':
      return { type: 'ready' };
    case 'quit':
      return { type: 'quit' };
    case 'progress': {
      const n = value.testsPassed;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
      return { type: 'progress', testsPassed: n };
    }
    default:
      return null;
  }
}

export function serializeServerEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}
