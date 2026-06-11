import { describe, expect, it } from 'vitest';
import { CHEAT_ELO_PENALTY, type BattleReviewOutcome } from '@/domain/battles';
import { ELO_FLOOR } from '@/domain/gamification';
import {
  clearBattleFlag,
  upholdBattleFlag,
  type FlaggedBattleRow,
  type ReviewBattleFlagDeps,
  type UpholdRecord,
} from './review-battle-flag';

/**
 * The operator's review move over a flagged battle: uphold = confirmed
 * cheating → the recorded result flips to a forfeit by the cheater (the
 * wronged opponent becomes the winner), the cheater takes the Elo penalty, a
 * strike, and the ladder ban; clear = false positive, evidence archived,
 * nothing else moves. The kernel (sanctions.ts) decides everything; this
 * slice only orchestrates load → kernel → persist.
 */

const NOW = new Date('2026-06-11T12:00:00Z');
const WEEK = 7 * 86_400_000;

function battle(partial: Partial<FlaggedBattleRow> = {}): FlaggedBattleRow {
  return {
    status: 'flagged',
    reviewOutcome: null,
    winnerSide: 'a',
    players: { a: 'user-cheat', b: 'user-honest' },
    ...partial,
  };
}

function makeDeps(row: FlaggedBattleRow | null, profile = { elo: 1400, strikes: 0 }) {
  const upholds: UpholdRecord[] = [];
  const clears: { battleId: string; reviewedAt: Date }[] = [];
  const deps: ReviewBattleFlagDeps = {
    loadBattle: async () => row,
    loadProfile: async () => profile,
    applyUphold: async (record) => {
      upholds.push(record);
    },
    applyClear: async (battleId, reviewedAt) => {
      clears.push({ battleId, reviewedAt });
    },
  };
  return { deps, upholds, clears };
}

describe('upholdBattleFlag', () => {
  it('sanctions the flagged winner: forfeit flip, Elo penalty, strike, ladder ban', async () => {
    const { deps, upholds } = makeDeps(battle());
    const result = await upholdBattleFlag(deps, 'b1', NOW);
    expect(result).toEqual({ ok: true });
    expect(upholds).toHaveLength(1);
    expect(upholds[0]).toEqual({
      battleId: 'b1',
      reviewedAt: NOW,
      cheaterId: 'user-cheat',
      /** The wronged opponent becomes the recorded winner. */
      newWinnerSide: 'b',
      sanction: {
        elo: 1400 - CHEAT_ELO_PENALTY,
        strikes: 1,
        bannedUntil: new Date(NOW.getTime() + WEEK),
      },
    });
  });

  it('escalates with prior strikes and respects the Elo floor', async () => {
    const { deps, upholds } = makeDeps(battle(), { elo: ELO_FLOOR + 5, strikes: 1 });
    await upholdBattleFlag(deps, 'b1', NOW);
    expect(upholds[0]!.sanction.elo).toBe(ELO_FLOOR);
    expect(upholds[0]!.sanction.strikes).toBe(2);
    expect(upholds[0]!.sanction.bannedUntil).toEqual(new Date(NOW.getTime() + 30 * 86_400_000));
  });

  it('refuses anything not flagged', async () => {
    const { deps, upholds } = makeDeps(battle({ status: 'resolved' }));
    expect(await upholdBattleFlag(deps, 'b1', NOW)).toEqual({ ok: false, error: 'not-flagged' });
    expect(upholds).toHaveLength(0);
  });

  it('refuses a second review — the first decision is final', async () => {
    const { deps, upholds } = makeDeps(battle({ reviewOutcome: 'cleared' as BattleReviewOutcome }));
    expect(await upholdBattleFlag(deps, 'b1', NOW)).toEqual({
      ok: false,
      error: 'already-reviewed',
    });
    expect(upholds).toHaveLength(0);
  });

  it('refuses a flagged battle without a winner (nothing to sanction — defensive)', async () => {
    const { deps } = makeDeps(battle({ winnerSide: null }));
    expect(await upholdBattleFlag(deps, 'b1', NOW)).toEqual({ ok: false, error: 'no-winner' });
  });

  it('unknown battle → not-found', async () => {
    const { deps } = makeDeps(null);
    expect(await upholdBattleFlag(deps, 'missing', NOW)).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('a vanished profile is an error, never a silent skip', async () => {
    const { deps } = makeDeps(battle());
    deps.loadProfile = async () => null;
    await expect(upholdBattleFlag(deps, 'b1', NOW)).rejects.toThrow(/profile/);
  });
});

describe('clearBattleFlag', () => {
  it('archives the review and moves nothing else', async () => {
    const { deps, clears, upholds } = makeDeps(battle());
    expect(await clearBattleFlag(deps, 'b1', NOW)).toEqual({ ok: true });
    expect(clears).toEqual([{ battleId: 'b1', reviewedAt: NOW }]);
    expect(upholds).toHaveLength(0);
  });

  it('is gated by the same kernel rule (only an open flag is reviewable)', async () => {
    const { deps, clears } = makeDeps(battle({ reviewOutcome: 'upheld' as BattleReviewOutcome }));
    expect(await clearBattleFlag(deps, 'b1', NOW)).toEqual({
      ok: false,
      error: 'already-reviewed',
    });
    expect(clears).toHaveLength(0);
  });
});
