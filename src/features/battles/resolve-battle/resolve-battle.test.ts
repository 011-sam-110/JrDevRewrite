import { describe, expect, it, vi } from 'vitest';
import type { BattleSubmission } from '@/domain/battles';
import {
  settleBattle,
  type ResolveBattleDeps,
  type SettleLoad,
  type SettlementPlan,
} from './resolve-battle';

/**
 * The settlement engine — every way a battle concludes (decisive, timeout,
 * forfeit, void) funnels through `settleBattle`, which derives the outcome
 * from the SCORING KERNEL over the persisted submission history and hands one
 * settlement plan to the deps transaction. The slice decides; the deps only
 * persist. Idempotency lives in the deps' conditional status claim — a second
 * settle of the same battle reports `already-settled` and changes nothing.
 */

const PLAYERS = { a: 'user-a', b: 'user-b' };

function load(overrides: Partial<SettleLoad> = {}): SettleLoad {
  return {
    status: 'live',
    players: PLAYERS,
    timeLimitSeconds: 1800,
    submissions: [],
    ...overrides,
  };
}

function sub(
  player: 'a' | 'b',
  atSeconds: number,
  passedAll: boolean,
  testsPassed: number,
): BattleSubmission {
  return { player, atSeconds, passedAll, testsPassed };
}

function makeDeps(overrides: Partial<ResolveBattleDeps> = {}): ResolveBattleDeps {
  return {
    loadBattle: vi.fn(async () => load()),
    persistSettlement: vi.fn(async () => 'settled' as const),
    ...overrides,
  };
}

function planOf(deps: ResolveBattleDeps): SettlementPlan {
  const mock = vi.mocked(deps.persistSettlement);
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0]![1];
}

describe('settleBattle — decisive', () => {
  it('the scoring kernel names the winner from the submission history', async () => {
    const deps = makeDeps({
      loadBattle: vi.fn(async () =>
        load({ submissions: [sub('a', 100, false, 2), sub('b', 300, true, 5)] }),
      ),
    });
    const result = await settleBattle(deps, 'battle-1', { kind: 'decisive' }, []);

    expect(result).toEqual({ settled: true, status: 'resolved', winnerSide: 'b' });
    const plan = planOf(deps);
    expect(plan.status).toBe('resolved');
    expect(plan.winnerSide).toBe('b');
    expect(plan.outcome).toBe('decisive');
    expect(plan.forfeitReason).toBeNull();
    expect(plan.awards).toEqual([
      { side: 'a', userId: 'user-a', result: 'loss', streakOutcome: 'completed' },
      { side: 'b', userId: 'user-b', result: 'win', streakOutcome: 'completed' },
    ]);
  });

  it('an earlier full solve beats a later one even with more penalties', async () => {
    const deps = makeDeps({
      loadBattle: vi.fn(async () =>
        load({
          submissions: [
            sub('a', 50, false, 1),
            sub('a', 120, false, 1),
            sub('a', 200, true, 5),
            sub('b', 400, true, 5),
          ],
        }),
      ),
    });
    const result = await settleBattle(deps, 'battle-1', { kind: 'decisive' }, []);
    expect(result).toEqual({ settled: true, status: 'resolved', winnerSide: 'a' });
  });
});

describe('settleBattle — timeout', () => {
  it('most hidden tests passed wins at the deadline', async () => {
    const deps = makeDeps({
      loadBattle: vi.fn(async () =>
        load({ submissions: [sub('a', 100, false, 3), sub('b', 200, false, 1)] }),
      ),
    });
    const result = await settleBattle(deps, 'battle-1', { kind: 'timeout' }, []);

    expect(result).toEqual({ settled: true, status: 'resolved', winnerSide: 'a' });
    const plan = planOf(deps);
    expect(plan.outcome).toBe('timeout');
    expect(plan.awards).toEqual([
      { side: 'a', userId: 'user-a', result: 'win', streakOutcome: 'completed' },
      { side: 'b', userId: 'user-b', result: 'loss', streakOutcome: 'completed' },
    ]);
  });

  it('a dead-even timeout is a draw — no winner, both draw awards', async () => {
    const deps = makeDeps({ loadBattle: vi.fn(async () => load({ submissions: [] })) });
    const result = await settleBattle(deps, 'battle-1', { kind: 'timeout' }, []);

    expect(result).toEqual({ settled: true, status: 'resolved', winnerSide: null });
    const plan = planOf(deps);
    expect(plan.outcome).toBe('draw');
    expect(plan.winnerSide).toBeNull();
    expect(plan.awards).toEqual([
      { side: 'a', userId: 'user-a', result: 'draw', streakOutcome: 'completed' },
      { side: 'b', userId: 'user-b', result: 'draw', streakOutcome: 'completed' },
    ]);
  });
});

describe('settleBattle — forfeit', () => {
  it('the opponent wins; the forfeiter earns nothing and loses their streak', async () => {
    const deps = makeDeps();
    const result = await settleBattle(
      deps,
      'battle-1',
      { kind: 'forfeit', loser: 'a', reason: 'quit' },
      [],
    );

    expect(result).toEqual({ settled: true, status: 'forfeited', winnerSide: 'b' });
    const plan = planOf(deps);
    expect(plan.status).toBe('forfeited');
    expect(plan.outcome).toBeNull();
    expect(plan.forfeitReason).toBe('quit');
    expect(plan.awards).toEqual([
      { side: 'a', userId: 'user-a', result: 'forfeited', streakOutcome: 'forfeited' },
      { side: 'b', userId: 'user-b', result: 'win', streakOutcome: 'completed' },
    ]);
  });

  it('records the disconnect-grace reason for stats/review', async () => {
    const deps = makeDeps();
    await settleBattle(
      deps,
      'battle-1',
      { kind: 'forfeit', loser: 'b', reason: 'disconnect-grace-expired' },
      [],
    );
    const plan = planOf(deps);
    expect(plan.forfeitReason).toBe('disconnect-grace-expired');
    expect(plan.winnerSide).toBe('a');
  });
});

describe('settleBattle — void', () => {
  it('voids with NO awards — nothing happened, nothing is rated (binding)', async () => {
    const deps = makeDeps();
    const result = await settleBattle(deps, 'battle-1', { kind: 'void' }, []);

    expect(result).toEqual({ settled: true, status: 'voided', winnerSide: null });
    const plan = planOf(deps);
    expect(plan.status).toBe('voided');
    expect(plan.winnerSide).toBeNull();
    expect(plan.outcome).toBeNull();
    expect(plan.awards).toBeNull();
  });
});

describe('settleBattle — telemetry & idempotency', () => {
  it('persists the room-captured telemetry log with the result', async () => {
    const deps = makeDeps();
    const telemetry = [
      { side: 'a' as const, kind: 'paste-blocked' as const, atSeconds: 42 },
      { side: 'a' as const, kind: 'focus-lost' as const, atSeconds: 60 },
    ];
    await settleBattle(deps, 'battle-1', { kind: 'decisive' }, telemetry);
    expect(planOf(deps).telemetry).toEqual(telemetry);
  });

  it('a second settle is a no-op: the deps claim reports already-settled', async () => {
    const deps = makeDeps({
      persistSettlement: vi.fn(async () => 'already-settled' as const),
    });
    const result = await settleBattle(deps, 'battle-1', { kind: 'timeout' }, []);
    expect(result).toEqual({ settled: false, reason: 'already-settled' });
  });

  it('an unknown battle settles nothing', async () => {
    const deps = makeDeps({ loadBattle: vi.fn(async () => null) });
    const result = await settleBattle(deps, 'missing', { kind: 'void' }, []);
    expect(result).toEqual({ settled: false, reason: 'not-found' });
    expect(deps.persistSettlement).not.toHaveBeenCalled();
  });
});
