import {
  assignJudges,
  type JudgeableForAssignment,
  type JudgeAssignment,
} from '../../../domain/prize-pools';

/**
 * Use-case: generate the judging round's review assignments for a pool. The
 * kernel's `assignJudges` DECIDES the balanced, self-free, anonymised sets; this
 * slice EXECUTES — load the judgeable entries, run the rule (seeded by pool id),
 * persist.
 *
 * Two call sites, one rule: the lifecycle cron fires this at the
 * `building → judging` transition (the proper path), and the judging-page read
 * calls it lazily so a judge can never open the page before their assignment
 * exists (cron timing independence). Both are safe because it's IDEMPOTENT:
 * `hasAssignments` short-circuits the common case, and even a concurrent
 * double-run writes the identical rows (deterministic seed) onto a unique index.
 *
 * Relative imports (no `@/`): this is on the `pools:tick` CLI's tsx import graph.
 */

export interface AssignJudgesDeps {
  /** True once any assignment row exists for the pool — the idempotency guard. */
  hasAssignments(poolId: string): Promise<boolean>;
  /** Submitted, anti-cheat-cleared entries (the kernel's judgeable set). */
  loadJudgeableEntries(poolId: string): Promise<JudgeableForAssignment[]>;
  /** Persist the per-judge sets; insert is conflict-safe on (pool,judge,entry). */
  saveAssignments(poolId: string, assignments: JudgeAssignment[]): Promise<void>;
}

export interface EnsureAssignmentsResult {
  /** Whether this call wrote the assignments (false = already existed or too small). */
  created: boolean;
  /** Number of judges assigned (0 when nothing was created). */
  judges: number;
}

export async function ensurePoolAssignments(
  deps: AssignJudgesDeps,
  poolId: string,
): Promise<EnsureAssignmentsResult> {
  if (await deps.hasAssignments(poolId)) return { created: false, judges: 0 };

  const entries = await deps.loadJudgeableEntries(poolId);
  const assignments = assignJudges(entries, poolId);
  // [] means the pool is below MIN_JUDGEABLE_ENTRIES — no comparative round is
  // possible. Leave it unassigned; close-pool (M9) decides what a degenerate
  // judging round yields.
  if (assignments.length === 0) return { created: false, judges: 0 };

  await deps.saveAssignments(poolId, assignments);
  return { created: true, judges: assignments.length };
}
