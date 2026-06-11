/**
 * send-challenge — the primary battle entry path (binding decision: direct
 * challenges by username/link). Creates a battle row in `challenged`; the
 * opponent's accept (accept-challenge slice) is what runs the kernel's
 * `matchBattle`. Cancelling a still-pending challenge voids it through the
 * resolve-battle engine — nothing happened, nothing is rated.
 */

import type { BattleStatus } from '@/domain/battles';

const HANDLE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/**
 * What students will paste: a bare handle, `@handle`, or a profile link
 * (`…/u/handle`). Returns the normalized handle, or null when the input names
 * nothing challengeable.
 */
export function parseChallengeTarget(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const linkMatch = /\/u\/([^/?#\s]+)/.exec(trimmed);
  const candidate = linkMatch?.[1] ?? trimmed.replace(/^@/, '');
  return HANDLE_RE.test(candidate) ? candidate : null;
}

export interface SendChallengeDeps {
  /** Battle ban in force for this user? (kernel isBattleBanned over the profile). */
  isBanned(userId: string): Promise<boolean>;
  /** Look the handle up case-insensitively against linked GitHub usernames. */
  resolveOpponent(handle: string): Promise<{ userId: string } | null>;
  /** Is there already a `challenged` battle between this pair (either way)? */
  hasPendingChallenge(challengerId: string, opponentId: string): Promise<boolean>;
  createChallenge(challengerId: string, opponentId: string): Promise<{ battleId: string }>;
}

export type SendChallengeResult =
  | { ok: true; battleId: string }
  | {
      ok: false;
      error:
        | 'invalid-target'
        | 'opponent-not-found'
        | 'self-challenge'
        | 'already-pending'
        | 'banned';
    };

export async function sendChallenge(
  deps: SendChallengeDeps,
  challengerId: string,
  target: string,
): Promise<SendChallengeResult> {
  const handle = parseChallengeTarget(target);
  if (!handle) return { ok: false, error: 'invalid-target' };

  // The M16 sanction guard: a battle-banned player can't open ANY entry path.
  if (await deps.isBanned(challengerId)) return { ok: false, error: 'banned' };

  const opponent = await deps.resolveOpponent(handle);
  if (!opponent) return { ok: false, error: 'opponent-not-found' };
  if (opponent.userId === challengerId) return { ok: false, error: 'self-challenge' };

  if (await deps.hasPendingChallenge(challengerId, opponent.userId)) {
    return { ok: false, error: 'already-pending' };
  }

  const { battleId } = await deps.createChallenge(challengerId, opponent.userId);
  return { ok: true, battleId };
}

export interface CancelChallengeDeps {
  loadChallenge(
    battleId: string,
  ): Promise<{ status: BattleStatus; playerAId: string; playerBId: string } | null>;
  /** Void via the resolve-battle engine (claims `challenged` → `voided`). */
  voidBattle(battleId: string): Promise<void>;
}

export type CancelChallengeResult =
  | { ok: true }
  | { ok: false; error: 'not-found' | 'not-yours' | 'not-pending' };

export async function cancelChallenge(
  deps: CancelChallengeDeps,
  userId: string,
  battleId: string,
): Promise<CancelChallengeResult> {
  const challenge = await deps.loadChallenge(battleId);
  if (!challenge) return { ok: false, error: 'not-found' };
  if (challenge.playerAId !== userId) return { ok: false, error: 'not-yours' };
  if (challenge.status !== 'challenged') return { ok: false, error: 'not-pending' };

  await deps.voidBattle(battleId);
  return { ok: true };
}
