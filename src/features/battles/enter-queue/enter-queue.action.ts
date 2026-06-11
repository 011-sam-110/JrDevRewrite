'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { isBattleBanned } from '@/domain/battles';
import { battleBanUntil, userIsInActiveBattle } from '@/infra/db/battle-queries';
import { ensureProfile } from '@/infra/db/profiles';
import { battleQueue } from '@/infra/db/schema';
import { enterQueue, leaveQueue, type EnterQueueDeps } from './enter-queue';

export type QueueActionState =
  | { status: 'idle' }
  | { status: 'queued' }
  | { status: 'left' }
  | { status: 'error'; message: string };

export async function enterQueueAction(): Promise<QueueActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  // The pairing tick reads Elo off the profile row — materialize it first.
  await ensureProfile(identity.userId);

  const deps: EnterQueueDeps = {
    isBusy: userIsInActiveBattle,
    isBanned: async (userId) => isBattleBanned(await battleBanUntil(userId), new Date()),
    enqueue: async (userId) => {
      await getDb().insert(battleQueue).values({ userId }).onConflictDoNothing();
    },
  };

  const result = await enterQueue(deps, identity.userId);
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error === 'banned'
          ? 'You are battle-banned right now.'
          : 'You are already in a battle.',
    };
  }
  revalidatePath('/battles');
  return { status: 'queued' };
}

export async function leaveQueueAction(): Promise<QueueActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  await leaveQueue(
    {
      dequeue: async (userId) => {
        await getDb().delete(battleQueue).where(eq(battleQueue.userId, userId));
      },
    },
    identity.userId,
  );
  revalidatePath('/battles');
  return { status: 'left' };
}
