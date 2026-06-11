'use server';

import { asc, eq } from 'drizzle-orm';
import { isBattleLanguage, type BattleSubmission } from '@/domain/battles';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { battles, battleSubmissions, problems } from '@/infra/db/schema';
import { getJudgeClient } from '@/infra/judge';
import { notifyBattleSettled } from '@/infra/realtime/notify';
import type { SubmissionOutcome } from '@/lib/match-events';
import { settleBattle } from '../resolve-battle/resolve-battle';
import { makeResolveBattleDeps } from '../resolve-battle/settle-deps';
import { submitSolution, type SubmitSolutionDeps, type SubmitContext } from './submit-solution';

/** Keep pathological payloads away from the judge — generous for real code. */
const MAX_CODE_LENGTH = 100_000;

/**
 * The arena's submit seam, server-side. Returns the `SubmissionOutcome` shape
 * the verdict feed renders; guard rejections (races the client UI normally
 * prevents) map onto it conservatively rather than leaking a second shape.
 *
 * The decisive path: settle in the DB FIRST (resolve-battle claims the row —
 * the authoritative instant), then poke the realtime room so both arenas hear
 * `battle-status` now; the room's reply carries its telemetry log, persisted
 * here because the settle ran in this process which never saw the signals.
 */
export async function submitSolutionAction(
  battleId: string,
  code: string,
  language: string,
): Promise<SubmissionOutcome> {
  const identity = await getIdentity();
  if (!identity || identity.status !== 'complete') {
    return { status: 'error', testsPassed: 0, testsTotal: 0 };
  }
  if (!isBattleLanguage(language) || code.length === 0 || code.length > MAX_CODE_LENGTH) {
    return { status: 'error', testsPassed: 0, testsTotal: 0 };
  }

  const deps: SubmitSolutionDeps = {
    loadSubmitContext: async (id): Promise<SubmitContext | null> => {
      const db = getDb();
      const battle = await db.query.battles.findFirst({ where: eq(battles.id, id) });
      if (!battle || !battle.problemId) return null;
      const problem = await db.query.problems.findFirst({
        where: eq(problems.id, battle.problemId),
      });
      if (!problem) return null;

      const history = await db
        .select({
          side: battleSubmissions.side,
          atSeconds: battleSubmissions.atSeconds,
          passedAll: battleSubmissions.passedAll,
          testsPassed: battleSubmissions.testsPassed,
        })
        .from(battleSubmissions)
        .where(eq(battleSubmissions.battleId, id))
        .orderBy(asc(battleSubmissions.atSeconds));

      return {
        battle: {
          id: battle.id,
          status: battle.status,
          goAt: battle.goAt,
          timeLimitSeconds: battle.timeLimitSeconds,
          players: { a: battle.playerAId, b: battle.playerBId },
        },
        hiddenTests: problem.hiddenTests,
        history: history.map(
          (s): BattleSubmission => ({
            player: s.side,
            atSeconds: s.atSeconds,
            passedAll: s.passedAll,
            testsPassed: s.testsPassed,
          }),
        ),
      };
    },

    runJudge: (submission) => getJudgeClient().run(submission),

    recordSubmission: async (row) => {
      await getDb().insert(battleSubmissions).values(row);
    },

    settleDecisive: async (id) => {
      const settled = await settleBattle(makeResolveBattleDeps(), id, { kind: 'decisive' }, []);
      const winner = settled.settled ? settled.winnerSide : null;
      const ack = await notifyBattleSettled(id, winner);
      if (ack && ack.telemetry.length > 0) {
        await getDb().update(battles).set({ telemetry: ack.telemetry }).where(eq(battles.id, id));
      }
    },

    now: () => new Date(),
  };

  const result = await submitSolution(deps, identity.userId, battleId, code, language);
  if (!result.ok) return { status: 'error', testsPassed: 0, testsTotal: 0 };
  return result.outcome;
}
