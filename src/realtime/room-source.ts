/**
 * DB-backed room materialization + the effects executor — the seam where the
 * realtime service "relays events into slices" (CLAUDE.md) becomes literal
 * code. The battles ROW (written by accept-challenge / match-queue) is the
 * rendezvous between the Next process and this one: no create-room RPC
 * exists; the first join loads the row and builds the room.
 *
 * The executor maps the kernel's effects-as-data onto their owners:
 *   - transport mirrors (countdown/live + goAt) keep the row rebuildable, so
 *     a service restart mid-match resumes instead of stranding the battle;
 *   - record-result/apply-ratings route into the resolve-battle slice — the
 *     room never interprets them, and the slice's claim makes double
 *     execution (a poke racing the tick) a no-op;
 *   - a timeout settle comes back through `settleFromAuthority` so both
 *     clients hear the SCORED winner the transport could not know.
 *
 * Relative imports throughout — this file runs under tsx (dev.ts entry).
 */

import { and, eq } from 'drizzle-orm';
import { opponentOf } from '../domain/battles';
import type { BattleEffect, BattleSnapshot } from '../domain/battles';
import { settleBattle } from '../features/battles/resolve-battle/resolve-battle';
import { makeResolveBattleDeps } from '../features/battles/resolve-battle/settle-deps';
import { getDb } from '../infra/db/client';
import { battles, problems } from '../infra/db/schema';
import type { RevealedProblem } from '../lib/match-events';
import type { RoomOutcome } from './room';
import type { RoomRegistry, RoomSource } from './server';

const JOINABLE = ['matched', 'countdown', 'live'] as const;

export function dbRoomSource(registry: RoomRegistry, log: (line: string) => void): RoomSource {
  return async (battleId) => {
    const db = getDb();
    const battle = await db.query.battles.findFirst({ where: eq(battles.id, battleId) });
    if (!battle || !battle.problemId) return null;
    // Pending and settled battles have no live room: pre-match there is
    // nothing to transport, post-settlement the page renders the DB result.
    if (!(JOINABLE as readonly string[]).includes(battle.status)) return null;

    const problem = await db.query.problems.findFirst({ where: eq(problems.id, battle.problemId) });
    if (!problem) return null;

    const revealed: RevealedProblem = {
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      statementMd: problem.statementMd,
      tier: problem.tier,
      timeLimitSeconds: battle.timeLimitSeconds,
    };

    return {
      config: {
        battleId,
        players: { a: battle.playerAId, b: battle.playerBId },
        battle: {
          status: battle.status,
          readyDeadline: battle.readyDeadline,
          // Ready flags are not persisted: rebuilding mid-`matched` just asks
          // both players to ready again, which is the honest state anyway.
          readyA: false,
          readyB: false,
          goAt: battle.goAt,
          timeLimitSeconds: battle.timeLimitSeconds,
        },
      },
      problem: revealed,
      onEffects: (effects, battle_, outcome) => {
        executeEffects(registry, battleId, effects, battle_, outcome).catch((err: unknown) => {
          log(`effects executor failed for ${battleId}: ${String(err)}`);
        });
      },
    };
  };
}

async function executeEffects(
  registry: RoomRegistry,
  battleId: string,
  effects: BattleEffect[],
  battle: BattleSnapshot,
  outcome: RoomOutcome | undefined,
): Promise<void> {
  const db = getDb();

  // Transport mirrors — conditional on the prior status so a stale or
  // repeated effect can never move the row backwards.
  if (effects.includes('start-countdown') && battle.goAt) {
    await db
      .update(battles)
      .set({ status: 'countdown', goAt: battle.goAt })
      .where(and(eq(battles.id, battleId), eq(battles.status, 'matched')));
  }
  if (effects.includes('reveal-problem')) {
    await db
      .update(battles)
      .set({ status: 'live' })
      .where(and(eq(battles.id, battleId), eq(battles.status, 'countdown')));
  }

  const telemetry = [...(registry.get(battleId)?.telemetryLog ?? [])];

  if (effects.includes('record-result')) {
    if (battle.status === 'forfeited' && outcome?.winner) {
      await settleBattle(
        makeResolveBattleDeps(),
        battleId,
        { kind: 'forfeit', loser: opponentOf(outcome.winner), reason: outcome.reason ?? 'quit' },
        telemetry,
      );
    } else if (battle.status === 'resolved') {
      // Only the time-limit tick lands here: a decisive win settles in the
      // submit-solution slice, whose poke suppresses effect forwarding.
      const result = await settleBattle(
        makeResolveBattleDeps(),
        battleId,
        { kind: 'timeout' },
        telemetry,
      );
      // Tell both clients the scored winner the transport announced as null.
      if (result.settled) registry.get(battleId)?.settleFromAuthority(result.winnerSide);
    }
  }

  if (effects.includes('notify-void')) {
    await settleBattle(makeResolveBattleDeps(), battleId, { kind: 'void' }, telemetry);
  }
}
