import {
  checkRepoFreshness,
  checkSubmissionWindow,
  type FreshnessFlag,
  type PoolStatus,
  type RepoSignals,
  type SubmissionRejection,
} from '../../../domain/prize-pools';

/**
 * Use-case: an entrant submits their build during the window — link the fresh
 * competition repo (verified) + upload a demo video. The kernel owns both
 * decisions (the window/deadline gate and the repo-freshness anti-cheat anchor);
 * this slice orchestrates read → kernel verdict → verify repo → store video →
 * record, and performs NO side effect until every gate has passed.
 *
 * Verification gates linking on purpose (M6 is the hard check). The softer
 * "passed the basics but looks suspicious" flagging — duplicates, plagiarism —
 * is M7's job and lands on top of the same recorded submission.
 */

export interface SubmissionPoolWindow {
  status: PoolStatus;
  /** When the build window opened (the pool entered `building` — its join deadline). */
  buildWindowOpenedAt: Date;
  buildDeadline: Date;
}

export interface EntrySubmissionContext {
  /** Null when the user hasn't joined this pool — checked via the window gate. */
  entryId: string | null;
  pool: SubmissionPoolWindow;
  alreadySubmitted: boolean;
}

export type RepoVerificationFailure = 'invalid-url' | 'not-found' | 'forbidden' | 'rate-limited';

export type RepoVerification =
  | { ok: true; signals: RepoSignals }
  | { ok: false; reason: RepoVerificationFailure };

export interface DemoVideoInput {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface SubmitEntryDeps {
  /** Pool window/state + this user's entry + submission status; null if no pool. */
  loadContext(userId: string, poolId: string): Promise<EntrySubmissionContext | null>;
  /** Read the repo's server-side signals via infra/github (rate-limit aware). */
  verifyRepo(repoUrl: string): Promise<RepoVerification>;
  /** Persist the demo video via infra/video; returns its stable ref. */
  storeVideo(
    entryId: string,
    video: DemoVideoInput,
  ): Promise<{ videoId: string; playbackUrl: string }>;
  /** Stamp the entry as submitted with the verified repo + video ref. */
  recordSubmission(input: RecordedSubmission): Promise<void>;
}

export interface RecordedSubmission {
  entryId: string;
  repoUrl: string;
  repoCreatedAt: Date;
  videoId: string;
  videoPlaybackUrl: string;
  submittedAt: Date;
}

export interface SubmitEntryInput {
  userId: string;
  poolId: string;
  repoUrl: string;
  video: DemoVideoInput | null;
}

export type SubmitEntryResult =
  | { ok: true; videoId: string }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'missing-video' }
  | { ok: false; error: 'window'; reasons: SubmissionRejection[] }
  | { ok: false; error: 'repo'; reason: RepoVerificationFailure }
  | { ok: false; error: 'not-fresh'; flags: FreshnessFlag[] };

export async function submitEntry(
  deps: SubmitEntryDeps,
  input: SubmitEntryInput,
  now: Date,
): Promise<SubmitEntryResult> {
  const ctx = await deps.loadContext(input.userId, input.poolId);
  if (!ctx) return { ok: false, error: 'not-found' };

  // 1. Kernel gate: right state, before the deadline, an entrant, not a dupe.
  const windowCheck = checkSubmissionWindow(
    { isEntrant: ctx.entryId !== null, alreadySubmitted: ctx.alreadySubmitted },
    { status: ctx.pool.status, buildDeadline: ctx.pool.buildDeadline },
    now,
  );
  if (!windowCheck.ok) return { ok: false, error: 'window', reasons: windowCheck.reasons };

  // A passing window check means isEntrant was true, so entryId is non-null;
  // re-narrow it for the type system (and as defence in depth).
  const entryId = ctx.entryId;
  if (entryId === null) return { ok: false, error: 'window', reasons: ['not-an-entrant'] };

  // No point calling GitHub if there's nothing to upload either way.
  if (!input.video) return { ok: false, error: 'missing-video' };

  // 2. Verify the repo before touching storage — cheap rejections stay cheap.
  const verification = await deps.verifyRepo(input.repoUrl);
  if (!verification.ok) return { ok: false, error: 'repo', reason: verification.reason };

  // 3. Kernel anti-cheat anchor: fresh repo + in-window pushes.
  const freshness = checkRepoFreshness(verification.signals, {
    openedAt: ctx.pool.buildWindowOpenedAt,
    closesAt: ctx.pool.buildDeadline,
  });
  if (!freshness.ok) return { ok: false, error: 'not-fresh', flags: freshness.flags };

  // 4. Only now do the side effects: store the demo, stamp the entry.
  const stored = await deps.storeVideo(entryId, input.video);
  await deps.recordSubmission({
    entryId,
    repoUrl: input.repoUrl,
    repoCreatedAt: verification.signals.createdAt,
    videoId: stored.videoId,
    videoPlaybackUrl: stored.playbackUrl,
    submittedAt: now,
  });
  return { ok: true, videoId: stored.videoId };
}
