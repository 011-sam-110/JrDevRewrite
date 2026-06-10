import type { JobRole } from '@/domain/identity';
import {
  checkJoin,
  type JoinCheck,
  type PoolDifficulty,
  type PoolStatus,
} from '@/domain/prize-pools';

/**
 * Use-case: browsing pools. The view model carries the kernel's checkJoin
 * verdict so the listing, the detail page, and the join button all render the
 * SAME answer to "can I join this?" — computed once, never re-derived ad hoc
 * in a component.
 */

export interface BrowsePoolRow {
  id: string;
  slug: string;
  title: string;
  role: JobRole;
  difficulty: PoolDifficulty;
  status: PoolStatus;
  brief: string;
  requirements: string[];
  joinDeadline: Date | null;
  buildDeadline: Date | null;
  judgingDeadline: Date | null;
  entrantCount: number;
  entrantCap: number;
  minEntrants: number;
}

/** The browsing user, reduced to what the verdicts and the header need. */
export interface BrowseContext {
  jobRole: JobRole;
  globalRank: number;
  credits: number;
  activePoolCount: number;
  joinedPoolIds: ReadonlySet<string>;
}

export interface PoolView extends BrowsePoolRow {
  joined: boolean;
  verdict: JoinCheck;
}

export function buildPoolView(row: BrowsePoolRow, ctx: BrowseContext, now: Date): PoolView {
  const joined = ctx.joinedPoolIds.has(row.id);
  const verdict: JoinCheck = row.joinDeadline
    ? checkJoin(
        {
          jobRole: ctx.jobRole,
          globalRank: ctx.globalRank,
          activePoolCount: ctx.activePoolCount,
          credits: ctx.credits,
          alreadyEntered: joined,
        },
        {
          status: row.status,
          role: row.role,
          difficulty: row.difficulty,
          joinDeadline: row.joinDeadline,
          entrantCount: row.entrantCount,
          entrantCap: row.entrantCap,
        },
        now,
      )
    : // No stamped deadlines means the pool was never published — defensive.
      { ok: false, reasons: ['pool-not-open'] };

  return { ...row, joined, verdict };
}

/** "2d 3h left" — coarse on purpose; precision belongs to the deadline itself. */
export function timeLeftLabel(now: Date, deadline: Date): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return 'ended';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
}
