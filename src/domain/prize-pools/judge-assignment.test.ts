import { describe, expect, it } from 'vitest';
import {
  assignJudges,
  checkAssignmentBallot,
  DEFAULT_REVIEW_SET_SIZE,
  MIN_JUDGEABLE_ENTRIES,
  reviewSetSize,
  type JudgeableForAssignment,
} from './judge-assignment';

/**
 * Peer-judge assignment is the structural backbone of the judging round, so its
 * fairness properties are tested as invariants, not examples:
 *
 * - never your own entry (self-judging impossible by construction),
 * - every judge reviews the same number of entries (out-degree balanced),
 * - every entry is reviewed the same number of times (in-degree balanced —
 *   nobody gets judged by 1 person while a rival gets judged by 6),
 * - deterministic in (entry set, seed) and INDEPENDENT of DB row order, so the
 *   assignment is reproducible and re-running it is idempotent.
 */

function makeEntries(n: number): JudgeableForAssignment[] {
  // ownerId distinct per entry — one judgeable entry per owner per pool (the
  // schema's unique (pool,user) index guarantees this in reality).
  return Array.from({ length: n }, (_, i) => ({
    entryId: `entry-${String(i).padStart(2, '0')}`,
    ownerId: `user-${String(i).padStart(2, '0')}`,
  }));
}

/** Count how many judges were assigned each entry — the coverage histogram. */
function inDegrees(assignments: { judgeId: string; entryIds: string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    for (const id of a.entryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

const ownerOf = (entries: JudgeableForAssignment[]) =>
  new Map(entries.map((e) => [e.ownerId, e.entryId]));

describe('reviewSetSize', () => {
  it('is 0 below the minimum (no comparative ballot is possible)', () => {
    expect(reviewSetSize(0)).toBe(0);
    expect(reviewSetSize(1)).toBe(0);
    expect(reviewSetSize(2)).toBe(0); // a judge would have only 1 non-self entry
    expect(MIN_JUDGEABLE_ENTRIES).toBe(3);
  });

  it('caps at "everyone but you" for small pools, then at the target', () => {
    expect(reviewSetSize(3)).toBe(2); // min(5, 3-1)
    expect(reviewSetSize(4)).toBe(3);
    expect(reviewSetSize(6)).toBe(5);
    expect(reviewSetSize(30)).toBe(DEFAULT_REVIEW_SET_SIZE); // capped at the target
    expect(reviewSetSize(30, 7)).toBe(7);
  });
});

describe('assignJudges — degenerate sizes', () => {
  it('returns no assignments below the minimum', () => {
    expect(assignJudges(makeEntries(0), 'pool')).toEqual([]);
    expect(assignJudges(makeEntries(2), 'pool')).toEqual([]);
  });
});

describe('assignJudges — fairness invariants', () => {
  // Sweep a range incl. the small-pool boundary, the target boundary, odd/even.
  for (const n of [3, 4, 5, 6, 7, 12, 30]) {
    it(`n=${n}: one assignment per entrant, none of their own, balanced both ways`, () => {
      const entries = makeEntries(n);
      const k = reviewSetSize(n);
      const assignments = assignJudges(entries, `pool-${n}`);
      const owners = ownerOf(entries);

      // Exactly one assignment per entrant (judge), no duplicates.
      expect(assignments).toHaveLength(n);
      expect(new Set(assignments.map((a) => a.judgeId)).size).toBe(n);

      for (const a of assignments) {
        // Out-degree balanced: everyone reviews exactly k.
        expect(a.entryIds).toHaveLength(k);
        // No self-judging: the judge's own entry is never in their set.
        expect(a.entryIds).not.toContain(owners.get(a.judgeId));
        // No duplicate targets within a ballot.
        expect(new Set(a.entryIds).size).toBe(k);
      }

      // In-degree balanced: every entry is reviewed by exactly k judges.
      const coverage = inDegrees(assignments);
      expect(coverage.size).toBe(n); // every entry reviewed at least once
      for (const entry of entries) expect(coverage.get(entry.entryId)).toBe(k);
    });
  }
});

describe('assignJudges — determinism & independence', () => {
  it('is deterministic in (entries, seed) — re-running is idempotent', () => {
    const entries = makeEntries(8);
    expect(assignJudges(entries, 'pool-x')).toEqual(assignJudges(entries, 'pool-x'));
  });

  it('does not depend on the order rows arrive in (canonicalised before shuffle)', () => {
    const entries = makeEntries(8);
    const shuffledInput = [...entries].reverse();
    expect(assignJudges(shuffledInput, 'pool-x')).toEqual(assignJudges(entries, 'pool-x'));
  });

  it('different seeds still satisfy every invariant (and usually differ)', () => {
    const entries = makeEntries(10);
    const a = assignJudges(entries, 'seed-a');
    const b = assignJudges(entries, 'seed-b');

    // Both valid: each is a full, balanced, self-free assignment.
    for (const assignment of [a, b]) {
      expect(assignment).toHaveLength(10);
      for (const x of inDegrees(assignment).values()) expect(x).toBe(reviewSetSize(10));
    }
    // The seed actually moves the assignment (anti-gaming): the per-judge sets
    // are not identical across seeds.
    const setsA = JSON.stringify(a.map((x) => [x.judgeId, x.entryIds.slice().sort()]));
    const setsB = JSON.stringify(b.map((x) => [x.judgeId, x.entryIds.slice().sort()]));
    expect(setsA).not.toBe(setsB);
  });
});

describe('checkAssignmentBallot — judging duty is the full assigned set', () => {
  const assigned = ['e1', 'e2', 'e3'];

  it('accepts any ordering of exactly the assigned set', () => {
    expect(checkAssignmentBallot(['e3', 'e1', 'e2'], assigned)).toEqual({ ok: true });
    expect(checkAssignmentBallot(['e1', 'e2', 'e3'], assigned)).toEqual({ ok: true });
  });

  it('rejects an incomplete ranking (judging duty is all-or-nothing)', () => {
    expect(checkAssignmentBallot(['e1', 'e2'], assigned)).toEqual({
      ok: false,
      reasons: ['incomplete'],
    });
  });

  it('rejects ranking an entry you were not assigned', () => {
    expect(checkAssignmentBallot(['e1', 'e2', 'e3', 'e9'], assigned)).toEqual({
      ok: false,
      reasons: ['unassigned-entry'],
    });
  });

  it('rejects a duplicated entry, and collects every violation at once', () => {
    expect(checkAssignmentBallot(['e1', 'e1', 'e2'], assigned)).toEqual({
      ok: false,
      reasons: ['duplicate-entry', 'incomplete'],
    });
  });
});
