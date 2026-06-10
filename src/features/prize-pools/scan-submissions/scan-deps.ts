import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { getDb } from '../../../infra/db/client';
import { entries, pools } from '../../../infra/db/schema';
import { getSimilarityClient, repoFingerprint } from '../../../infra/similarity';
import type { PoolSubmission, PriorSubmission, ScanSubmissionsDeps } from './scan-submissions';

/**
 * The real DB + similarity wiring for the scan, shared by the operator action
 * and the `pools:scan` CLI so the two can't drift. Relative imports (no `@/`)
 * because the CLI runs under tsx without path-alias config — same constraint as
 * tick-pools.
 */

/** Pools worth scanning: those whose build window has opened (submissions exist). */
export async function listScannablePools(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: pools.id })
    .from(pools)
    .where(inArray(pools.status, ['building', 'judging']));
  return rows.map((r) => r.id);
}

export function makePoolScanDeps(): ScanSubmissionsDeps {
  const similarity = getSimilarityClient();

  return {
    loadPoolSubmissions: async (poolId): Promise<PoolSubmission[]> => {
      const rows = await getDb()
        .select({
          id: entries.id,
          userId: entries.userId,
          repoUrl: entries.repoUrl,
          moderationStatus: entries.moderationStatus,
        })
        .from(entries)
        .where(and(eq(entries.poolId, poolId), isNotNull(entries.submittedAt)));
      return rows.map((r) => ({
        entryId: r.id,
        userId: r.userId,
        moderationStatus: r.moderationStatus,
        fingerprint: repoFingerprint(r.id, r.repoUrl),
      }));
    },

    loadPriorSubmissions: async (userId, excludePoolId): Promise<PriorSubmission[]> => {
      const rows = await getDb()
        .select({ id: entries.id, repoUrl: entries.repoUrl })
        .from(entries)
        .where(
          and(
            eq(entries.userId, userId),
            isNotNull(entries.submittedAt),
            ne(entries.poolId, excludePoolId),
          ),
        );
      return rows.map((r) => ({ entryId: r.id, fingerprint: repoFingerprint(r.id, r.repoUrl) }));
    },

    compare: (a, b) => similarity.compare(a, b),

    flagEntry: async (flag) => {
      await getDb()
        .update(entries)
        .set({
          moderationStatus: 'flagged',
          flagReasons: flag.reasons,
          flagMatches: flag.matches,
          flaggedAt: flag.flaggedAt,
        })
        .where(eq(entries.id, flag.entryId));
    },
  };
}
