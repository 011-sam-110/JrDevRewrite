import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../../infra/db/client';
import { battles, battleSubmissions, problems } from '../../../infra/db/schema';
import { LocalSimilarityClient } from '../../../infra/similarity';
import { scanBattle, type BattleScanContext, type PostMatchScanDeps } from './post-match-scan';

/**
 * Real DB wiring for the post-match anti-cheat scan, shared (like settle-deps)
 * by every conclusion site: the submit-solution action (Next process) and the
 * realtime effects executor (WS process). Relative imports so it runs under
 * tsx.
 */
export function makePostMatchScanDeps(): PostMatchScanDeps {
  const similarity = new LocalSimilarityClient();
  return {
    loadScanContext: async (battleId): Promise<BattleScanContext | null> => {
      const db = getDb();
      const battle = await db.query.battles.findFirst({ where: eq(battles.id, battleId) });
      if (!battle) return null;

      const problem = battle.problemId
        ? await db.query.problems.findFirst({ where: eq(problems.id, battle.problemId) })
        : null;

      const subs = await db
        .select({
          id: battleSubmissions.id,
          side: battleSubmissions.side,
          code: battleSubmissions.code,
          atSeconds: battleSubmissions.atSeconds,
          passedAll: battleSubmissions.passedAll,
          testsPassed: battleSubmissions.testsPassed,
        })
        .from(battleSubmissions)
        .where(eq(battleSubmissions.battleId, battleId))
        .orderBy(asc(battleSubmissions.atSeconds));

      return {
        status: battle.status,
        winnerSide: battle.winnerSide,
        timeLimitSeconds: battle.timeLimitSeconds,
        telemetry: battle.telemetry,
        bankSolutions: problem ? [{ ref: problem.id, code: problem.referenceSolution }] : [],
        submissions: subs,
      };
    },

    compare: (a, b) => similarity.compare(a, b),

    flagBattle: async (battleId, signals, flaggedAt) => {
      // Conditional on a still-unflagged settled status — two racing scans
      // (auto + the operator's re-scan) serialize here; the loser writes
      // nothing, mirroring settle-deps' claim.
      await getDb()
        .update(battles)
        .set({ status: 'flagged', flagReasons: signals, flaggedAt })
        .where(and(eq(battles.id, battleId), inArray(battles.status, ['resolved', 'forfeited'])));
    },
  };
}

/**
 * The failure-isolated entry point the conclusion sites call: a scan failure
 * must never disturb a settled result (the battle stays resolved; the
 * operator's re-scan can pick it up later), so errors are logged and
 * swallowed HERE, at the boundary, never inside the scan logic.
 */
export async function runPostMatchScan(battleId: string): Promise<void> {
  try {
    const report = await scanBattle(makePostMatchScanDeps(), battleId, new Date());
    if (report.scanned && report.flagged) {
      console.log(
        `anti-cheat: flagged battle ${battleId} (${report.signals.map((s) => s.reason).join(', ')})`,
      );
    }
  } catch (err) {
    console.error(`anti-cheat: post-match scan failed for battle ${battleId}:`, err);
  }
}
