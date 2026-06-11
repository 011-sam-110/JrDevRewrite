import { asc, eq, isNull, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { BattleCheatSignal, PlayerSide } from '@/domain/battles';
import { getDb } from '@/infra/db/client';
import { battles, problems, users } from '@/infra/db/schema';

/**
 * The operator's battle anti-cheat queue: flagged battles awaiting a decision
 * (reviewOutcome still null — reviewed ones leave the queue, like reviewed
 * pool flags), with the evidence the scan recorded and who's who. The flagged
 * party is always the recorded WINNER — the scan polices the winning
 * submission (the party who gained).
 */
export interface BattleFlagQueueItem {
  battleId: string;
  problemTitle: string;
  /** The flagged player (the recorded winner at flag time). */
  flaggedLabel: string;
  flaggedSide: PlayerSide;
  /** Their opponent — who an uphold makes the recorded winner. */
  opponentLabel: string;
  signals: BattleCheatSignal[];
  flaggedAt: Date | null;
}

export async function listFlaggedBattles(): Promise<BattleFlagQueueItem[]> {
  const playerA = alias(users, 'player_a');
  const playerB = alias(users, 'player_b');

  const rows = await getDb()
    .select({
      battleId: battles.id,
      winnerSide: battles.winnerSide,
      signals: battles.flagReasons,
      flaggedAt: battles.flaggedAt,
      problemTitle: problems.title,
      aHandle: playerA.githubUsername,
      aEmail: playerA.email,
      bHandle: playerB.githubUsername,
      bEmail: playerB.email,
    })
    .from(battles)
    .leftJoin(problems, eq(battles.problemId, problems.id))
    .innerJoin(playerA, eq(battles.playerAId, playerA.id))
    .innerJoin(playerB, eq(battles.playerBId, playerB.id))
    .where(and(eq(battles.status, 'flagged'), isNull(battles.reviewOutcome)))
    .orderBy(asc(battles.flaggedAt));

  return rows.map((r) => {
    const labels = {
      a: r.aHandle ?? r.aEmail ?? 'player a',
      b: r.bHandle ?? r.bEmail ?? 'player b',
    };
    // Defensive: the scan never flags a winnerless battle, but render sanely.
    const flaggedSide: PlayerSide = r.winnerSide ?? 'a';
    return {
      battleId: r.battleId,
      problemTitle: r.problemTitle ?? 'unknown problem',
      flaggedLabel: labels[flaggedSide],
      flaggedSide,
      opponentLabel: labels[flaggedSide === 'a' ? 'b' : 'a'],
      signals: r.signals,
      flaggedAt: r.flaggedAt,
    };
  });
}
