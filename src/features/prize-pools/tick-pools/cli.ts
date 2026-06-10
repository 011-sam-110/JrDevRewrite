/**
 * `npm run pools:tick` — the pool-lifecycle heartbeat. The container host's
 * cron runs this every few minutes; each run examines every non-terminal pool
 * and executes whatever transition its deadlines mandate. Safe to re-run at
 * any time: deciding is pure (kernel tickPool), refunds dedupe on the ledger.
 *
 * Thin entry point (VSA): wires real DB/email deps into tickPools and prints
 * the report. Relative imports (no `@/`) so tsx needs no path-alias config.
 */
import 'dotenv/config';
import { eq, inArray, sql } from 'drizzle-orm';
import { ACTIVE_POOL_STATUSES, creditDelta } from '../../../domain/prize-pools';
import { getDb } from '../../../infra/db/client';
import { creditTransactions, entries, pools, profiles, users } from '../../../infra/db/schema';
import { getEmailClient } from '../../../infra/email';
import { tickPools, type TickablePool, type TickPoolsDeps } from './tick-pools';

const NOTIFICATIONS = {
  extension: {
    subject: (title: string) => `Pool extended: ${title}`,
    text: (title: string) =>
      `"${title}" didn't reach its minimum entrants in time, so the join window has been extended by 48 hours. Build and judging windows shift with it — spread the word.`,
  },
  cancellation: {
    subject: (title: string) => `Pool cancelled: ${title}`,
    text: (title: string) =>
      `"${title}" didn't reach its minimum entrants even after an extension, so it has been cancelled. Your entry credit has been refunded.`,
  },
} as const;

async function entrantEmails(poolId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ email: users.email })
    .from(entries)
    .innerJoin(users, eq(entries.userId, users.id))
    .where(eq(entries.poolId, poolId));
  return rows.flatMap((r) => (r.email ? [r.email] : []));
}

const deps: TickPoolsDeps = {
  listTickablePools: async () => {
    const rows = await getDb()
      .select()
      .from(pools)
      .where(inArray(pools.status, [...ACTIVE_POOL_STATUSES]));
    if (rows.length === 0) return [];
    const counts = await getDb()
      .select({ poolId: entries.poolId, value: sql<number>`count(*)::int` })
      .from(entries)
      .where(
        inArray(
          entries.poolId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(entries.poolId);
    const countByPool = new Map(counts.map((c) => [c.poolId, c.value]));

    return rows.flatMap((row): TickablePool[] => {
      // A published pool always has deadlines (stamped at approval); a row
      // without them is corrupt and is skipped rather than guessed at.
      if (!row.joinDeadline || !row.buildDeadline || !row.judgingDeadline) {
        console.error(`SKIP ${row.slug}: status ${row.status} but deadlines missing`);
        return [];
      }
      return [
        {
          id: row.id,
          status: row.status,
          joinDeadline: row.joinDeadline,
          buildDeadline: row.buildDeadline,
          judgingDeadline: row.judgingDeadline,
          entrantCount: countByPool.get(row.id) ?? 0,
          minEntrants: row.minEntrants,
          entrantCap: row.entrantCap,
          extensionsUsed: row.extensionsUsed,
        },
      ];
    });
  },

  persistTransition: async (pool) => {
    await getDb()
      .update(pools)
      .set({
        status: pool.status,
        extensionsUsed: pool.extensionsUsed,
        joinDeadline: pool.joinDeadline,
        buildDeadline: pool.buildDeadline,
        judgingDeadline: pool.judgingDeadline,
      })
      .where(eq(pools.id, pool.id));
  },

  refundEntrants: async (poolId) => {
    const db = getDb();
    const entrants = await db
      .select({ userId: entries.userId })
      .from(entries)
      .where(eq(entries.poolId, poolId));

    let refunded = 0;
    for (const { userId } of entrants) {
      await db.transaction(async (tx) => {
        // The unique (user, pool, reason) index makes the second attempt a
        // no-op — re-running after a crash can't refund anyone twice.
        const inserted = await tx
          .insert(creditTransactions)
          .values({ userId, poolId, amount: creditDelta('pool-refund'), reason: 'pool-refund' })
          .onConflictDoNothing()
          .returning();
        if (inserted.length === 0) return;
        await tx
          .update(profiles)
          .set({
            credits: sql`${profiles.credits} + ${creditDelta('pool-refund')}`,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, userId));
        refunded++;
      });
    }
    return refunded;
  },

  notifyEntrants: async (poolId, kind) => {
    const pool = await getDb().query.pools.findFirst({ where: eq(pools.id, poolId) });
    if (!pool) return;
    const message = NOTIFICATIONS[kind];
    const email = getEmailClient();
    for (const to of await entrantEmails(poolId)) {
      await email.send({
        to,
        subject: message.subject(pool.title),
        text: message.text(pool.title),
      });
    }
  },

  recordUnhandledEffect: async (poolId, effect) => {
    // Executors land with M8 (assign-judges) and M9 (finalize-results).
    console.log(`pending  ${effect} for pool ${poolId} — executor arrives in a later milestone`);
  },
};

async function main(): Promise<number> {
  const report = await tickPools(deps, new Date());

  for (const t of report.transitions) {
    const effects = t.effects.length > 0 ? ` [${t.effects.join(', ')}]` : '';
    console.log(`ticked   ${t.poolId}: ${t.from} → ${t.to}${effects}`);
  }
  for (const e of report.errors) console.error(`FAILED   ${e.poolId}: ${e.message}`);

  console.log(
    `\n${report.examined} examined, ${report.transitions.length} transitioned, ${report.errors.length} failed`,
  );
  return report.errors.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
