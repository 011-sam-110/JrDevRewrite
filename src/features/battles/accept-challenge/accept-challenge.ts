/**
 * accept-challenge — the challengee's moves on a pending challenge.
 *
 * Accept = the `matched` transition: the kernel stamps the ready window
 * (`matchBattle`), a problem is drawn from the approved bank AT THIS INSTANT
 * (match-time problem selection is the binding rule), and the row activates
 * with a CONDITIONAL update (still `challenged`) so a double-accept or an
 * accept racing a cancel loses cleanly. From here the realtime room takes
 * over: both players' lobbies redirect to the battle page, whose first WS
 * join materializes the room from this row.
 *
 * Decline = void through resolve-battle. Nothing happened, nothing is rated.
 */

import { matchBattle, type BattleStatus } from '@/domain/battles';

interface ChallengeRow {
  status: BattleStatus;
  playerAId: string;
  playerBId: string;
  timeLimitSeconds: number;
}

export interface AcceptChallengeDeps {
  loadChallenge(battleId: string): Promise<ChallengeRow | null>;
  /** Any battle in ACTIVE_BATTLE_STATUSES involving this user? */
  isBusy(userId: string): Promise<boolean>;
  /** Draw a random problem from the approved bank. */
  pickProblem(): Promise<{ problemId: string } | null>;
  /** Conditional activation: only a still-`challenged` row matches. */
  activateBattle(
    battleId: string,
    fields: { problemId: string; readyDeadline: Date; matchedAt: Date },
  ): Promise<'ok' | 'conflict'>;
}

export type AcceptChallengeResult =
  | { ok: true; battleId: string }
  | {
      ok: false;
      error: 'not-found' | 'not-yours' | 'not-pending' | 'player-busy' | 'no-problems';
    };

export async function acceptChallenge(
  deps: AcceptChallengeDeps,
  userId: string,
  battleId: string,
  now: Date,
): Promise<AcceptChallengeResult> {
  const challenge = await deps.loadChallenge(battleId);
  if (!challenge) return { ok: false, error: 'not-found' };
  if (challenge.playerBId !== userId) return { ok: false, error: 'not-yours' };
  if (challenge.status !== 'challenged') return { ok: false, error: 'not-pending' };

  // Both seats must be free — a battle in motion blocks a new one.
  const [acceptorBusy, challengerBusy] = await Promise.all([
    deps.isBusy(userId),
    deps.isBusy(challenge.playerAId),
  ]);
  if (acceptorBusy || challengerBusy) return { ok: false, error: 'player-busy' };

  const problem = await deps.pickProblem();
  if (!problem) return { ok: false, error: 'no-problems' };

  const matched = matchBattle(
    {
      status: challenge.status,
      readyDeadline: null,
      readyA: false,
      readyB: false,
      goAt: null,
      timeLimitSeconds: challenge.timeLimitSeconds,
    },
    now,
  );
  if (!matched.ok || matched.battle.readyDeadline === null) {
    return { ok: false, error: 'not-pending' };
  }

  const activated = await deps.activateBattle(battleId, {
    problemId: problem.problemId,
    readyDeadline: matched.battle.readyDeadline,
    matchedAt: now,
  });
  if (activated === 'conflict') return { ok: false, error: 'not-pending' };

  return { ok: true, battleId };
}

export interface DeclineChallengeDeps {
  loadChallenge(battleId: string): Promise<ChallengeRow | null>;
  /** Void via the resolve-battle engine (claims `challenged` → `voided`). */
  voidBattle(battleId: string): Promise<void>;
}

export type DeclineChallengeResult =
  | { ok: true }
  | { ok: false; error: 'not-found' | 'not-yours' | 'not-pending' };

export async function declineChallenge(
  deps: DeclineChallengeDeps,
  userId: string,
  battleId: string,
): Promise<DeclineChallengeResult> {
  const challenge = await deps.loadChallenge(battleId);
  if (!challenge) return { ok: false, error: 'not-found' };
  if (challenge.playerBId !== userId) return { ok: false, error: 'not-yours' };
  if (challenge.status !== 'challenged') return { ok: false, error: 'not-pending' };

  await deps.voidBattle(battleId);
  return { ok: true };
}
