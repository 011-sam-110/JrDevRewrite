import { describe, expect, it } from 'vitest';
import {
  aggregateVotes,
  checkBallot,
  reconcileBallots,
  type Ballot,
  type JudgedEntry,
} from './vote-aggregation';

/**
 * Peer ranked-voting is the SOLE decider of pool results (binding v1 decision),
 * so this module carries the structural defences: self-votes impossible by
 * construction (checkBallot), judge-to-win eligibility (aggregateVotes), and
 * deterministic tie handling so the same votes always produce the same podium.
 *
 * Scoring is a normalized Borda count: in a ballot of k entries, position i
 * (0 = best) scores (k-1-i)/(k-1). Normalizing by ballot size matters because
 * judges see different-sized random sets — a #1 from a 3-entry ballot must
 * weigh the same as a #1 from a 5-entry ballot.
 */

const entries: JudgedEntry[] = [
  { entryId: 'a', ownerId: 'A' },
  { entryId: 'b', ownerId: 'B' },
  { entryId: 'c', ownerId: 'C' },
];
const allOwners = ['A', 'B', 'C'];

describe('checkBallot — structural defences on a single ballot', () => {
  it('accepts a well-formed ballot of other entrants’ entries', () => {
    expect(checkBallot({ judgeId: 'A', ranking: ['b', 'c'] }, entries)).toEqual({ ok: true });
  });

  it('rejects a judge who is not an entrant', () => {
    expect(checkBallot({ judgeId: 'Z', ranking: ['a', 'b'] }, entries)).toEqual({
      ok: false,
      reasons: ['unknown-judge'],
    });
  });

  it('rejects an empty ranking', () => {
    expect(checkBallot({ judgeId: 'A', ranking: [] }, entries)).toEqual({
      ok: false,
      reasons: ['ranking-too-short'],
    });
  });

  it('rejects a single-entry ranking (no comparison = no signal)', () => {
    expect(checkBallot({ judgeId: 'A', ranking: ['b'] }, entries)).toEqual({
      ok: false,
      reasons: ['ranking-too-short'],
    });
  });

  it('rejects unknown entry ids', () => {
    expect(checkBallot({ judgeId: 'A', ranking: ['b', 'nope'] }, entries)).toEqual({
      ok: false,
      reasons: ['unknown-entry'],
    });
  });

  it('rejects duplicate entries in one ranking', () => {
    expect(checkBallot({ judgeId: 'A', ranking: ['b', 'b'] }, entries)).toEqual({
      ok: false,
      reasons: ['duplicate-entry'],
    });
  });

  it('rejects a self-vote — impossible by construction, not by policy', () => {
    expect(checkBallot({ judgeId: 'A', ranking: ['a', 'b'] }, entries)).toEqual({
      ok: false,
      reasons: ['self-vote'],
    });
  });

  it('collects every violation at once', () => {
    expect(checkBallot({ judgeId: 'A', ranking: ['a', 'a'] }, entries)).toEqual({
      ok: false,
      reasons: ['duplicate-entry', 'self-vote'],
    });
  });
});

describe('aggregateVotes — scoring', () => {
  it('produces a decisive ranking from clear ballots', () => {
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['a', 'c'] },
      { judgeId: 'C', ranking: ['a', 'b'] },
    ];
    const { standings, finalPlacements } = aggregateVotes({
      entries,
      ballots,
      completedJudgeIds: allOwners,
    });

    expect(standings).toEqual([
      {
        entryId: 'a',
        ownerId: 'A',
        score: 1,
        ballotCount: 2,
        firstPlaceCount: 2,
        eligibleToWin: true,
        rank: 1,
      },
      {
        entryId: 'b',
        ownerId: 'B',
        score: 0.5,
        ballotCount: 2,
        firstPlaceCount: 1,
        eligibleToWin: true,
        rank: 2,
      },
      {
        entryId: 'c',
        ownerId: 'C',
        score: 0,
        ballotCount: 2,
        firstPlaceCount: 0,
        eligibleToWin: true,
        rank: 3,
      },
    ]);
    expect(finalPlacements).toEqual(['a', 'b', 'c']);
  });

  it('normalizes across ballot sizes — top of a small ballot equals top of a big one', () => {
    const four: JudgedEntry[] = [...entries, { entryId: 'd', ownerId: 'D' }];
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c', 'd'] }, // size 3: scores 1, 0.5, 0
      { judgeId: 'B', ranking: ['a', 'c'] }, // size 2: scores 1, 0
    ];
    const { standings } = aggregateVotes({
      entries: four,
      ballots,
      completedJudgeIds: [...allOwners, 'D'],
    });

    const byId = new Map(standings.map((s) => [s.entryId, s]));
    expect(byId.get('a')?.score).toBe(1); // #1 of a 2-entry ballot
    expect(byId.get('b')?.score).toBe(1); // #1 of a 3-entry ballot — same weight
    expect(byId.get('c')?.score).toBe(0.25); // mean of 0.5 and 0
    expect(byId.get('d')?.score).toBe(0);
  });

  it('an entry no judge saw scores 0 with zero ballots (total, not an error)', () => {
    const four: JudgedEntry[] = [...entries, { entryId: 'd', ownerId: 'D' }];
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['c', 'a'] },
    ];
    const { standings } = aggregateVotes({
      entries: four,
      ballots,
      completedJudgeIds: [...allOwners, 'D'],
    });

    const d = standings.find((s) => s.entryId === 'd');
    expect(d).toMatchObject({ score: 0, ballotCount: 0, firstPlaceCount: 0 });
  });

  it('handles zero ballots overall (every entry ranked, deterministically)', () => {
    const { standings, finalPlacements } = aggregateVotes({
      entries,
      ballots: [],
      completedJudgeIds: allOwners,
    });
    expect(standings.map((s) => s.entryId)).toEqual(['a', 'b', 'c']);
    expect(finalPlacements).toEqual(['a', 'b', 'c']);
  });

  it('empty pool → empty result', () => {
    expect(aggregateVotes({ entries: [], ballots: [], completedJudgeIds: [] })).toEqual({
      standings: [],
      finalPlacements: [],
    });
  });
});

describe('aggregateVotes — deterministic tie handling', () => {
  it('breaks a perfect three-way tie by entry id (documented, stable)', () => {
    // Rock-paper-scissors ballots: everyone scores 0.5 with one first place.
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['c', 'a'] },
      { judgeId: 'C', ranking: ['a', 'b'] },
    ];
    const { standings } = aggregateVotes({ entries, ballots, completedJudgeIds: allOwners });
    expect(standings.map((s) => [s.entryId, s.score, s.rank])).toEqual([
      ['a', 0.5, 1],
      ['b', 0.5, 2],
      ['c', 0.5, 3],
    ]);
  });

  it('equal score breaks by first-place count before entry id', () => {
    const four: JudgedEntry[] = [...entries, { entryId: 'd', ownerId: 'D' }];
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'd'] }, // b: 1 (first), d: 0
      { judgeId: 'B', ranking: ['d', 'c', 'a'] }, // d: 1 (first), c: 0.5, a: 0
      { judgeId: 'C', ranking: ['a', 'b'] }, // a: 1 (first), b: 0
    ];
    // EVERY entry scores 0.5: a (0+1)/2, b (1+0)/2, c 0.5/1, d (0+1)/2.
    // a, b, d each have a first place; c has none — so c sinks below d even
    // though "c" < "d" alphabetically. Firsts decide before the id fallback.
    const { standings } = aggregateVotes({
      entries: four,
      ballots,
      completedJudgeIds: [...allOwners, 'D'],
    });
    expect(standings.map((s) => [s.entryId, s.score, s.firstPlaceCount])).toEqual([
      ['a', 0.5, 1],
      ['b', 0.5, 1],
      ['d', 0.5, 1],
      ['c', 0.5, 0],
    ]);
  });

  it('is independent of ballot input order', () => {
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['c', 'a'] },
      { judgeId: 'C', ranking: ['a', 'b'] },
    ];
    const forward = aggregateVotes({ entries, ballots, completedJudgeIds: allOwners });
    const reversed = aggregateVotes({
      entries,
      ballots: [...ballots].reverse(),
      completedJudgeIds: allOwners,
    });
    expect(reversed).toEqual(forward);
  });
});

describe('aggregateVotes — judge-to-win eligibility', () => {
  it('an entrant who skipped judging duty keeps their standing but cannot win', () => {
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['a', 'c'] },
      { judgeId: 'C', ranking: ['a', 'b'] },
    ];
    // B voted here, but "completed" is the SLICE's verdict (all assigned
    // ballots done) — the kernel takes completedJudgeIds as given.
    const { standings, finalPlacements } = aggregateVotes({
      entries,
      ballots,
      completedJudgeIds: ['A', 'C'],
    });

    const b = standings.find((s) => s.entryId === 'b');
    expect(b).toMatchObject({ rank: 2, eligibleToWin: false });
    // Standings tell the truth; the award order skips the ineligible.
    expect(finalPlacements).toEqual(['a', 'c']);
  });
});

describe('aggregateVotes — refuses corrupt input loudly', () => {
  it('throws on an invalid ballot (results must never be silently wrong)', () => {
    const ballots: Ballot[] = [{ judgeId: 'A', ranking: ['a', 'b'] }]; // self-vote
    expect(() => aggregateVotes({ entries, ballots, completedJudgeIds: allOwners })).toThrow(
      /self-vote/,
    );
  });

  it('throws on two ballots from the same judge', () => {
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'A', ranking: ['c', 'b'] },
    ];
    expect(() => aggregateVotes({ entries, ballots, completedJudgeIds: allOwners })).toThrow(
      /duplicate ballot/,
    );
  });
});

describe('reconcileBallots — absorbs late anti-cheat flags', () => {
  it('leaves clean ballots untouched', () => {
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['c', 'a'] },
    ];
    expect(reconcileBallots(ballots, entries)).toEqual(ballots);
  });

  it('strips an entry that became non-judgeable after the ballot was cast', () => {
    // Judge A ranked [b, c, a]; later c was flagged and excluded → c judgeable no more.
    const judgeable: JudgedEntry[] = [
      { entryId: 'a', ownerId: 'A' },
      { entryId: 'b', ownerId: 'B' },
    ];
    const ballots: Ballot[] = [{ judgeId: 'A', ranking: ['b', 'c', 'a'] }];
    expect(reconcileBallots(ballots, judgeable)).toEqual([{ judgeId: 'A', ranking: ['b', 'a'] }]);
  });

  it('drops a ballot left with fewer than two comparable entries', () => {
    const judgeable: JudgedEntry[] = [
      { entryId: 'a', ownerId: 'A' },
      { entryId: 'b', ownerId: 'B' },
    ];
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] }, // c excluded → only [b] left → dropped
      { judgeId: 'B', ranking: ['a', 'b'] }, // both survive → kept
    ];
    expect(reconcileBallots(ballots, judgeable)).toEqual([{ judgeId: 'B', ranking: ['a', 'b'] }]);
  });

  it('drops a ballot whose judge’s own entry was flagged out of the field', () => {
    // X judged a and b in good faith, but X's own entry was later upheld-flagged,
    // so X no longer owns a judgeable entry. Their tally influence is removed.
    const judgeable: JudgedEntry[] = [
      { entryId: 'a', ownerId: 'A' },
      { entryId: 'b', ownerId: 'B' },
    ];
    const ballots: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'a'] },
      { judgeId: 'X', ranking: ['a', 'b'] }, // X owns the flagged entry → dropped
    ];
    expect(reconcileBallots(ballots, judgeable)).toEqual([{ judgeId: 'A', ranking: ['b', 'a'] }]);
  });

  it('feeds aggregateVotes safely after a flag that would otherwise throw', () => {
    // c is flagged out: the raw ballots reference it (unknown-entry → throw),
    // but reconciled they aggregate cleanly over {a, b}.
    const judgeable: JudgedEntry[] = [
      { entryId: 'a', ownerId: 'A' },
      { entryId: 'b', ownerId: 'B' },
    ];
    const raw: Ballot[] = [
      { judgeId: 'A', ranking: ['b', 'c'] },
      { judgeId: 'B', ranking: ['a', 'c'] },
    ];
    const reconciled = reconcileBallots(raw, judgeable);
    const { finalPlacements } = aggregateVotes({
      entries: judgeable,
      ballots: reconciled,
      completedJudgeIds: ['A', 'B'],
    });
    expect(finalPlacements).toEqual(['a', 'b']);
  });
});
