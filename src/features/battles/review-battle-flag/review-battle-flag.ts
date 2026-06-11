/**
 * review-battle-flag — the operator's decision over a battle the post-match
 * scan flagged (CLAUDE.md → battle anti-cheat: "confirmed cheating → forfeit
 * + Elo penalty + escalating bans"). Mirrors M7's review-flag shape: load →
 * kernel verdict → persist, with the kernel (domain/battles/sanctions) owning
 * every rule — only an open flag is reviewable, a decision is final, and the
 * sanction (penalty, strike, ladder ban) is `applyCheatSanction` verbatim.
 *
 * Uphold flips the recorded result: the flagged WINNER (the scan only ever
 * polices the winning submission — the party who gained) forfeits with reason
 * 'cheating-confirmed', so the wronged opponent becomes the recorded winner.
 * The battle's lifecycle status stays `flagged` (terminal); `reviewOutcome`
 * is what resolves. Elo repair is deliberately the flat penalty only — see
 * sanctions.ts for why v1 never re-derives ratings retroactively.
 */

import {
  applyCheatSanction,
  opponentOf,
  reviewBattleFlag,
  type BattleReviewOutcome,
  type BattleStatus,
  type CheatSanction,
  type PlayerSide,
} from '@/domain/battles';

export interface FlaggedBattleRow {
  status: BattleStatus;
  reviewOutcome: BattleReviewOutcome | null;
  winnerSide: PlayerSide | null;
  players: { a: string; b: string };
}

/** Everything an uphold writes, in one transactional instruction. */
export interface UpholdRecord {
  battleId: string;
  reviewedAt: Date;
  /** The sanctioned player (the flagged winner). */
  cheaterId: string;
  /** The wronged opponent — the recorded winner after the flip. */
  newWinnerSide: PlayerSide;
  sanction: CheatSanction;
}

export interface ReviewBattleFlagDeps {
  loadBattle(battleId: string): Promise<FlaggedBattleRow | null>;
  /** The cheater's current rating + strike count (profile row). */
  loadProfile(userId: string): Promise<{ elo: number; strikes: number } | null>;
  /**
   * One transaction: battle gets reviewOutcome 'upheld' + the forfeit flip
   * (winnerSide, forfeitReason 'cheating-confirmed'); the cheater's profile
   * gets the sanction (elo, strikes, bannedUntil).
   */
  applyUphold(record: UpholdRecord): Promise<void>;
  /** reviewOutcome 'cleared' + reviewedAt; nothing else moves. */
  applyClear(battleId: string, reviewedAt: Date): Promise<void>;
}

export type ReviewBattleFlagResult =
  | { ok: true }
  | { ok: false; error: 'not-found' | 'not-flagged' | 'already-reviewed' | 'no-winner' };

export async function upholdBattleFlag(
  deps: ReviewBattleFlagDeps,
  battleId: string,
  now: Date,
): Promise<ReviewBattleFlagResult> {
  const battle = await deps.loadBattle(battleId);
  if (!battle) return { ok: false, error: 'not-found' };

  const verdict = reviewBattleFlag(battle, 'uphold');
  if (!verdict.ok) return { ok: false, error: verdict.error };

  // The scan only flags battles WITH a winner; a winnerless flagged row is
  // corrupt data we refuse to sanction over rather than guess at.
  if (battle.winnerSide === null) return { ok: false, error: 'no-winner' };

  const cheaterId = battle.players[battle.winnerSide];
  const profile = await deps.loadProfile(cheaterId);
  if (!profile)
    throw new Error(`profile ${cheaterId} missing while sanctioning battle ${battleId}`);

  await deps.applyUphold({
    battleId,
    reviewedAt: now,
    cheaterId,
    newWinnerSide: opponentOf(battle.winnerSide),
    sanction: applyCheatSanction(profile, now),
  });
  return { ok: true };
}

export async function clearBattleFlag(
  deps: ReviewBattleFlagDeps,
  battleId: string,
  now: Date,
): Promise<ReviewBattleFlagResult> {
  const battle = await deps.loadBattle(battleId);
  if (!battle) return { ok: false, error: 'not-found' };

  const verdict = reviewBattleFlag(battle, 'clear');
  if (!verdict.ok) return { ok: false, error: verdict.error };

  await deps.applyClear(battleId, now);
  return { ok: true };
}
