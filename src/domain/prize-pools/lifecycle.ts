/**
 * Prize Pool lifecycle — a TIME-DRIVEN state machine (CLAUDE.md → Prize Pool
 * lifecycle). Transitions are executed by a scheduled job (M5), never ad hoc
 * in request handlers; this module only *decides*. `tickPool` returns the new
 * snapshot plus a list of effects (refunds, notifications, …) as plain data —
 * the calling slice performs them. That split is what makes every guard
 * unit-testable without a DB, queue, or real clock.
 */

export const POOL_STATUSES = [
  'draft',
  'published',
  'extended',
  'building',
  'judging',
  'closed',
  'cancelled',
] as const;

export type PoolStatus = (typeof POOL_STATUSES)[number];

/** Binding v1 decision: a pool needs at least 6 entrants to run. */
export const MIN_ENTRANTS = 6;
/** Default per-pool entrant cap; a pool spec may override it. */
export const DEFAULT_ENTRANT_CAP = 30;
/** Binding v1 decision: exactly one automatic extension of +48h. */
export const EXTENSION_HOURS = 48;
export const MAX_EXTENSIONS = 1;

const EXTENSION_MS = EXTENSION_HOURS * 60 * 60 * 1000;

/**
 * The explicit transition table — the single source of truth for which edges
 * exist. `published → cancelled` is the defensive edge for the unreachable
 * "deadline passed but the extension is already spent" snapshot a crashed job
 * could leave behind; the rules must be total over any persisted state.
 */
export const POOL_TRANSITIONS: Record<PoolStatus, readonly PoolStatus[]> = {
  draft: ['published'],
  published: ['building', 'extended', 'cancelled'],
  extended: ['building', 'cancelled'],
  building: ['judging'],
  judging: ['closed'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: PoolStatus, to: PoolStatus): boolean {
  return POOL_TRANSITIONS[from].includes(to);
}

/** Everything `tickPool` needs to decide the next transition — plain data. */
export interface PoolSnapshot {
  status: PoolStatus;
  /** End of the join window; moved +48h by the one extension. */
  joinDeadline: Date;
  /** End of the build window (submissions due). */
  buildDeadline: Date;
  /** End of the judging window. */
  judgingDeadline: Date;
  entrantCount: number;
  minEntrants: number;
  entrantCap: number;
  extensionsUsed: number;
}

/**
 * Side effects a transition mandates, named as data. The lifecycle job maps
 * each to an infra call; the kernel never performs them.
 */
export type PoolEffect =
  | 'notify-extension'
  | 'refund-credits'
  | 'notify-cancellation'
  | 'assign-judges'
  | 'finalize-results';

export type ApprovalResult =
  | { ok: true; status: 'published' }
  | { ok: false; error: 'not-a-draft' };

/**
 * The one OPERATOR-driven transition: approving a draft (AI-generated and
 * imported specs both land in `draft` — binding v1 rule). Everything after
 * `published` is the clock's job.
 */
export function approvePool(status: PoolStatus): ApprovalResult {
  if (status !== 'draft') return { ok: false, error: 'not-a-draft' };
  return { ok: true, status: 'published' };
}

export type TickResult =
  | { changed: false }
  | { changed: true; pool: PoolSnapshot; effects: PoolEffect[] };

/**
 * Decide the time-driven transition for one pool at `now`, if any. Deadlines
 * are inclusive: `now >= deadline` means the window has ended. Pure — never
 * mutates the input snapshot.
 */
export function tickPool(pool: PoolSnapshot, now: Date): TickResult {
  switch (pool.status) {
    case 'published':
    case 'extended': {
      if (now.getTime() < pool.joinDeadline.getTime()) return { changed: false };
      if (pool.entrantCount >= pool.minEntrants) {
        return { changed: true, pool: { ...pool, status: 'building' }, effects: [] };
      }
      if (pool.status === 'published' && pool.extensionsUsed < MAX_EXTENSIONS) {
        // Shift the WHOLE schedule, not just the join deadline, so the build
        // and judging windows keep their full promised length.
        return {
          changed: true,
          pool: {
            ...pool,
            status: 'extended',
            extensionsUsed: pool.extensionsUsed + 1,
            joinDeadline: new Date(pool.joinDeadline.getTime() + EXTENSION_MS),
            buildDeadline: new Date(pool.buildDeadline.getTime() + EXTENSION_MS),
            judgingDeadline: new Date(pool.judgingDeadline.getTime() + EXTENSION_MS),
          },
          effects: ['notify-extension'],
        };
      }
      return {
        changed: true,
        pool: { ...pool, status: 'cancelled' },
        effects: ['refund-credits', 'notify-cancellation'],
      };
    }
    case 'building': {
      if (now.getTime() < pool.buildDeadline.getTime()) return { changed: false };
      return { changed: true, pool: { ...pool, status: 'judging' }, effects: ['assign-judges'] };
    }
    case 'judging': {
      if (now.getTime() < pool.judgingDeadline.getTime()) return { changed: false };
      return { changed: true, pool: { ...pool, status: 'closed' }, effects: ['finalize-results'] };
    }
    // draft waits for the operator; closed/cancelled are terminal.
    case 'draft':
    case 'closed':
    case 'cancelled':
      return { changed: false };
  }
}

/**
 * Can anyone join this pool right now? (Per-user guards — role, difficulty,
 * the 3-pool cap — live in `entry.ts`; this is the pool-side gate.)
 */
export function isJoinable(pool: PoolSnapshot, now: Date): boolean {
  if (pool.status !== 'published' && pool.status !== 'extended') return false;
  if (now.getTime() >= pool.joinDeadline.getTime()) return false;
  return pool.entrantCount < pool.entrantCap;
}
