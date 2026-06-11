import { describe, expect, it, vi } from 'vitest';
import { READY_WINDOW_SECONDS, type QueueTicket } from '@/domain/battles';
import { matchQueue, type MatchQueueDeps } from './match-queue';

/**
 * match-queue — the pairing tick the realtime service runs (CLAUDE.md:
 * matchmaking lives in the realtime service, not cron). It only ORCHESTRATES:
 * the pure `pairQueue` kernel decides who pairs; `matchBattle` stamps the
 * ready window; the deps transaction atomically claims both queue rows and
 * creates the matched battle, so a player who left mid-tick simply drops the
 * pair instead of being matched into a battle they never asked for.
 */

const NOW = new Date('2026-07-01T12:00:00Z');

function ticket(userId: string, elo: number, waitSeconds: number): QueueTicket {
  return { userId, elo, enqueuedAt: new Date(NOW.getTime() - waitSeconds * 1000) };
}

function makeDeps(overrides: Partial<MatchQueueDeps> = {}): MatchQueueDeps {
  return {
    loadQueue: vi.fn(async () => [ticket('alice', 1200, 10), ticket('bob', 1210, 5)]),
    pickProblem: vi.fn(async () => ({ problemId: 'prob-1' })),
    createMatchedBattle: vi.fn(async () => 'ok' as const),
    now: () => NOW,
    ...overrides,
  };
}

describe('matchQueue', () => {
  it('pairs close-Elo waiters into a matched battle with the kernel ready window', async () => {
    const deps = makeDeps();
    const result = await matchQueue(deps);

    expect(result).toEqual({ created: 1 });
    expect(deps.createMatchedBattle).toHaveBeenCalledWith({
      playerAId: 'alice', // longer waiter takes seat a
      playerBId: 'bob',
      problemId: 'prob-1',
      readyDeadline: new Date(NOW.getTime() + READY_WINDOW_SECONDS * 1000),
      matchedAt: NOW,
    });
  });

  it('an unpaired waiter stays in the queue untouched', async () => {
    const deps = makeDeps({
      loadQueue: vi.fn(async () => [ticket('solo', 1200, 10)]),
    });
    const result = await matchQueue(deps);
    expect(result).toEqual({ created: 0 });
    expect(deps.createMatchedBattle).not.toHaveBeenCalled();
  });

  it('a conflict (someone left mid-tick) drops that pair without counting it', async () => {
    const deps = makeDeps({ createMatchedBattle: vi.fn(async () => 'conflict' as const) });
    const result = await matchQueue(deps);
    expect(result).toEqual({ created: 0 });
  });

  it('an empty problem bank pauses pairing entirely — nobody is consumed', async () => {
    const deps = makeDeps({ pickProblem: vi.fn(async () => null) });
    const result = await matchQueue(deps);
    expect(result).toEqual({ created: 0 });
    expect(deps.createMatchedBattle).not.toHaveBeenCalled();
  });

  it('pairs multiple pairs in one tick, drawing a fresh problem per battle', async () => {
    const deps = makeDeps({
      loadQueue: vi.fn(async () => [
        ticket('a', 1200, 40),
        ticket('b', 1190, 30),
        ticket('c', 1500, 20),
        ticket('d', 1510, 10),
      ]),
      pickProblem: vi
        .fn()
        .mockResolvedValueOnce({ problemId: 'prob-1' })
        .mockResolvedValueOnce({ problemId: 'prob-2' }),
    });
    const result = await matchQueue(deps);
    expect(result).toEqual({ created: 2 });
    expect(deps.pickProblem).toHaveBeenCalledTimes(2);
  });
});
