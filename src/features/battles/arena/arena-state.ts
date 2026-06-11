/**
 * The arena's client-side state machine — a PURE fold of typed server events
 * (`ServerEvent` from the match contract) into the state the UI renders.
 * It is the client mirror of the room: the room owns the authoritative
 * battle, this reducer only tracks "what has the server told me so far".
 * Keeping it pure means every phase transition the arena can display is
 * unit-tested without a browser, a socket, or React.
 *
 * Trust posture: events arrive from OUR server over the typed contract, so the
 * reducer adopts them without re-validation (the server already validated the
 * other direction). It never decides anything authoritative — a settled result
 * is whatever `battle-status` said, relative to whichever side we sit on.
 */

import type { BattleStatus, ForfeitReason, PlayerSide } from '@/domain/battles';
import type { MatchErrorCode, RevealedProblem, ServerEvent, SideFlags } from '@/lib/match-events';

/** What the arena is showing right now. */
export type ArenaPhase = 'connecting' | 'lobby' | 'countdown' | 'live' | 'settled';

/** The raw settled outcome as announced — interpretation is `describeResult`. */
export interface ArenaResult {
  status: BattleStatus;
  winner: PlayerSide | null;
  reason: ForfeitReason | null;
}

export interface ArenaState {
  phase: ArenaPhase;
  /** Which seat I sit in — known from the first room-state resync. */
  side: PlayerSide | null;
  presence: SideFlags;
  ready: SideFlags;
  /** ISO instant of the synchronized go; null before the countdown. */
  goAt: string | null;
  /** ISO instant the live window ends; null before live. */
  endsAt: string | null;
  /** Revealed at the go (or a live resync) — never earlier. */
  problem: RevealedProblem | null;
  /** Server-authoritative remaining seconds from `timer` resyncs. */
  remainingSeconds: number | null;
  opponentTestsPassed: number;
  result: ArenaResult | null;
  /** Last error frame, surfaced as a banner; cleared by the next resync. */
  error: MatchErrorCode | null;
  /** The socket dropped — shown as a reconnect notice, match state retained. */
  connectionLost: boolean;
}

/** The reducer also folds one client-local fact the server can't send us. */
export type ArenaEvent = ServerEvent | { type: 'connection-lost' };

export function initialArenaState(): ArenaState {
  return {
    phase: 'connecting',
    side: null,
    presence: { a: false, b: false },
    ready: { a: false, b: false },
    goAt: null,
    endsAt: null,
    problem: null,
    remainingSeconds: null,
    opponentTestsPassed: 0,
    result: null,
    error: null,
    connectionLost: false,
  };
}

const SETTLED_STATUSES: readonly BattleStatus[] = ['resolved', 'forfeited', 'voided', 'flagged'];

function phaseForStatus(status: BattleStatus): ArenaPhase {
  if (SETTLED_STATUSES.includes(status)) return 'settled';
  if (status === 'live') return 'live';
  if (status === 'countdown') return 'countdown';
  return 'lobby'; // challenged / queued / matched — the ready-up screen
}

export function reduceArena(state: ArenaState, event: ArenaEvent): ArenaState {
  switch (event.type) {
    case 'hello-ok':
      return state; // authenticated, but the lobby waits for the room-state resync
    case 'room-state': {
      const phase = phaseForStatus(event.status);
      return {
        ...state,
        phase,
        side: event.side,
        presence: event.presence,
        ready: event.ready,
        goAt: event.goAt,
        endsAt: event.endsAt,
        problem: event.problem,
        // A status-only resync of a settled battle carries no winner/reason.
        result: phase === 'settled' ? { status: event.status, winner: null, reason: null } : null,
        error: null,
        connectionLost: false,
      };
    }
    case 'presence':
      return { ...state, presence: event.presence };
    case 'ready-state':
      return { ...state, ready: event.ready };
    case 'countdown':
      return { ...state, phase: 'countdown', goAt: event.goAt };
    case 'go':
      return { ...state, phase: 'live', problem: event.problem, endsAt: event.endsAt };
    case 'timer':
      return { ...state, remainingSeconds: event.remainingSeconds };
    case 'opponent-progress':
      return { ...state, opponentTestsPassed: event.testsPassed };
    case 'battle-status':
      return {
        ...state,
        phase: 'settled',
        result: { status: event.status, winner: event.winner, reason: event.reason },
      };
    case 'error':
      return { ...state, error: event.code };
    case 'connection-lost':
      return { ...state, connectionLost: true };
  }
}

/* ----------------------------------------------------------- result display */

export interface ResultDescription {
  tone: 'won' | 'lost' | 'draw' | 'void';
  headline: string;
  detail: string | null;
}

/** Interpret the settled result relative to MY side; null until settled. */
export function describeResult(state: ArenaState): ResultDescription | null {
  if (state.phase !== 'settled' || !state.result) return null;
  const { status, winner, reason } = state.result;

  if (status === 'voided') {
    return {
      tone: 'void',
      headline: 'Match voided',
      detail: 'Nothing was revealed — no rating change.',
    };
  }
  const reasonText =
    reason === 'quit'
      ? 'Opponent quit.'
      : reason === 'disconnect-grace-expired'
        ? 'Disconnect grace expired.'
        : null;
  if (winner !== null && state.side !== null) {
    if (winner === state.side) {
      return {
        tone: 'won',
        headline: status === 'forfeited' ? 'Victory by forfeit' : 'Victory',
        detail: reasonText,
      };
    }
    return {
      tone: 'lost',
      headline: status === 'forfeited' ? 'Forfeited' : 'Defeat',
      detail: reason === 'quit' ? 'You quit the match.' : reasonText,
    };
  }
  return {
    tone: 'draw',
    headline: "Time's up",
    detail: 'No decisive solve — final scoring decides the result.',
  };
}

/* ----------------------------------------------------------------- the clock */

/** mm:ss, zero-padded; negatives clamp to 00:00 (a late tick must not render -0:01). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
