/**
 * resolve-battle — the single settlement engine every battle conclusion
 * funnels through. Callers name only HOW the battle ended (`BattleSettlement`);
 * WHO won is never an input on the scored paths — the scoring kernel derives
 * it from the persisted submission history, which is what makes the Judge0
 * verdict (not a WS "I finished" frame, not a client claim) the authority.
 *
 * Callers: the submit-solution slice (decisive), the realtime effects
 * executor (timeout / forfeit / void — the kernel effects the room forwards),
 * and the decline/cancel paths (void). All of them race-safely converge here:
 * the deps' conditional status claim is the idempotency lock, so whichever
 * caller settles first wins and every later attempt reports `already-settled`.
 */

import {
  scoreBattle,
  type BattleStatus,
  type BattleSubmission,
  type BattleOutcome,
  type ForfeitReason,
  type PlayerSide,
} from '@/domain/battles';
import { opponentOf } from '@/domain/battles';
import type { BattleStreakOutcome, BattleXpResult } from '@/domain/gamification';
import type { MatchTelemetryRecord } from '@/lib/match-events';

/** How the battle concluded — the caller's knowledge, never the winner. */
export type BattleSettlement =
  | { kind: 'decisive' }
  | { kind: 'timeout' }
  | { kind: 'forfeit'; loser: PlayerSide; reason: ForfeitReason }
  | { kind: 'void' };

export interface SettleLoad {
  status: BattleStatus;
  players: { a: string; b: string };
  timeLimitSeconds: number;
  /** Full judged history in the scoring kernel's shape, server-stamped. */
  submissions: BattleSubmission[];
}

/** Per-player settlement instruction — pure data for the deps transaction. */
export interface PlayerAward {
  side: PlayerSide;
  userId: string;
  result: BattleXpResult;
  streakOutcome: BattleStreakOutcome;
}

export interface SettlementPlan {
  status: 'resolved' | 'forfeited' | 'voided';
  winnerSide: PlayerSide | null;
  outcome: BattleOutcome['kind'] | null;
  forfeitReason: ForfeitReason | null;
  telemetry: MatchTelemetryRecord[];
  /** Null on a void: nothing happened, nothing is rated (binding). */
  awards: PlayerAward[] | null;
}

export interface ResolveBattleDeps {
  loadBattle(battleId: string): Promise<SettleLoad | null>;
  /**
   * One transaction: claim the battle row with a CONDITIONAL status update
   * (only an unsettled row transitions — the idempotency lock), stamp the
   * settled fields + telemetry, then for non-void plans lock both profiles
   * and apply Elo/XP/streak via the gamification kernel, recording
   * battle_results. Returns who won the claim.
   */
  persistSettlement(battleId: string, plan: SettlementPlan): Promise<'settled' | 'already-settled'>;
}

export type SettleBattleResult =
  | { settled: true; status: SettlementPlan['status']; winnerSide: PlayerSide | null }
  | { settled: false; reason: 'not-found' | 'already-settled' };

export async function settleBattle(
  deps: ResolveBattleDeps,
  battleId: string,
  settlement: BattleSettlement,
  telemetry: MatchTelemetryRecord[],
): Promise<SettleBattleResult> {
  const battle = await deps.loadBattle(battleId);
  if (!battle) return { settled: false, reason: 'not-found' };

  const plan = buildPlan(battle, settlement, telemetry);
  const claimed = await deps.persistSettlement(battleId, plan);
  if (claimed === 'already-settled') return { settled: false, reason: 'already-settled' };
  return { settled: true, status: plan.status, winnerSide: plan.winnerSide };
}

function buildPlan(
  battle: SettleLoad,
  settlement: BattleSettlement,
  telemetry: MatchTelemetryRecord[],
): SettlementPlan {
  switch (settlement.kind) {
    case 'void':
      return {
        status: 'voided',
        winnerSide: null,
        outcome: null,
        forfeitReason: null,
        telemetry,
        awards: null,
      };
    case 'forfeit': {
      const winner = opponentOf(settlement.loser);
      return {
        status: 'forfeited',
        winnerSide: winner,
        outcome: null,
        forfeitReason: settlement.reason,
        telemetry,
        awards: awardsFor(battle.players, winner, settlement.loser),
      };
    }
    case 'decisive':
    case 'timeout': {
      // Both scored paths ask the kernel — the submission history decides.
      const outcome = scoreBattle(battle.submissions, battle.timeLimitSeconds);
      const winner = outcome.kind === 'draw' ? null : outcome.winner;
      return {
        status: 'resolved',
        winnerSide: winner,
        outcome: outcome.kind,
        forfeitReason: null,
        telemetry,
        awards: awardsFor(battle.players, winner, null),
      };
    }
  }
}

function awardsFor(
  players: { a: string; b: string },
  winner: PlayerSide | null,
  forfeiter: PlayerSide | null,
): PlayerAward[] {
  return (['a', 'b'] as const).map((side) => ({
    side,
    userId: players[side],
    result:
      side === forfeiter
        ? 'forfeited'
        : winner === null
          ? 'draw'
          : side === winner
            ? 'win'
            : 'loss',
    streakOutcome: side === forfeiter ? 'forfeited' : 'completed',
  }));
}
