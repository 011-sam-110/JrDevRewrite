import { describe, expect, it, vi } from 'vitest';
import {
  cancelChallenge,
  parseChallengeTarget,
  sendChallenge,
  type CancelChallengeDeps,
  type SendChallengeDeps,
} from './send-challenge';

/**
 * Direct challenges — the PRIMARY battle entry path (binding decision). A
 * challenge is a battle row born `challenged`; the opponent is named by their
 * public handle (the linked GitHub username, same identifier as /u/[handle])
 * or a pasted profile link. Cancelling voids it — nothing happened, nothing
 * is rated.
 */

describe('parseChallengeTarget', () => {
  it('accepts a bare handle', () => {
    expect(parseChallengeTarget('octocat')).toBe('octocat');
  });

  it('strips a leading @', () => {
    expect(parseChallengeTarget('@octocat')).toBe('octocat');
  });

  it('accepts a pasted profile link, absolute or relative', () => {
    expect(parseChallengeTarget('https://juniordev.example/u/octocat')).toBe('octocat');
    expect(parseChallengeTarget('/u/octocat')).toBe('octocat');
    expect(parseChallengeTarget('http://localhost:3000/u/octocat?tab=stats')).toBe('octocat');
  });

  it('trims whitespace and rejects empties and junk', () => {
    expect(parseChallengeTarget('  octocat  ')).toBe('octocat');
    expect(parseChallengeTarget('')).toBeNull();
    expect(parseChallengeTarget('   ')).toBeNull();
    expect(parseChallengeTarget('https://juniordev.example/pools/abc')).toBeNull();
    expect(parseChallengeTarget('two words')).toBeNull();
  });
});

function makeDeps(overrides: Partial<SendChallengeDeps> = {}): SendChallengeDeps {
  return {
    isBanned: vi.fn(async () => false),
    resolveOpponent: vi.fn(async () => ({ userId: 'opponent-1' })),
    hasPendingChallenge: vi.fn(async () => false),
    createChallenge: vi.fn(async () => ({ battleId: 'battle-1' })),
    ...overrides,
  };
}

describe('sendChallenge', () => {
  it('creates a challenged battle against a resolvable handle', async () => {
    const deps = makeDeps();
    const result = await sendChallenge(deps, 'me', 'octocat');
    expect(result).toEqual({ ok: true, battleId: 'battle-1' });
    expect(deps.createChallenge).toHaveBeenCalledWith('me', 'opponent-1');
  });

  it('resolves a pasted profile link to the same opponent', async () => {
    const deps = makeDeps();
    await sendChallenge(deps, 'me', '/u/octocat');
    expect(deps.resolveOpponent).toHaveBeenCalledWith('octocat');
  });

  it('rejects an unparseable target without touching the DB', async () => {
    const deps = makeDeps();
    const result = await sendChallenge(deps, 'me', 'not a handle');
    expect(result).toEqual({ ok: false, error: 'invalid-target' });
    expect(deps.resolveOpponent).not.toHaveBeenCalled();
  });

  it('rejects an unknown opponent', async () => {
    const deps = makeDeps({ resolveOpponent: vi.fn(async () => null) });
    const result = await sendChallenge(deps, 'me', 'ghost');
    expect(result).toEqual({ ok: false, error: 'opponent-not-found' });
  });

  it('you cannot challenge yourself', async () => {
    const deps = makeDeps({ resolveOpponent: vi.fn(async () => ({ userId: 'me' })) });
    const result = await sendChallenge(deps, 'me', 'my-own-handle');
    expect(result).toEqual({ ok: false, error: 'self-challenge' });
    expect(deps.createChallenge).not.toHaveBeenCalled();
  });

  it('one pending challenge per pair — no spam stacking', async () => {
    const deps = makeDeps({ hasPendingChallenge: vi.fn(async () => true) });
    const result = await sendChallenge(deps, 'me', 'octocat');
    expect(result).toEqual({ ok: false, error: 'already-pending' });
    expect(deps.createChallenge).not.toHaveBeenCalled();
  });

  it('a banned challenger cannot send at all (M16 sanction enforcement)', async () => {
    const deps = makeDeps({ isBanned: vi.fn(async () => true) });
    const result = await sendChallenge(deps, 'me', 'octocat');
    expect(result).toEqual({ ok: false, error: 'banned' });
    expect(deps.resolveOpponent).not.toHaveBeenCalled();
    expect(deps.createChallenge).not.toHaveBeenCalled();
  });
});

function makeCancelDeps(overrides: Partial<CancelChallengeDeps> = {}): CancelChallengeDeps {
  return {
    loadChallenge: vi.fn(async () => ({
      status: 'challenged' as const,
      playerAId: 'me',
      playerBId: 'opponent-1',
    })),
    voidBattle: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('cancelChallenge', () => {
  it('the challenger can withdraw a pending challenge — it voids', async () => {
    const deps = makeCancelDeps();
    const result = await cancelChallenge(deps, 'me', 'battle-1');
    expect(result).toEqual({ ok: true });
    expect(deps.voidBattle).toHaveBeenCalledWith('battle-1');
  });

  it('only the challenger may cancel', async () => {
    const deps = makeCancelDeps();
    const result = await cancelChallenge(deps, 'opponent-1', 'battle-1');
    expect(result).toEqual({ ok: false, error: 'not-yours' });
    expect(deps.voidBattle).not.toHaveBeenCalled();
  });

  it('an already-accepted challenge cannot be withdrawn', async () => {
    const deps = makeCancelDeps({
      loadChallenge: vi.fn(async () => ({
        status: 'matched' as const,
        playerAId: 'me',
        playerBId: 'opponent-1',
      })),
    });
    const result = await cancelChallenge(deps, 'me', 'battle-1');
    expect(result).toEqual({ ok: false, error: 'not-pending' });
  });

  it('an unknown battle cancels nothing', async () => {
    const deps = makeCancelDeps({ loadChallenge: vi.fn(async () => null) });
    const result = await cancelChallenge(deps, 'me', 'missing');
    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});
