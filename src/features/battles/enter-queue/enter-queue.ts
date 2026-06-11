/**
 * enter-queue — the deliberately simple queue entry (binding: "don't
 * over-tune matchmaking for a campus-sized population"). A queue ticket is
 * one DB row keyed by user; the matchmaking tick (match-queue slice, run by
 * the realtime service) does the pairing. Leaving is always safe — deleting
 * a ticket that was already consumed by a pairing is a no-op.
 */

export interface EnterQueueDeps {
  /** Any battle in ACTIVE_BATTLE_STATUSES involving this user? */
  isBusy(userId: string): Promise<boolean>;
  /** Battle ban in force? (kernel isBattleBanned over the profile — M16). */
  isBanned(userId: string): Promise<boolean>;
  /** Insert the ticket; conflict on the PK is idempotent re-entry. */
  enqueue(userId: string): Promise<void>;
}

export type EnterQueueResult = { ok: true } | { ok: false; error: 'player-busy' | 'banned' };

export async function enterQueue(deps: EnterQueueDeps, userId: string): Promise<EnterQueueResult> {
  if (await deps.isBusy(userId)) return { ok: false, error: 'player-busy' };
  if (await deps.isBanned(userId)) return { ok: false, error: 'banned' };
  await deps.enqueue(userId);
  return { ok: true };
}

export interface LeaveQueueDeps {
  dequeue(userId: string): Promise<void>;
}

export async function leaveQueue(deps: LeaveQueueDeps, userId: string): Promise<{ ok: true }> {
  await deps.dequeue(userId);
  return { ok: true };
}
