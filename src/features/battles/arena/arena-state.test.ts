import { describe, expect, it } from 'vitest';
import type { RevealedProblem, ServerEvent } from '@/lib/match-events';
import {
  describeResult,
  formatClock,
  initialArenaState,
  reduceArena,
  type ArenaEvent,
  type ArenaState,
} from './arena-state';

/* ------------------------------------------------------------------ harness */

const PROBLEM: RevealedProblem = {
  id: 'p1',
  slug: 'sum-two-integers',
  title: 'Sum of Two Integers',
  statementMd: 'Read two integers and print their sum.',
  tier: 'easy',
  timeLimitSeconds: 120,
};

const ROOM_STATE: ServerEvent = {
  type: 'room-state',
  battleId: 'b1',
  side: 'a',
  status: 'matched',
  presence: { a: true, b: false },
  ready: { a: false, b: false },
  goAt: null,
  endsAt: null,
  problem: null,
};

function fold(events: ArenaEvent[], from: ArenaState = initialArenaState()): ArenaState {
  return events.reduce(reduceArena, from);
}

/* ------------------------------------------------------------------- phases */

describe('reduceArena — phase progression', () => {
  it('starts connecting: no phase change until the room-state resync lands', () => {
    const s0 = initialArenaState();
    expect(s0.phase).toBe('connecting');
    expect(fold([{ type: 'hello-ok', userId: 'u1' }]).phase).toBe('connecting');
  });

  it('room-state lands the lobby: side, presence, ready all adopted', () => {
    const s = fold([ROOM_STATE]);
    expect(s.phase).toBe('lobby');
    expect(s.side).toBe('a');
    expect(s.presence).toEqual({ a: true, b: false });
    expect(s.ready).toEqual({ a: false, b: false });
    expect(s.problem).toBeNull();
  });

  it('presence and ready-state broadcasts update their flags only', () => {
    const s = fold([
      ROOM_STATE,
      { type: 'presence', presence: { a: true, b: true } },
      { type: 'ready-state', ready: { a: true, b: false } },
    ]);
    expect(s.phase).toBe('lobby');
    expect(s.presence).toEqual({ a: true, b: true });
    expect(s.ready).toEqual({ a: true, b: false });
  });

  it('countdown enters the countdown phase carrying goAt', () => {
    const s = fold([ROOM_STATE, { type: 'countdown', goAt: '2026-06-11T12:00:05.000Z' }]);
    expect(s.phase).toBe('countdown');
    expect(s.goAt).toBe('2026-06-11T12:00:05.000Z');
    expect(s.problem).toBeNull(); // nothing revealed yet
  });

  it('go reveals the problem and goes live with endsAt', () => {
    const s = fold([
      ROOM_STATE,
      { type: 'countdown', goAt: '2026-06-11T12:00:05.000Z' },
      { type: 'go', problem: PROBLEM, endsAt: '2026-06-11T12:02:05.000Z' },
    ]);
    expect(s.phase).toBe('live');
    expect(s.problem).toEqual(PROBLEM);
    expect(s.endsAt).toBe('2026-06-11T12:02:05.000Z');
  });

  it('battle-status settles the arena with the raw result', () => {
    const s = fold([
      ROOM_STATE,
      { type: 'battle-status', status: 'forfeited', winner: 'a', reason: 'quit' },
    ]);
    expect(s.phase).toBe('settled');
    expect(s.result).toEqual({ status: 'forfeited', winner: 'a', reason: 'quit' });
  });
});

/* ------------------------------------------------------------ resync semantics */

describe('reduceArena — reconnect resync', () => {
  it('a live room-state resync restores the problem (reconnect recovery)', () => {
    const s = fold([
      {
        ...ROOM_STATE,
        status: 'live',
        goAt: '2026-06-11T12:00:05.000Z',
        endsAt: '2026-06-11T12:02:05.000Z',
        problem: PROBLEM,
      } as ServerEvent,
    ]);
    expect(s.phase).toBe('live');
    expect(s.problem).toEqual(PROBLEM);
    expect(s.endsAt).toBe('2026-06-11T12:02:05.000Z');
  });

  it('a countdown resync carries goAt but never the problem', () => {
    const s = fold([
      { ...ROOM_STATE, status: 'countdown', goAt: '2026-06-11T12:00:05.000Z' } as ServerEvent,
    ]);
    expect(s.phase).toBe('countdown');
    expect(s.goAt).toBe('2026-06-11T12:00:05.000Z');
    expect(s.problem).toBeNull();
  });

  it('a settled-status resync lands directly in settled', () => {
    const s = fold([{ ...ROOM_STATE, status: 'voided' } as ServerEvent]);
    expect(s.phase).toBe('settled');
    // The resync carries no winner/reason — the result is status-only.
    expect(s.result).toEqual({ status: 'voided', winner: null, reason: null });
  });

  it('a resync clears a stale connection-lost flag', () => {
    const lost = fold([ROOM_STATE, { type: 'connection-lost' }]);
    expect(lost.connectionLost).toBe(true);
    const back = fold([ROOM_STATE], lost);
    expect(back.connectionLost).toBe(false);
  });
});

/* ----------------------------------------------------------- live-data events */

describe('reduceArena — live data', () => {
  const live = fold([
    ROOM_STATE,
    { type: 'countdown', goAt: '2026-06-11T12:00:05.000Z' },
    { type: 'go', problem: PROBLEM, endsAt: '2026-06-11T12:02:05.000Z' },
  ]);

  it('timer resyncs overwrite the server-authoritative remaining seconds', () => {
    const s = fold([{ type: 'timer', remainingSeconds: 73 }], live);
    expect(s.remainingSeconds).toBe(73);
  });

  it('opponent-progress updates the opponent tests-passed count', () => {
    const s = fold([{ type: 'opponent-progress', testsPassed: 3 }], live);
    expect(s.opponentTestsPassed).toBe(3);
  });

  it('errors are surfaced without derailing the phase', () => {
    const s = fold([{ type: 'error', code: 'not-live' }], live);
    expect(s.phase).toBe('live');
    expect(s.error).toBe('not-live');
  });

  it('connection-lost marks the link down without forgetting the match', () => {
    const s = fold([{ type: 'connection-lost' }], live);
    expect(s.connectionLost).toBe(true);
    expect(s.phase).toBe('live');
    expect(s.problem).toEqual(PROBLEM);
  });
});

/* ------------------------------------------------------------- describeResult */

describe('describeResult — the settled outcome relative to MY side', () => {
  const settledAs = (
    status: 'resolved' | 'forfeited' | 'voided' | 'flagged',
    winner: 'a' | 'b' | null,
    reason: 'quit' | 'disconnect-grace-expired' | null = null,
  ): ArenaState => fold([ROOM_STATE, { type: 'battle-status', status, winner, reason }]); // side = a

  it('winner === my side reads as a win', () => {
    expect(describeResult(settledAs('resolved', 'a'))?.tone).toBe('won');
  });

  it('winner === opponent reads as a loss', () => {
    expect(describeResult(settledAs('resolved', 'b'))?.tone).toBe('lost');
  });

  it('a forfeit in my favour is a win with the reason named', () => {
    const d = describeResult(settledAs('forfeited', 'a', 'quit'));
    expect(d?.tone).toBe('won');
    expect(d?.detail).toMatch(/quit/i);
  });

  it('voided is neutral — nothing happened, nothing rated', () => {
    expect(describeResult(settledAs('voided', null))?.tone).toBe('void');
  });

  it('resolved with no winner is a draw/timeout, not a loss', () => {
    expect(describeResult(settledAs('resolved', null))?.tone).toBe('draw');
  });

  it('returns null when the arena has not settled', () => {
    expect(describeResult(fold([ROOM_STATE]))).toBeNull();
  });
});

/* ---------------------------------------------------------------- formatClock */

describe('formatClock', () => {
  it('formats mm:ss with zero-padding', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(5)).toBe('00:05');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(1800)).toBe('30:00');
  });

  it('clamps negatives to zero (a late tick must never render -0:01)', () => {
    expect(formatClock(-3)).toBe('00:00');
  });
});
