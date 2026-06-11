import { and, desc, eq, gte, isNotNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { BattleStatus, PlayerSide } from '@/domain/battles';
import type { BattleXpResult } from '@/domain/gamification';
import { activeBattleIdFor } from '@/infra/db/battle-queries';
import { getDb } from '@/infra/db/client';
import { ensureProfile } from '@/infra/db/profiles';
import { battleQueue, battleResults, battles, profiles, users } from '@/infra/db/schema';

/**
 * battles-lobby — the read model behind /battles: your rating + record, the
 * challenge traffic, queue state, who's online, and recent results. Pure
 * reads; every mutation goes through its owning slice's action.
 */

/** "Online" is heartbeat recency — the lobby poller touches lastSeenAt. */
export const ONLINE_WINDOW_SECONDS = 120;

export interface LobbyChallenge {
  battleId: string;
  opponentHandle: string;
  createdAt: Date;
}

export interface LobbyOnlinePlayer {
  handle: string;
  elo: number;
}

export interface LobbyRecentBattle {
  battleId: string;
  opponentHandle: string;
  status: BattleStatus;
  myResult: BattleXpResult;
  eloBefore: number;
  eloAfter: number;
  resolvedAt: Date | null;
}

export interface BattlesLobby {
  elo: number;
  battleGames: number;
  battleStreak: number;
  record: { wins: number; losses: number; draws: number };
  incoming: LobbyChallenge[];
  outgoing: LobbyChallenge[];
  inQueue: boolean;
  queueSize: number;
  online: LobbyOnlinePlayer[];
  recent: LobbyRecentBattle[];
  /** A battle in motion to bounce straight into. */
  activeBattleId: string | null;
}

const challengerUser = alias(users, 'challenger_user');
const challengeeUser = alias(users, 'challengee_user');

function handleOf(row: { githubUsername: string | null; email: string | null }): string {
  return row.githubUsername ?? row.email ?? 'unknown';
}

export async function getBattlesLobby(userId: string, now: Date): Promise<BattlesLobby> {
  const db = getDb();
  const profile = await ensureProfile(userId);

  const pending = await db
    .select({
      battleId: battles.id,
      playerAId: battles.playerAId,
      playerBId: battles.playerBId,
      createdAt: battles.createdAt,
      aHandle: challengerUser.githubUsername,
      aEmail: challengerUser.email,
      bHandle: challengeeUser.githubUsername,
      bEmail: challengeeUser.email,
    })
    .from(battles)
    .innerJoin(challengerUser, eq(challengerUser.id, battles.playerAId))
    .innerJoin(challengeeUser, eq(challengeeUser.id, battles.playerBId))
    .where(
      and(
        eq(battles.status, 'challenged'),
        or(eq(battles.playerAId, userId), eq(battles.playerBId, userId)),
      ),
    )
    .orderBy(desc(battles.createdAt));

  const incoming: LobbyChallenge[] = [];
  const outgoing: LobbyChallenge[] = [];
  for (const row of pending) {
    if (row.playerBId === userId) {
      incoming.push({
        battleId: row.battleId,
        opponentHandle: handleOf({ githubUsername: row.aHandle, email: row.aEmail }),
        createdAt: row.createdAt,
      });
    } else {
      outgoing.push({
        battleId: row.battleId,
        opponentHandle: handleOf({ githubUsername: row.bHandle, email: row.bEmail }),
        createdAt: row.createdAt,
      });
    }
  }

  const [myTicket] = await db
    .select({ userId: battleQueue.userId })
    .from(battleQueue)
    .where(eq(battleQueue.userId, userId))
    .limit(1);
  const [queueCount] = await db.select({ value: sql<number>`count(*)::int` }).from(battleQueue);

  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1000);
  const online = await db
    .select({ handle: users.githubUsername, elo: profiles.elo })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        ne(profiles.userId, userId),
        isNotNull(profiles.lastSeenAt),
        gte(profiles.lastSeenAt, onlineSince),
        // The privacy rule rides the same kernel-backed column as every other
        // public surface: a private account never appears in the lobby list.
        eq(profiles.visibility, 'public'),
        isNotNull(users.githubUsername),
      ),
    )
    .orderBy(desc(profiles.elo))
    .limit(30);

  const recentRows = await db
    .select({
      battleId: battles.id,
      status: battles.status,
      resolvedAt: battles.resolvedAt,
      playerAId: battles.playerAId,
      myResult: battleResults.result,
      eloBefore: battleResults.eloBefore,
      eloAfter: battleResults.eloAfter,
      aHandle: challengerUser.githubUsername,
      aEmail: challengerUser.email,
      bHandle: challengeeUser.githubUsername,
      bEmail: challengeeUser.email,
    })
    .from(battleResults)
    .innerJoin(battles, eq(battles.id, battleResults.battleId))
    .innerJoin(challengerUser, eq(challengerUser.id, battles.playerAId))
    .innerJoin(challengeeUser, eq(challengeeUser.id, battles.playerBId))
    .where(eq(battleResults.userId, userId))
    .orderBy(desc(battles.resolvedAt))
    .limit(10);

  const recent: LobbyRecentBattle[] = recentRows.map((row) => {
    const mySide: PlayerSide = row.playerAId === userId ? 'a' : 'b';
    const opponent =
      mySide === 'a'
        ? { githubUsername: row.bHandle, email: row.bEmail }
        : { githubUsername: row.aHandle, email: row.aEmail };
    return {
      battleId: row.battleId,
      opponentHandle: handleOf(opponent),
      status: row.status,
      myResult: row.myResult,
      eloBefore: row.eloBefore,
      eloAfter: row.eloAfter,
      resolvedAt: row.resolvedAt,
    };
  });

  const record = { wins: 0, losses: 0, draws: 0 };
  const tally = await db
    .select({ result: battleResults.result, value: sql<number>`count(*)::int` })
    .from(battleResults)
    .where(eq(battleResults.userId, userId))
    .groupBy(battleResults.result);
  for (const row of tally) {
    if (row.result === 'win') record.wins = row.value;
    else if (row.result === 'draw') record.draws = row.value;
    else record.losses += row.value; // loss + forfeited both read as losses
  }

  return {
    elo: profile.elo,
    battleGames: profile.battleGames,
    battleStreak: profile.battleStreak,
    record,
    incoming,
    outgoing,
    inQueue: myTicket !== undefined,
    queueSize: queueCount?.value ?? 0,
    online: online.map((o) => ({ handle: o.handle ?? 'unknown', elo: o.elo })),
    recent,
    activeBattleId: await activeBattleIdFor(userId),
  };
}

/**
 * The poller's cheap fingerprint — the page refreshes only when this string
 * changes, so the 4-second heartbeat doesn't re-render an idle lobby.
 */
export async function getLobbyStamp(userId: string, now: Date): Promise<string> {
  const db = getDb();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1000);

  const [pending] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(battles)
    .where(
      and(
        eq(battles.status, 'challenged'),
        or(eq(battles.playerAId, userId), eq(battles.playerBId, userId)),
      ),
    );
  const [queued] = await db.select({ value: sql<number>`count(*)::int` }).from(battleQueue);
  const [onlineCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(profiles)
    .where(and(isNotNull(profiles.lastSeenAt), gte(profiles.lastSeenAt, onlineSince)));
  const [settled] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(battleResults)
    .where(eq(battleResults.userId, userId));

  return [pending?.value, queued?.value, onlineCount?.value, settled?.value].join(':');
}
