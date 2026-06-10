/**
 * Peer-vote aggregation — the SOLE decider of pool results in v1 (binding
 * decision), so its structural defences live here as code, not policy text:
 *
 * - Self-votes are impossible by construction: `checkBallot` rejects any
 *   ranking containing the judge's own entry (used at cast-vote time, M8).
 * - Judge-to-win eligibility: entrants who skipped their judging duty keep
 *   their true standing but are filtered out of the award order.
 * - Determinism: identical votes always produce identical standings, however
 *   the ballots happen to be ordered when they come back from the DB.
 *
 * Scoring is a NORMALIZED Borda count. Judges rank different-sized random
 * subsets, so raw positions aren't comparable; in a ballot of k entries,
 * position i (0 = best) scores (k-1-i)/(k-1) ∈ [0,1], and an entry's score is
 * the mean over the ballots that included it. Ties break by first-place
 * count, then entry id — an arbitrary but stable last resort.
 */

export interface JudgedEntry {
  entryId: string;
  /** The entrant who owns the entry — judges are identified by this id. */
  ownerId: string;
}

export interface Ballot {
  /** ownerId of the judging entrant (every judge is an entrant in v1). */
  judgeId: string;
  /** Entry ids, best first. */
  ranking: string[];
}

export type BallotRejection =
  | 'unknown-judge'
  | 'ranking-too-short'
  | 'unknown-entry'
  | 'duplicate-entry'
  | 'self-vote';

export type BallotCheck = { ok: true } | { ok: false; reasons: BallotRejection[] };

/**
 * Validate one ballot against the pool's judged entries. Collects every
 * violation. A single-entry ranking is rejected because ranking one thing
 * carries no comparative signal (assignment sizing in M8 guarantees ≥ 2).
 */
export function checkBallot(ballot: Ballot, entries: JudgedEntry[]): BallotCheck {
  const reasons: BallotRejection[] = [];
  const entryIds = new Set(entries.map((e) => e.entryId));
  const judgeEntryIds = new Set(
    entries.filter((e) => e.ownerId === ballot.judgeId).map((e) => e.entryId),
  );

  if (!entries.some((e) => e.ownerId === ballot.judgeId)) reasons.push('unknown-judge');
  if (ballot.ranking.length < 2) reasons.push('ranking-too-short');
  if (ballot.ranking.some((id) => !entryIds.has(id))) reasons.push('unknown-entry');
  if (new Set(ballot.ranking).size !== ballot.ranking.length) reasons.push('duplicate-entry');
  if (ballot.ranking.some((id) => judgeEntryIds.has(id))) reasons.push('self-vote');

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export interface Standing {
  entryId: string;
  ownerId: string;
  /** Mean normalized Borda score in [0,1]; 0 if no ballot included the entry. */
  score: number;
  ballotCount: number;
  firstPlaceCount: number;
  eligibleToWin: boolean;
  /** 1-based; ties are fully broken (no shared ranks). */
  rank: number;
}

export interface AggregationResult {
  /** Every entry, award order, with eligibility flagged — the honest table. */
  standings: Standing[];
  /** Entry ids in award order, ineligible entrants skipped (drives XP/badges). */
  finalPlacements: string[];
}

export interface AggregationInput {
  entries: JudgedEntry[];
  ballots: Ballot[];
  /**
   * Entrants who completed their full judging duty — the M8 slice's verdict
   * (it knows the assignments); the kernel takes it as given.
   */
  completedJudgeIds: string[];
}

/**
 * Turn all ballots into final standings. Throws on malformed input — ballots
 * were validated at cast time, so a bad one here means corrupt data, and a
 * loud failure beats silently wrong results.
 */
export function aggregateVotes({
  entries,
  ballots,
  completedJudgeIds,
}: AggregationInput): AggregationResult {
  const seenJudges = new Set<string>();
  for (const ballot of ballots) {
    const check = checkBallot(ballot, entries);
    if (!check.ok) {
      throw new Error(`invalid ballot from judge ${ballot.judgeId}: ${check.reasons.join(', ')}`);
    }
    if (seenJudges.has(ballot.judgeId)) {
      throw new Error(`duplicate ballot from judge ${ballot.judgeId}`);
    }
    seenJudges.add(ballot.judgeId);
  }

  const tallies = new Map(
    entries.map((e) => [e.entryId, { scoreSum: 0, ballotCount: 0, firstPlaceCount: 0 }]),
  );

  // Fold in a fixed order (by judge id) so floating-point accumulation cannot
  // depend on whatever order the DB returned the ballots in.
  const ordered = [...ballots].sort((x, y) => x.judgeId.localeCompare(y.judgeId));
  for (const ballot of ordered) {
    const k = ballot.ranking.length;
    ballot.ranking.forEach((entryId, i) => {
      const tally = tallies.get(entryId)!;
      tally.scoreSum += (k - 1 - i) / (k - 1);
      tally.ballotCount += 1;
      if (i === 0) tally.firstPlaceCount += 1;
    });
  }

  const completed = new Set(completedJudgeIds);
  const unranked = entries.map((entry) => {
    const tally = tallies.get(entry.entryId)!;
    return {
      entryId: entry.entryId,
      ownerId: entry.ownerId,
      score: tally.ballotCount === 0 ? 0 : tally.scoreSum / tally.ballotCount,
      ballotCount: tally.ballotCount,
      firstPlaceCount: tally.firstPlaceCount,
      eligibleToWin: completed.has(entry.ownerId),
    };
  });

  unranked.sort(
    (x, y) =>
      y.score - x.score ||
      y.firstPlaceCount - x.firstPlaceCount ||
      x.entryId.localeCompare(y.entryId),
  );

  const standings: Standing[] = unranked.map((s, i) => ({ ...s, rank: i + 1 }));
  return {
    standings,
    finalPlacements: standings.filter((s) => s.eligibleToWin).map((s) => s.entryId),
  };
}
