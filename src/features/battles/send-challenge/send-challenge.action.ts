'use server';

import { and, eq, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isBattleBanned } from '@/domain/battles';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { battleBanUntil, userByHandle } from '@/infra/db/battle-queries';
import { battles } from '@/infra/db/schema';
import { settleBattle } from '../resolve-battle/resolve-battle';
import { makeResolveBattleDeps } from '../resolve-battle/settle-deps';
import {
  cancelChallenge,
  sendChallenge,
  type CancelChallengeDeps,
  type SendChallengeDeps,
} from './send-challenge';

export type ChallengeActionState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; message: string };

const SEND_ERROR_LABELS: Record<string, string> = {
  'invalid-target': 'Enter a handle (or paste a profile link).',
  'opponent-not-found': 'No player with that handle.',
  'self-challenge': "You can't challenge yourself.",
  'already-pending': 'There is already a pending challenge between you two.',
  banned: 'You are battle-banned right now.',
};

export async function sendChallengeAction(
  _prev: ChallengeActionState,
  formData: FormData,
): Promise<ChallengeActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  const deps: SendChallengeDeps = {
    isBanned: async (userId) => isBattleBanned(await battleBanUntil(userId), new Date()),
    resolveOpponent: (handle) => userByHandle(handle),
    hasPendingChallenge: async (challengerId, opponentId) => {
      const [row] = await getDb()
        .select({ id: battles.id })
        .from(battles)
        .where(
          and(
            eq(battles.status, 'challenged'),
            or(
              and(eq(battles.playerAId, challengerId), eq(battles.playerBId, opponentId)),
              and(eq(battles.playerAId, opponentId), eq(battles.playerBId, challengerId)),
            ),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    createChallenge: async (challengerId, opponentId) => {
      const [row] = await getDb()
        .insert(battles)
        .values({
          status: 'challenged',
          source: 'challenge',
          playerAId: challengerId,
          playerBId: opponentId,
        })
        .returning({ battleId: battles.id });
      if (!row) throw new Error('challenge insert returned no row');
      return row;
    },
  };

  const result = await sendChallenge(deps, identity.userId, String(formData.get('target') ?? ''));
  if (!result.ok) {
    return { status: 'error', message: SEND_ERROR_LABELS[result.error] ?? 'Challenge failed.' };
  }
  revalidatePath('/battles');
  return { status: 'sent' };
}

export async function cancelChallengeAction(battleId: string): Promise<void> {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const deps: CancelChallengeDeps = {
    loadChallenge: async (id) => {
      const row = await getDb().query.battles.findFirst({ where: eq(battles.id, id) });
      return row
        ? { status: row.status, playerAId: row.playerAId, playerBId: row.playerBId }
        : null;
    },
    voidBattle: async (id) => {
      await settleBattle(makeResolveBattleDeps(), id, { kind: 'void' }, []);
    },
  };

  await cancelChallenge(deps, identity.userId, battleId);
  revalidatePath('/battles');
}
