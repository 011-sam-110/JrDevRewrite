'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { isBattleBanned } from '@/domain/battles';
import {
  battleBanUntil,
  pickRandomApprovedProblem,
  userIsInActiveBattle,
} from '@/infra/db/battle-queries';
import { battles } from '@/infra/db/schema';
import { settleBattle } from '../resolve-battle/resolve-battle';
import { makeResolveBattleDeps } from '../resolve-battle/settle-deps';
import {
  acceptChallenge,
  declineChallenge,
  type AcceptChallengeDeps,
  type DeclineChallengeDeps,
} from './accept-challenge';

async function loadChallenge(id: string) {
  const row = await getDb().query.battles.findFirst({ where: eq(battles.id, id) });
  return row
    ? {
        status: row.status,
        playerAId: row.playerAId,
        playerBId: row.playerBId,
        timeLimitSeconds: row.timeLimitSeconds,
      }
    : null;
}

export type AcceptActionState = { status: 'idle' } | { status: 'error'; message: string };

const ACCEPT_ERROR_LABELS: Record<string, string> = {
  'not-found': 'Challenge not found.',
  'not-yours': 'This challenge is not addressed to you.',
  'not-pending': 'This challenge is no longer open.',
  'player-busy': 'One of you is already in a battle.',
  'player-banned': 'One of you is battle-banned right now.',
  'no-problems': 'No approved problems in the bank — tell the operator.',
};

/** Accepting redirects straight into the arena on success. */
export async function acceptChallengeAction(battleId: string): Promise<AcceptActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  const deps: AcceptChallengeDeps = {
    loadChallenge,
    isBusy: userIsInActiveBattle,
    isBanned: async (userId) => isBattleBanned(await battleBanUntil(userId), new Date()),
    pickProblem: pickRandomApprovedProblem,
    activateBattle: async (id, fields) => {
      const updated = await getDb()
        .update(battles)
        .set({
          status: 'matched',
          problemId: fields.problemId,
          readyDeadline: fields.readyDeadline,
          matchedAt: fields.matchedAt,
        })
        .where(and(eq(battles.id, id), eq(battles.status, 'challenged')))
        .returning({ id: battles.id });
      return updated.length === 1 ? 'ok' : 'conflict';
    },
  };

  const result = await acceptChallenge(deps, identity.userId, battleId, new Date());
  if (!result.ok) {
    return { status: 'error', message: ACCEPT_ERROR_LABELS[result.error] ?? 'Accept failed.' };
  }
  revalidatePath('/battles');
  redirect(`/battles/${result.battleId}`);
}

export async function declineChallengeAction(battleId: string): Promise<void> {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const deps: DeclineChallengeDeps = {
    loadChallenge,
    voidBattle: async (id) => {
      await settleBattle(makeResolveBattleDeps(), id, { kind: 'void' }, []);
    },
  };

  await declineChallenge(deps, identity.userId, battleId);
  revalidatePath('/battles');
}
