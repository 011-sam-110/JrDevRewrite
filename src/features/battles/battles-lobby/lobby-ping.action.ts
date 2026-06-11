'use server';

import { eq } from 'drizzle-orm';
import { getIdentity } from '@/infra/auth';
import { activeBattleIdFor } from '@/infra/db/battle-queries';
import { getDb } from '@/infra/db/client';
import { ensureProfile } from '@/infra/db/profiles';
import { profiles } from '@/infra/db/schema';
import { getLobbyStamp } from './lobby';

export interface LobbyPing {
  /** Redirect target when a battle involving me is in motion. */
  activeBattleId: string | null;
  /** Change fingerprint — the poller refreshes the page only when it moves. */
  stamp: string;
}

/**
 * The lobby heartbeat: touching lastSeenAt IS the presence system ("online" =
 * pinged within the window — deliberately boring for a campus-sized
 * population), and the reply tells the poller whether anything it renders
 * has changed or a match needs an immediate redirect.
 */
export async function lobbyPingAction(): Promise<LobbyPing | null> {
  const identity = await getIdentity();
  if (!identity || identity.status !== 'complete') return null;

  await ensureProfile(identity.userId);
  const now = new Date();
  await getDb()
    .update(profiles)
    .set({ lastSeenAt: now })
    .where(eq(profiles.userId, identity.userId));

  return {
    activeBattleId: await activeBattleIdFor(identity.userId),
    stamp: await getLobbyStamp(identity.userId, now),
  };
}
