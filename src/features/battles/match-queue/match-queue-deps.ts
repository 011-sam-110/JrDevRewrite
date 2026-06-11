import {
  claimQueuePair,
  loadQueueTickets,
  pickRandomApprovedProblem,
} from '../../../infra/db/battle-queries';
import type { MatchQueueDeps } from './match-queue';

/**
 * Real DB wiring for the matchmaking tick. Relative imports so the realtime
 * service entry (tsx) can run it — the same constraint as tick-pools.
 */
export function makeMatchQueueDeps(): MatchQueueDeps {
  return {
    loadQueue: loadQueueTickets,
    pickProblem: pickRandomApprovedProblem,
    createMatchedBattle: claimQueuePair,
    now: () => new Date(),
  };
}
