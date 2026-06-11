/**
 * The mocked room the M14 acceptance flow runs against — and it is barely a
 * mock: it instantiates the REAL `BattleRoom` (and through it the real M11
 * kernel) in the browser, with the real wall clock. The countdown, the
 * synchronized go, the timer syncs, void-on-quit — all genuine transport +
 * kernel behaviour. What's simulated is only what M15 will add:
 *
 *   - the opponent (a phantom second connection, driven by the dev controls),
 *   - the judge path (a scripted submit fn standing in for the
 *     submit-solution slice: cooldown-checked, verdict back, and on a full
 *     pass the fabricated `battle-status resolved` the real slice will
 *     broadcast after `resolveDecisive`).
 *
 * Dev/e2e only — the page gates it out of production.
 */

import { matchBattle } from '@/domain/battles';
import type { ClientEvent, RevealedProblem, ServerEvent } from '@/lib/match-events';
import { BattleRoom } from '@/realtime/room';
import type { ArenaEvent } from './arena-state';
import type { ArenaDriver } from './connection';
import type { SubmissionOutcome, SubmitSolution } from './types';

/** Short enough for an e2e run, long enough to watch the button count down. */
export const MOCK_COOLDOWN_SECONDS = 3;
const MOCK_TESTS_TOTAL = 5;

export const MOCK_PROBLEM: RevealedProblem = {
  id: 'mock-problem',
  slug: 'sum-two-integers',
  title: 'Sum of Two Integers',
  statementMd:
    'Read two space-separated integers `a` and `b` from standard input. Print their sum.\n\n' +
    'Example: input `3 4` → output `7`.\n\n' +
    'Constraints: -10^9 <= a, b <= 10^9.',
  tier: 'easy',
  timeLimitSeconds: 600,
};

/** What the dev-controls strip can make the phantom opponent do. */
export interface MockOpponentControls {
  join(): void;
  ready(): void;
  progress(testsPassed: number): void;
  quit(): void;
}

export interface MockArena {
  driver: ArenaDriver;
  submit: SubmitSolution;
  opponent: MockOpponentControls;
  cooldownSeconds: number;
}

export function createMockArena(onEvent: (event: ArenaEvent) => void): MockArena {
  const matched = matchBattle(
    {
      status: 'challenged',
      readyDeadline: null,
      readyA: false,
      readyB: false,
      goAt: null,
      timeLimitSeconds: MOCK_PROBLEM.timeLimitSeconds,
    },
    new Date(),
  );
  if (!matched.ok) throw new Error('unreachable: a fresh challenge always matches');

  // Once the fabricated resolution lands, the still-live room's later frames
  // (timer syncs) must not resurrect the UI — the gate below silences it.
  let settledByMock = false;
  const forward = (event: ServerEvent): void => {
    if (!settledByMock) onEvent(event);
  };

  const room = new BattleRoom(
    { battleId: 'mock', players: { a: 'me', b: 'rival' }, battle: matched.battle },
    MOCK_PROBLEM,
    {
      now: () => new Date(),
      schedule: (when, fn) => {
        const timer = setTimeout(fn, Math.max(0, when.getTime() - Date.now()));
        return () => clearTimeout(timer);
      },
      onEffects: () => {}, // M15's slices execute these; the mock just drops them
    },
  );

  room.join({ userId: 'me', send: forward });

  const driver: ArenaDriver = {
    send: (event: ClientEvent) => {
      if (event.type === 'ready') room.ready('me');
      else if (event.type === 'quit') room.quit('me');
      else if (event.type === 'progress') room.progress('me', event.testsPassed);
      else if (event.type === 'telemetry') room.recordTelemetry('me', event.kind);
      // hello/join are socket-handshake frames — already joined here.
    },
    close: () => {
      settledByMock = true; // stop forwarding; pending room timers fire into the void
    },
  };

  // The phantom opponent: a real second connection whose inbox is discarded.
  const opponent: MockOpponentControls = {
    join: () => {
      room.join({ userId: 'rival', send: () => {} });
    },
    ready: () => {
      room.ready('rival');
    },
    progress: (testsPassed) => {
      room.progress('rival', testsPassed);
    },
    quit: () => {
      room.quit('rival');
    },
  };

  // The scripted judge: first attempt fails part-way, the next passes — enough
  // to demo the rejected→cooldown→accepted arc. A full pass fabricates the
  // decisive resolution the M15 slice will produce from the Judge0 verdict.
  let attempts = 0;
  const submit: SubmitSolution = async () => {
    attempts += 1;
    // Simulate judge latency so the "Judging…" state is visible.
    await new Promise((r) => setTimeout(r, 700));
    const outcome: SubmissionOutcome =
      attempts === 1
        ? { status: 'rejected', testsPassed: 2, testsTotal: MOCK_TESTS_TOTAL }
        : { status: 'accepted', testsPassed: MOCK_TESTS_TOTAL, testsTotal: MOCK_TESTS_TOTAL };
    if (outcome.status === 'accepted') {
      setTimeout(() => {
        onEvent({ type: 'battle-status', status: 'resolved', winner: 'a', reason: null });
        settledByMock = true;
      }, 400);
    }
    return outcome;
  };

  return { driver, submit, opponent, cooldownSeconds: MOCK_COOLDOWN_SECONDS };
}
