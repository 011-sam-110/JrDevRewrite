/**
 * Peer-judge assignment — who reviews whom in the judging round. Binding rules
 * (CLAUDE.md → judging): assignment is RANDOMIZED and ANONYMIZED, each judge
 * gets ~5 of OTHER entrants' submissions, never their own, and "you must
 * complete your judging duty to be eligible to win".
 *
 * The construction is a seeded shuffle into a ring, then a CIRCULANT pairing:
 * judge at ring-position i reviews the k entries immediately following it
 * (offsets 1..k, mod n). Two structural guarantees fall straight out of this:
 *
 *   - self-judging is impossible — offset 0 (yourself) is never assigned, and
 *     k ≤ n-1 means the window never wraps round to you;
 *   - coverage is perfectly fair — every entry is the "next k" of exactly k
 *     judges, so each entry is reviewed exactly k times (balanced in-degree),
 *     while each judge reviews exactly k (balanced out-degree).
 *
 * The randomness (anti-gaming: you can't predict who judges you) comes from the
 * seeded shuffle; seeding from a stable key (the pool id) makes the whole thing
 * DETERMINISTIC, which is what lets the assign-judges slice be idempotent — a
 * re-run produces the identical sets rather than reshuffling everyone.
 *
 * Pure: plain data in, plain data out. No DB, no randomness source but the seed.
 */

/** Target reviews per judge (CLAUDE.md: "a randomized, anonymized set (~5)"). */
export const DEFAULT_REVIEW_SET_SIZE = 5;

/**
 * Fewest judgeable entries for a real round. With 2 entries a judge would have
 * exactly one non-self entry to rank, and ranking one thing carries no
 * comparative signal (vote-aggregation's checkBallot rejects a length-1 ballot).
 * So 3 is the floor — the min-6-entrants pool rule makes hitting it rare.
 */
export const MIN_JUDGEABLE_ENTRIES = 3;

export interface JudgeableForAssignment {
  entryId: string;
  /** The entrant who owns this entry — also their identity as a judge. */
  ownerId: string;
}

export interface JudgeAssignment {
  /** ownerId of the judging entrant. */
  judgeId: string;
  /** Entry ids this judge must rank — anonymised (no owner identity leaks here). */
  entryIds: string[];
}

/** How many entries each judge reviews for a pool of `entryCount` judgeables. */
export function reviewSetSize(entryCount: number, targetSize = DEFAULT_REVIEW_SET_SIZE): number {
  if (entryCount < MIN_JUDGEABLE_ENTRIES) return 0;
  return Math.min(targetSize, entryCount - 1);
}

/** cyrb53-style string → 32-bit seed; stable across runs and platforms. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG in [0,1); enough for a fair shuffle. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Assign every entrant a balanced, self-free, anonymised review set. Returns []
 * when the pool is too small for a comparative round (below MIN_JUDGEABLE_ENTRIES).
 */
export function assignJudges(
  entries: readonly JudgeableForAssignment[],
  seed: string,
  targetSize = DEFAULT_REVIEW_SET_SIZE,
): JudgeAssignment[] {
  const k = reviewSetSize(entries.length, targetSize);
  if (k === 0) return [];

  // Canonicalise by entryId BEFORE shuffling so the result depends only on the
  // entry set and the seed — never on the order the DB handed rows back. (Same
  // discipline as vote-aggregation's fixed fold order.)
  const canonical = [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId));
  const ring = seededShuffle(canonical, mulberry32(hashSeed(seed)));
  const n = ring.length;

  return ring.map((judge, i) => ({
    judgeId: judge.ownerId,
    entryIds: Array.from({ length: k }, (_, off) => ring[(i + 1 + off) % n]!.entryId),
  }));
}

export type AssignmentBallotRejection = 'duplicate-entry' | 'unassigned-entry' | 'incomplete';

export type AssignmentBallotCheck =
  | { ok: true }
  | { ok: false; reasons: AssignmentBallotRejection[] };

/**
 * A judging ballot must rank EXACTLY the judge's assigned set — every assigned
 * entry, nothing else, no repeats. This is the "complete your judging duty"
 * gate that feeds judge-to-win eligibility (an incomplete duty = ineligible).
 * Structural ballot validity (≥2 entries, no self-vote, known entries) is the
 * vote-aggregation kernel's checkBallot; this only checks the assignment fit.
 */
export function checkAssignmentBallot(
  ranking: readonly string[],
  assignedEntryIds: readonly string[],
): AssignmentBallotCheck {
  const reasons: AssignmentBallotRejection[] = [];
  const assigned = new Set(assignedEntryIds);
  const ranked = new Set(ranking);

  if (ranked.size !== ranking.length) reasons.push('duplicate-entry');
  if (ranking.some((id) => !assigned.has(id))) reasons.push('unassigned-entry');
  if (assignedEntryIds.some((id) => !ranked.has(id))) reasons.push('incomplete');

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
