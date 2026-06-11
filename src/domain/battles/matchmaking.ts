/**
 * Queue matchmaking — the pure pairing rule behind `enter-queue` (CLAUDE.md →
 * binding decisions: "pair queued players, prefer Elo proximity, widen fast").
 * Deliberately simple for a campus-sized population: a greedy fold from the
 * longest waiter, each seeker taking the Elo-closest opponent inside a gap
 * that widens linearly with the seeker's wait. The matchmaking TICK runs in
 * the realtime service (per CLAUDE.md, not cron); this module only decides.
 *
 * Determinism matters: the tick re-runs every few seconds over a mostly
 * unchanged queue, so the same input must produce the same pairs (idempotent
 * pairing, the same posture as the seeded judge assignment in M8).
 */

export interface QueueTicket {
  userId: string;
  /** Battle Elo at pairing time — read fresh by the slice, never cached here. */
  elo: number;
  enqueuedAt: Date;
}

/** Maximum Elo distance a fresh ticket will be paired across. */
export const QUEUE_BASE_ELO_GAP = 150;
/** How much the allowed gap grows per second waited — the "widen fast" dial. */
export const QUEUE_WIDEN_PER_SECOND = 25;

/** The Elo distance a seeker who has waited `waitSeconds` may be paired across. */
export function allowedEloGap(waitSeconds: number): number {
  return QUEUE_BASE_ELO_GAP + Math.max(0, waitSeconds) * QUEUE_WIDEN_PER_SECOND;
}

export interface QueuePairing {
  pairs: [QueueTicket, QueueTicket][];
  waiting: QueueTicket[];
}

/**
 * Pair the queue at `now`. Seekers are taken longest-wait-first; each takes
 * the Elo-closest unpaired opponent within the SEEKER's allowed gap (the
 * longest waiter's patience is what should pay off — a fresh entrant never
 * shrinks an old waiter's reach). Equidistant candidates tie-break to the
 * longer waiter, then lexicographic userId, so the fold is deterministic and
 * order-independent. Throws on duplicate userIds: a corrupt queue must never
 * produce a self-pair.
 */
export function pairQueue(tickets: QueueTicket[], now: Date): QueuePairing {
  const seen = new Set<string>();
  for (const t of tickets) {
    if (seen.has(t.userId)) throw new Error(`duplicate queue ticket for user ${t.userId}`);
    seen.add(t.userId);
  }

  // Longest waiter first; userId breaks enqueue ties so the order is total.
  const ordered = [...tickets].sort(
    (x, y) => x.enqueuedAt.getTime() - y.enqueuedAt.getTime() || (x.userId < y.userId ? -1 : 1),
  );

  const paired = new Set<string>();
  const pairs: [QueueTicket, QueueTicket][] = [];

  for (const seeker of ordered) {
    if (paired.has(seeker.userId)) continue;
    const waitSeconds = (now.getTime() - seeker.enqueuedAt.getTime()) / 1000;
    const gap = allowedEloGap(waitSeconds);

    let best: QueueTicket | null = null;
    for (const candidate of ordered) {
      if (candidate.userId === seeker.userId || paired.has(candidate.userId)) continue;
      if (Math.abs(candidate.elo - seeker.elo) > gap) continue;
      // Closest Elo wins; `ordered` already ranks ties by wait then userId,
      // so the first equally-distant candidate encountered is the right one.
      if (best === null || Math.abs(candidate.elo - seeker.elo) < Math.abs(best.elo - seeker.elo)) {
        best = candidate;
      }
    }

    if (best) {
      paired.add(seeker.userId);
      paired.add(best.userId);
      pairs.push([seeker, best]);
    }
  }

  return { pairs, waiting: ordered.filter((t) => !paired.has(t.userId)) };
}
