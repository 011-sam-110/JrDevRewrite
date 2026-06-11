import { and, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { ACTIVE_BATTLE_STATUSES, type QueueTicket } from '../../domain/battles';
import { getDb } from './client';
import { battleQueue, battles, problems, profiles, users } from './schema';

/**
 * Shared battle reads/claims. The accept-challenge action, the match-queue
 * tick (realtime process) and the battles lobby all need the same pieces —
 * sharing them HERE (the infra seam) keeps the slices independent, the same
 * rule as pool-queries. Relative imports so the realtime entry runs under tsx.
 */

/** Any battle in motion (matched/countdown/live) involving this user? */
export async function userIsInActiveBattle(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: battles.id })
    .from(battles)
    .where(
      and(
        inArray(battles.status, [...ACTIVE_BATTLE_STATUSES]),
        or(eq(battles.playerAId, userId), eq(battles.playerBId, userId)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** The battle in motion (or pending acceptance, for redirects) for a user, newest first. */
export async function activeBattleIdFor(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: battles.id })
    .from(battles)
    .where(
      and(
        inArray(battles.status, [...ACTIVE_BATTLE_STATUSES]),
        or(eq(battles.playerAId, userId), eq(battles.playerBId, userId)),
      ),
    )
    .orderBy(sql`${battles.matchedAt} DESC NULLS LAST`)
    .limit(1);
  return row?.id ?? null;
}

/**
 * Draw one random problem from the approved bank — match-time selection.
 * `ORDER BY random()` is O(bank size); the bank is dozens of rows, not
 * millions, so simplicity wins over a tablesample.
 *
 * Dev-only override: E2E_FORCE_PROBLEM_SLUG pins the pick so the battle e2e
 * can type a known solution against a known problem (a random reveal is
 * untestable end to end). Hard-gated out of production, like /dev/login.
 */
export async function pickRandomApprovedProblem(): Promise<{ problemId: string } | null> {
  const forcedSlug = process.env.E2E_FORCE_PROBLEM_SLUG;
  if (forcedSlug && process.env.NODE_ENV !== 'production') {
    const [forced] = await getDb()
      .select({ problemId: problems.id })
      .from(problems)
      .where(and(eq(problems.slug, forcedSlug), eq(problems.status, 'approved')))
      .limit(1);
    if (forced) return forced;
  }

  const [row] = await getDb()
    .select({ problemId: problems.id })
    .from(problems)
    .where(eq(problems.status, 'approved'))
    .orderBy(sql`random()`)
    .limit(1);
  return row ?? null;
}

/**
 * The waiting queue as kernel tickets: fresh Elo from profiles, busy players
 * excluded IN SQL so the pairing kernel never sees someone it must not pair.
 */
export async function loadQueueTickets(): Promise<QueueTicket[]> {
  const busyA = getDb()
    .select({ id: battles.playerAId })
    .from(battles)
    .where(inArray(battles.status, [...ACTIVE_BATTLE_STATUSES]));
  const busyB = getDb()
    .select({ id: battles.playerBId })
    .from(battles)
    .where(inArray(battles.status, [...ACTIVE_BATTLE_STATUSES]));

  const rows = await getDb()
    .select({
      userId: battleQueue.userId,
      elo: profiles.elo,
      enqueuedAt: battleQueue.enqueuedAt,
    })
    .from(battleQueue)
    .innerJoin(profiles, eq(profiles.userId, battleQueue.userId))
    .where(and(notInArray(battleQueue.userId, busyA), notInArray(battleQueue.userId, busyB)));

  return rows.map((r) => ({ userId: r.userId, elo: r.elo, enqueuedAt: r.enqueuedAt }));
}

/**
 * Atomically consume two queue tickets and create their matched battle. If
 * either ticket is already gone (left the queue / consumed by a racing tick),
 * the whole pair conflicts and nothing is written.
 */
export async function claimQueuePair(fields: {
  playerAId: string;
  playerBId: string;
  problemId: string;
  readyDeadline: Date;
  matchedAt: Date;
}): Promise<'ok' | 'conflict'> {
  // A thrown error rolls the transaction back — the sentinel undoes the
  // partial ticket delete without leaking a half-consumed pair.
  class QueuePairConflict extends Error {}
  try {
    await getDb().transaction(async (tx) => {
      const deleted = await tx
        .delete(battleQueue)
        .where(inArray(battleQueue.userId, [fields.playerAId, fields.playerBId]))
        .returning({ userId: battleQueue.userId });
      if (deleted.length !== 2) throw new QueuePairConflict();
      await tx.insert(battles).values({
        status: 'matched',
        source: 'queue',
        playerAId: fields.playerAId,
        playerBId: fields.playerBId,
        problemId: fields.problemId,
        readyDeadline: fields.readyDeadline,
        matchedAt: fields.matchedAt,
      });
    });
    return 'ok';
  } catch (e) {
    if (e instanceof QueuePairConflict) return 'conflict';
    throw e;
  }
}

/** Case-insensitive lookup of a user by their public handle (GitHub username). */
export async function userByHandle(handle: string): Promise<{ userId: string } | null> {
  const [row] = await getDb()
    .select({ userId: users.id })
    .from(users)
    .where(sql`lower(${users.githubUsername}) = ${handle.toLowerCase()}`)
    .limit(1);
  return row ? { userId: row.userId } : null;
}
