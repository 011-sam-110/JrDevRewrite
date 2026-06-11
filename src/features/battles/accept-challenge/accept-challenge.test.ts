import { describe, expect, it, vi } from 'vitest';
import { READY_WINDOW_SECONDS } from '@/domain/battles';
import {
  acceptChallenge,
  declineChallenge,
  type AcceptChallengeDeps,
  type DeclineChallengeDeps,
} from './accept-challenge';

/**
 * accept-challenge — the challengee's moves. Accepting runs the kernel's
 * `matchBattle` (challenged → matched, ready window stamped) and draws a
 * random problem from the APPROVED bank at this instant ("battle tier is a
 * content scale picked at match time"). Declining voids — nothing happened.
 * The busy guard keeps a player to one battle in motion at a time.
 */

const NOW = new Date('2026-07-01T12:00:00Z');

function makeDeps(overrides: Partial<AcceptChallengeDeps> = {}): AcceptChallengeDeps {
  return {
    loadChallenge: vi.fn(async () => ({
      status: 'challenged' as const,
      playerAId: 'challenger',
      playerBId: 'me',
      timeLimitSeconds: 1800,
    })),
    isBusy: vi.fn(async () => false),
    isBanned: vi.fn(async () => false),
    pickProblem: vi.fn(async () => ({ problemId: 'prob-1' })),
    activateBattle: vi.fn(async () => 'ok' as const),
    ...overrides,
  };
}

describe('acceptChallenge', () => {
  it('matches the battle: kernel ready window, problem drawn, conditional activation', async () => {
    const deps = makeDeps();
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);

    expect(result).toEqual({ ok: true, battleId: 'battle-1' });
    expect(deps.activateBattle).toHaveBeenCalledWith('battle-1', {
      problemId: 'prob-1',
      readyDeadline: new Date(NOW.getTime() + READY_WINDOW_SECONDS * 1000),
      matchedAt: NOW,
    });
  });

  it('only the challengee may accept', async () => {
    const deps = makeDeps();
    const result = await acceptChallenge(deps, 'challenger', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'not-yours' });
    expect(deps.activateBattle).not.toHaveBeenCalled();
  });

  it('a settled or already-matched challenge cannot be accepted again', async () => {
    const deps = makeDeps({
      loadChallenge: vi.fn(async () => ({
        status: 'matched' as const,
        playerAId: 'challenger',
        playerBId: 'me',
        timeLimitSeconds: 1800,
      })),
    });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'not-pending' });
  });

  it('a player already in a battle in motion cannot start another', async () => {
    const deps = makeDeps({ isBusy: vi.fn(async (id: string) => id === 'me') });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'player-busy' });
  });

  it('a busy CHALLENGER also blocks the match — both seats must be free', async () => {
    const deps = makeDeps({ isBusy: vi.fn(async (id: string) => id === 'challenger') });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'player-busy' });
  });

  it('a banned acceptor cannot start the match (M16 sanction enforcement)', async () => {
    const deps = makeDeps({ isBanned: vi.fn(async (id: string) => id === 'me') });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'player-banned' });
    expect(deps.activateBattle).not.toHaveBeenCalled();
  });

  it('a banned CHALLENGER also blocks the match — a ban closes both seats', async () => {
    const deps = makeDeps({ isBanned: vi.fn(async (id: string) => id === 'challenger') });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'player-banned' });
  });

  it('an empty problem bank refuses the match rather than starting an unplayable battle', async () => {
    const deps = makeDeps({ pickProblem: vi.fn(async () => null) });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'no-problems' });
    expect(deps.activateBattle).not.toHaveBeenCalled();
  });

  it('a lost activation race surfaces as not-pending', async () => {
    const deps = makeDeps({ activateBattle: vi.fn(async () => 'conflict' as const) });
    const result = await acceptChallenge(deps, 'me', 'battle-1', NOW);
    expect(result).toEqual({ ok: false, error: 'not-pending' });
  });

  it('an unknown battle accepts nothing', async () => {
    const deps = makeDeps({ loadChallenge: vi.fn(async () => null) });
    const result = await acceptChallenge(deps, 'me', 'missing', NOW);
    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});

function makeDeclineDeps(overrides: Partial<DeclineChallengeDeps> = {}): DeclineChallengeDeps {
  return {
    loadChallenge: vi.fn(async () => ({
      status: 'challenged' as const,
      playerAId: 'challenger',
      playerBId: 'me',
      timeLimitSeconds: 1800,
    })),
    voidBattle: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('declineChallenge', () => {
  it('the challengee declines — the challenge voids, nothing is rated', async () => {
    const deps = makeDeclineDeps();
    const result = await declineChallenge(deps, 'me', 'battle-1');
    expect(result).toEqual({ ok: true });
    expect(deps.voidBattle).toHaveBeenCalledWith('battle-1');
  });

  it('only the challengee may decline', async () => {
    const deps = makeDeclineDeps();
    const result = await declineChallenge(deps, 'challenger', 'battle-1');
    expect(result).toEqual({ ok: false, error: 'not-yours' });
    expect(deps.voidBattle).not.toHaveBeenCalled();
  });

  it('only a pending challenge can be declined', async () => {
    const deps = makeDeclineDeps({
      loadChallenge: vi.fn(async () => ({
        status: 'live' as const,
        playerAId: 'challenger',
        playerBId: 'me',
        timeLimitSeconds: 1800,
      })),
    });
    const result = await declineChallenge(deps, 'me', 'battle-1');
    expect(result).toEqual({ ok: false, error: 'not-pending' });
  });
});
