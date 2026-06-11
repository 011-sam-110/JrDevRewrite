/**
 * match-queue — the pairing tick. CLAUDE.md pins WHERE this runs: matchmaking
 * lives in the realtime service (not cron), so the dev:ws entry calls this on
 * a short interval. The slice only orchestrates: `pairQueue` (pure) decides
 * who pairs, `matchBattle` (pure) stamps the ready window, and the deps
 * transaction claims both queue rows + creates the battle atomically — if
 * either player left the queue mid-tick the claim conflicts and the pair is
 * dropped, never half-matched.
 */

import { matchBattle, pairQueue, type QueueTicket } from '@/domain/battles';
import { DEFAULT_TIME_LIMIT_SECONDS } from '@/domain/battles';

export interface MatchQueueDeps {
  /** Waiting tickets with fresh Elo, excluding players already in a battle. */
  loadQueue(): Promise<QueueTicket[]>;
  /** Draw a random problem from the approved bank. */
  pickProblem(): Promise<{ problemId: string } | null>;
  /**
   * One transaction: delete BOTH queue rows (conflict if either is gone) and
   * insert the battle already `matched`.
   */
  createMatchedBattle(fields: {
    playerAId: string;
    playerBId: string;
    problemId: string;
    readyDeadline: Date;
    matchedAt: Date;
  }): Promise<'ok' | 'conflict'>;
  now(): Date;
}

export async function matchQueue(deps: MatchQueueDeps): Promise<{ created: number }> {
  const now = deps.now();
  const { pairs } = pairQueue(await deps.loadQueue(), now);

  let created = 0;
  for (const [seeker, opponent] of pairs) {
    const problem = await deps.pickProblem();
    if (!problem) break; // empty bank: pause pairing, consume nobody

    const matched = matchBattle(
      {
        status: 'queued',
        readyDeadline: null,
        readyA: false,
        readyB: false,
        goAt: null,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
      },
      now,
    );
    if (!matched.ok || matched.battle.readyDeadline === null) continue;

    const result = await deps.createMatchedBattle({
      playerAId: seeker.userId, // the longer waiter takes seat a
      playerBId: opponent.userId,
      problemId: problem.problemId,
      readyDeadline: matched.battle.readyDeadline,
      matchedAt: now,
    });
    if (result === 'ok') created++;
  }
  return { created };
}
