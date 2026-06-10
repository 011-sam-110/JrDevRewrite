import { count, eq } from 'drizzle-orm';
import { getDb } from '../../../infra/db/client';
import { listJudgeableEntries } from '../../../infra/db/pool-queries';
import { judgingAssignments } from '../../../infra/db/schema';
import type { AssignJudgesDeps } from './assign-judges';

/**
 * Real DB wiring for assign-judges, shared by the `pools:tick` cron effect and
 * the judging-page lazy ensure. Relative imports (no `@/`) so it runs under the
 * tsx CLI — same constraint as tick-pools/scan-deps. The judgeable set is read
 * via the shared infra query (submitted AND anti-cheat-cleared), so a flagged
 * entry is never assigned to a judge in the first place.
 */
export function makeAssignJudgesDeps(): AssignJudgesDeps {
  return {
    hasAssignments: async (poolId) => {
      const rows = await getDb()
        .select({ value: count() })
        .from(judgingAssignments)
        .where(eq(judgingAssignments.poolId, poolId));
      return (rows[0]?.value ?? 0) > 0;
    },

    loadJudgeableEntries: async (poolId) => {
      const judgeable = await listJudgeableEntries(poolId);
      // infra speaks {entryId, userId}; the kernel speaks {entryId, ownerId}.
      return judgeable.map((e) => ({ entryId: e.entryId, ownerId: e.userId }));
    },

    saveAssignments: async (poolId, assignments) => {
      const rows = assignments.flatMap((a) =>
        a.entryIds.map((entryId) => ({
          poolId,
          judgeUserId: a.judgeId,
          entryId,
        })),
      );
      if (rows.length === 0) return;
      // Conflict-safe: a re-run (deterministic seed) collides on the unique
      // (pool,judge,entry) index and writes nothing new.
      await getDb().insert(judgingAssignments).values(rows).onConflictDoNothing();
    },
  };
}
