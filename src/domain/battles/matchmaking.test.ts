import { describe, expect, it } from 'vitest';
import {
  allowedEloGap,
  pairQueue,
  QUEUE_BASE_ELO_GAP,
  QUEUE_WIDEN_PER_SECOND,
  type QueueTicket,
} from './matchmaking';

/**
 * The queue pairing rule (CLAUDE.md → binding decisions: "pair queued players,
 * prefer Elo proximity, widen fast"). Deliberately simple — campus-sized
 * population, not a global matchmaker — but the simple rule still has edges
 * worth pinning: proximity beats FIFO adjacency, the gap widens with the
 * SEEKER's wait so nobody queues forever, and the fold is deterministic so
 * the matchmaking tick is idempotent over an unchanged queue.
 */

const NOW = new Date('2026-06-11T12:00:00Z');

function ticket(userId: string, elo: number, waitSeconds = 0): QueueTicket {
  return { userId, elo, enqueuedAt: new Date(NOW.getTime() - waitSeconds * 1000) };
}

describe('allowedEloGap', () => {
  it('starts at the base gap for a fresh ticket', () => {
    expect(allowedEloGap(0)).toBe(QUEUE_BASE_ELO_GAP);
  });

  it('widens linearly with wait time', () => {
    expect(allowedEloGap(10)).toBe(QUEUE_BASE_ELO_GAP + 10 * QUEUE_WIDEN_PER_SECOND);
  });

  it('is monotonically non-decreasing in wait (the "widen fast" invariant)', () => {
    let prev = -Infinity;
    for (let wait = 0; wait <= 120; wait += 7) {
      const gap = allowedEloGap(wait);
      expect(gap).toBeGreaterThanOrEqual(prev);
      prev = gap;
    }
  });
});

describe('pairQueue', () => {
  it('returns nothing for an empty queue', () => {
    expect(pairQueue([], NOW)).toEqual({ pairs: [], waiting: [] });
  });

  it('leaves a lone player waiting', () => {
    const solo = ticket('solo', 1200);
    expect(pairQueue([solo], NOW)).toEqual({ pairs: [], waiting: [solo] });
  });

  it('pairs two players at identical Elo immediately', () => {
    const a = ticket('a', 1200, 5);
    const b = ticket('b', 1200, 0);
    const { pairs, waiting } = pairQueue([a, b], NOW);
    expect(pairs).toEqual([[a, b]]);
    expect(waiting).toEqual([]);
  });

  it('prefers Elo proximity over queue order', () => {
    // Seeker 1200; the OLDER candidate is 400 away, the newer one is 10 away.
    const seeker = ticket('seeker', 1200, 30);
    const far = ticket('far', 1600, 20);
    const near = ticket('near', 1210, 1);
    const { pairs } = pairQueue([seeker, far, near], NOW);
    expect(pairs).toEqual([[seeker, near]]);
  });

  it('does not pair fresh players outside the base gap', () => {
    const a = ticket('a', 1200, 0);
    const b = ticket('b', 1200 + QUEUE_BASE_ELO_GAP + 1, 0);
    const { pairs, waiting } = pairQueue([a, b], NOW);
    expect(pairs).toEqual([]);
    expect(waiting).toHaveLength(2);
  });

  it('the gap boundary is inclusive, like every deadline in this codebase', () => {
    const a = ticket('a', 1200, 0);
    const b = ticket('b', 1200 + QUEUE_BASE_ELO_GAP, 0);
    expect(pairQueue([a, b], NOW).pairs).toEqual([[a, b]]);
  });

  it('a long wait widens the gap until a distant opponent becomes reachable', () => {
    const gap = QUEUE_BASE_ELO_GAP + 1;
    const fresh = pairQueue([ticket('a', 1200, 0), ticket('b', 1200 + gap, 0)], NOW);
    expect(fresh.pairs).toEqual([]);

    // The same Elo distance pairs once the seeker has waited long enough.
    const waitNeeded = Math.ceil((gap - QUEUE_BASE_ELO_GAP) / QUEUE_WIDEN_PER_SECOND);
    const a = ticket('a', 1200, waitNeeded);
    const b = ticket('b', 1200 + gap, 0);
    expect(pairQueue([a, b], NOW).pairs).toEqual([[a, b]]);
  });

  it('the seeker is the longest waiter — its widened gap is what counts', () => {
    // The newer ticket alone could not reach 1200→1500, but the old seeker can.
    const old = ticket('old', 1200, 60);
    const fresh = ticket('fresh', 1200 + QUEUE_BASE_ELO_GAP + 100, 0);
    expect(allowedEloGap(60)).toBeGreaterThanOrEqual(QUEUE_BASE_ELO_GAP + 100);
    expect(pairQueue([old, fresh], NOW).pairs).toEqual([[old, fresh]]);
  });

  it('pairs greedily from the longest waiter, leaving the odd one out waiting', () => {
    const a = ticket('a', 1200, 30);
    const b = ticket('b', 1205, 20);
    const c = ticket('c', 1198, 10);
    const { pairs, waiting } = pairQueue([a, b, c], NOW);
    // a (longest waiter) seeks first and takes its closest match (c, 2 away).
    expect(pairs).toEqual([[a, c]]);
    expect(waiting).toEqual([b]);
  });

  it('every ticket appears at most once across pairs and waiting', () => {
    const tickets = [
      ticket('a', 1200, 40),
      ticket('b', 1180, 35),
      ticket('c', 1500, 30),
      ticket('d', 1520, 25),
      ticket('e', 900, 5),
    ];
    const { pairs, waiting } = pairQueue(tickets, NOW);
    const seen = [...pairs.flat(), ...waiting].map((t) => t.userId).sort();
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(pairs).toHaveLength(2);
  });

  it('an equidistant tie breaks to the longer waiter, then userId — deterministic', () => {
    const seeker = ticket('seeker', 1200, 50);
    const older = ticket('older', 1210, 20);
    const newer = ticket('newer', 1190, 5);
    expect(pairQueue([seeker, older, newer], NOW).pairs).toEqual([[seeker, older]]);

    const twinA = ticket('aa', 1210, 10);
    const twinB = ticket('zz', 1210, 10);
    expect(pairQueue([seeker, twinB, twinA], NOW).pairs).toEqual([[seeker, twinA]]);
  });

  it('is order-independent: a shuffled queue produces the same pairs', () => {
    const tickets = [
      ticket('a', 1200, 40),
      ticket('b', 1180, 35),
      ticket('c', 1500, 30),
      ticket('d', 1520, 25),
      ticket('e', 900, 5),
    ];
    const baseline = pairQueue(tickets, NOW);
    const shuffled = [tickets[3]!, tickets[0]!, tickets[4]!, tickets[2]!, tickets[1]!];
    expect(pairQueue(shuffled, NOW)).toEqual(baseline);
  });

  it('throws on a duplicate userId — a corrupt queue must not silently self-pair', () => {
    const a = ticket('dup', 1200, 10);
    const b = ticket('dup', 1210, 5);
    expect(() => pairQueue([a, b], NOW)).toThrow(/duplicate/i);
  });
});
