import type { PoolStatus } from './lifecycle';

/**
 * Build-window submission rules (M6) — two pure decisions, no I/O:
 *
 *  1. checkSubmissionWindow — the deadline/state gate ("deadline enforced by
 *     the kernel"): a submission is valid only while the pool is `building`,
 *     before the build deadline, from an entrant who hasn't already submitted.
 *
 *  2. checkRepoFreshness — the authenticity anchor (CLAUDE.md → Anti-cheat /
 *     pools): the competition repo must be FRESH (created at/after the build
 *     window opened) and show IN-WINDOW work (≥1 push inside the window). The
 *     inputs are GitHub *server-side* signals only — repo creation time and the
 *     push-event timeline — NEVER client commit timestamps, which are
 *     attacker-set and so worthless as evidence.
 *
 * Keeping both pure is what lets every edge be unit-tested without a DB, a
 * network call, or a real clock; the slice feeds them data read via infra/.
 */

// ── checkSubmissionWindow ──────────────────────────────────────────────────

export interface SubmissionTarget {
  status: PoolStatus;
  /** End of the build window — submissions due (inclusive: at it, it's shut). */
  buildDeadline: Date;
}

export interface SubmissionCandidate {
  isEntrant: boolean;
  alreadySubmitted: boolean;
}

export type SubmissionRejection =
  | 'not-an-entrant'
  | 'build-window-not-open'
  | 'build-window-closed'
  | 'already-submitted';

export type SubmissionWindowCheck = { ok: true } | { ok: false; reasons: SubmissionRejection[] };

/** Statuses the pool moves through before the build window opens. */
const PRE_BUILDING: readonly PoolStatus[] = ['draft', 'published', 'extended'];

/**
 * Collects every failed guard (same shape as checkJoin) so the UI can show the
 * whole story at once rather than one reason at a time.
 */
export function checkSubmissionWindow(
  candidate: SubmissionCandidate,
  target: SubmissionTarget,
  now: Date,
): SubmissionWindowCheck {
  const reasons: SubmissionRejection[] = [];

  if (!candidate.isEntrant) reasons.push('not-an-entrant');
  if (candidate.alreadySubmitted) reasons.push('already-submitted');

  if (target.status !== 'building') {
    reasons.push(
      PRE_BUILDING.includes(target.status) ? 'build-window-not-open' : 'build-window-closed',
    );
  } else if (now.getTime() >= target.buildDeadline.getTime()) {
    // Mirrors tickPool: at `now >= buildDeadline` the pool has moved to judging.
    reasons.push('build-window-closed');
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

// ── checkRepoFreshness ─────────────────────────────────────────────────────

export interface RepoSignals {
  /** GitHub's repo creation timestamp (server-side, not forgeable client-side). */
  createdAt: Date;
  /** Server-side push-event timestamps — when work actually reached GitHub. */
  pushedAt: readonly Date[];
}

export interface BuildWindow {
  /** When the build window opened (the pool entered `building`). */
  openedAt: Date;
  /** When the build window closes (the build deadline). */
  closesAt: Date;
}

export type FreshnessFlag = 'repo-predates-window' | 'no-in-window-pushes';

export type RepoFreshnessVerdict =
  | { ok: true; inWindowPushes: number }
  | { ok: false; flags: FreshnessFlag[] };

/**
 * Fresh = created at/after the window opened (a repo predating the window is
 * the classic "I prepared this earlier" cheat). In-window work = at least one
 * push whose server-side timestamp lands inside [openedAt, closesAt]. Bounds
 * are inclusive on both ends.
 */
export function checkRepoFreshness(repo: RepoSignals, window: BuildWindow): RepoFreshnessVerdict {
  const flags: FreshnessFlag[] = [];

  if (repo.createdAt.getTime() < window.openedAt.getTime()) {
    flags.push('repo-predates-window');
  }

  const open = window.openedAt.getTime();
  const close = window.closesAt.getTime();
  const inWindowPushes = repo.pushedAt.filter((p) => {
    const t = p.getTime();
    return t >= open && t <= close;
  }).length;
  if (inWindowPushes === 0) flags.push('no-in-window-pushes');

  return flags.length === 0 ? { ok: true, inWindowPushes } : { ok: false, flags };
}
