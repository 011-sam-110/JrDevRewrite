import { and, asc, eq, inArray } from 'drizzle-orm';
import { ACTIVE_BATTLE_STATUSES, type BattleSubmission } from '../../../domain/battles';
import {
  advanceBattleStreak,
  applyBattleElo,
  battleXp,
  levelForXp,
  type BattleEloOutcome,
} from '../../../domain/gamification';
import { getDb } from '../../../infra/db/client';
import { ensureProfile } from '../../../infra/db/profiles';
import { battleResults, battles, battleSubmissions, profiles } from '../../../infra/db/schema';
import type { ResolveBattleDeps, SettleLoad } from './resolve-battle';

/**
 * Real DB wiring for resolve-battle, shared by every settlement caller: the
 * submit-solution action (Next process) AND the realtime effects executor (WS
 * process — it imports this module directly; "relays events into slices" made
 * literal). Relative imports so it runs under tsx, like close-deps.
 *
 * `persistSettlement` is the race-safe, idempotent half:
 *   - the CONDITIONAL battles update (status must still be unsettled) is the
 *     claim — a decisive submit racing the timeout tick serializes here, and
 *     whoever loses the race writes nothing at all;
 *   - both profiles are locked IN userId ORDER (two settlements touching the
 *     same pair can't deadlock), Elo/XP/streak computed from the locked reads
 *     via the pure kernel, results inserted, profiles bumped — all one
 *     transaction, so no half-rated battle survives a crash.
 */
export function makeResolveBattleDeps(): ResolveBattleDeps {
  return {
    loadBattle: async (battleId): Promise<SettleLoad | null> => {
      const db = getDb();
      const battle = await db.query.battles.findFirst({ where: eq(battles.id, battleId) });
      if (!battle) return null;

      const subs = await db
        .select({
          side: battleSubmissions.side,
          atSeconds: battleSubmissions.atSeconds,
          passedAll: battleSubmissions.passedAll,
          testsPassed: battleSubmissions.testsPassed,
        })
        .from(battleSubmissions)
        .where(eq(battleSubmissions.battleId, battleId))
        .orderBy(asc(battleSubmissions.atSeconds));

      return {
        status: battle.status,
        players: { a: battle.playerAId, b: battle.playerBId },
        timeLimitSeconds: battle.timeLimitSeconds,
        submissions: subs.map(
          (s): BattleSubmission => ({
            player: s.side,
            atSeconds: s.atSeconds,
            passedAll: s.passedAll,
            testsPassed: s.testsPassed,
          }),
        ),
      };
    },

    persistSettlement: async (battleId, plan) => {
      // Profiles may not exist for seeded users — materialize before locking.
      if (plan.awards) {
        for (const award of plan.awards) await ensureProfile(award.userId);
      }

      return getDb().transaction(async (tx) => {
        // The claim: only a still-unsettled battle transitions. `challenged`/
        // `queued` are claimable too — a declined challenge voids through here.
        const claimed = await tx
          .update(battles)
          .set({
            status: plan.status,
            winnerSide: plan.winnerSide,
            outcome: plan.outcome,
            forfeitReason: plan.forfeitReason,
            telemetry: plan.telemetry,
            resolvedAt: new Date(),
          })
          .where(
            and(
              eq(battles.id, battleId),
              inArray(battles.status, ['challenged', 'queued', ...ACTIVE_BATTLE_STATUSES]),
            ),
          )
          .returning({ id: battles.id });
        if (claimed.length === 0) return 'already-settled';

        if (!plan.awards) return 'settled'; // void: nothing happened, nothing rated

        // Lock both profiles in userId order, then let the kernel move numbers.
        const ordered = [...plan.awards].sort((x, y) => (x.userId < y.userId ? -1 : 1));
        const locked = new Map<
          string,
          { xp: number; elo: number; games: number; streak: number }
        >();
        for (const award of ordered) {
          const [prof] = await tx
            .select({
              xp: profiles.xp,
              elo: profiles.elo,
              battleGames: profiles.battleGames,
              battleStreak: profiles.battleStreak,
            })
            .from(profiles)
            .where(eq(profiles.userId, award.userId))
            .for('update');
          if (!prof) throw new Error(`profile ${award.userId} vanished mid-settle`);
          locked.set(award.userId, {
            xp: prof.xp,
            elo: prof.elo,
            games: prof.battleGames,
            streak: prof.battleStreak,
          });
        }

        const [a, b] = plan.awards;
        if (!a || !b) throw new Error('settlement plan must award both players');
        const profA = locked.get(a.userId)!;
        const profB = locked.get(b.userId)!;
        const eloOutcome: BattleEloOutcome =
          plan.winnerSide === null ? 'draw' : plan.winnerSide === a.side ? 'a' : 'b';
        const newElo = applyBattleElo(
          { rating: profA.elo, gamesPlayed: profA.games },
          { rating: profB.elo, gamesPlayed: profB.games },
          eloOutcome,
        );

        for (const [award, prof, eloAfter] of [
          [a, profA, newElo.a],
          [b, profB, newElo.b],
        ] as const) {
          const newStreak = advanceBattleStreak(prof.streak, award.streakOutcome);
          const xp = battleXp(award.result, newStreak);
          const newXp = prof.xp + xp.total;

          await tx.insert(battleResults).values({
            battleId,
            userId: award.userId,
            side: award.side,
            result: award.result,
            eloBefore: prof.elo,
            eloAfter,
            xpAwarded: xp.total,
            streakAfter: newStreak,
          });
          await tx
            .update(profiles)
            .set({
              xp: newXp,
              level: levelForXp(newXp),
              elo: eloAfter,
              battleGames: prof.games + 1,
              battleStreak: newStreak,
              updatedAt: new Date(),
            })
            .where(eq(profiles.userId, award.userId));
        }
        return 'settled';
      });
    },
  };
}
