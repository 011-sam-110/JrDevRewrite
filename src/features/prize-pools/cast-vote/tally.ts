import {
  aggregateVotes,
  type AggregationResult,
  type Ballot,
  type JudgedEntry,
} from '@/domain/prize-pools';

/**
 * Read: turn a pool's cast ballots into final standings via the M3
 * vote-aggregation kernel. Completion (the judge-to-win filter) is derived from
 * "who cast a ballot" — cast-vote enforces full coverage at write time, so a
 * persisted ballot IS a completed judging duty, nothing more to check here.
 *
 * M8 builds and tests this; M9's close-pool transition consumes it to award XP,
 * rank and the results page. (If a late anti-cheat scan flags an entry after
 * ballots referencing it were cast, the judgeable set and the ballots can drift
 * apart — aggregateVotes throws on that; reconciling it is M9's close concern.)
 */
export interface TallyDeps {
  loadJudgedEntries(poolId: string): Promise<JudgedEntry[]>;
  loadBallots(poolId: string): Promise<Ballot[]>;
}

export async function tallyPool(deps: TallyDeps, poolId: string): Promise<AggregationResult> {
  const entries = await deps.loadJudgedEntries(poolId);
  const ballots = await deps.loadBallots(poolId);
  const completedJudgeIds = ballots.map((b) => b.judgeId);
  return aggregateVotes({ entries, ballots, completedJudgeIds });
}
