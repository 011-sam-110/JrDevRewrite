'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isJobRole } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { entries, pools } from '@/infra/db/schema';
import { getGitHubConnector } from '@/infra/github';
import { getVideoClient } from '@/infra/video';
import {
  submitEntry,
  type DemoVideoInput,
  type EntrySubmissionContext,
  type SubmitEntryDeps,
} from './submit-entry';
import { submitErrorMessage } from './submission-labels';

export type SubmitActionState =
  | { status: 'idle' }
  | { status: 'submitted' }
  | { status: 'error'; message: string };

/** Safety cap on the dev upload path (the real Stream client streams chunks). */
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Thin entry point: authn/onboarding guard, parse the form (repo URL + video
 * File → bytes), wire the real infra adapters, delegate to the slice. No
 * business rules here — those are the kernel's, applied inside submitEntry.
 */
export async function submitEntryAction(
  _prev: SubmitActionState,
  formData: FormData,
): Promise<SubmitActionState> {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete' || !identity.jobRole || !isJobRole(identity.jobRole)) {
    redirect('/onboarding');
  }

  const poolId = String(formData.get('poolId') ?? '');
  const repoUrl = String(formData.get('repoUrl') ?? '').trim();

  const file = formData.get('video');
  let video: DemoVideoInput | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_VIDEO_BYTES) {
      return { status: 'error', message: 'That video is too large (200MB max).' };
    }
    video = {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      data: Buffer.from(await file.arrayBuffer()),
    };
  }

  const deps: SubmitEntryDeps = {
    loadContext: async (userId, id): Promise<EntrySubmissionContext | null> => {
      const pool = await getDb().query.pools.findFirst({ where: eq(pools.id, id) });
      // Without stamped deadlines the pool was never published — nothing to build against.
      if (!pool || !pool.joinDeadline || !pool.buildDeadline) return null;
      const entry = await getDb().query.entries.findFirst({
        where: and(eq(entries.poolId, id), eq(entries.userId, userId)),
      });
      return {
        entryId: entry?.id ?? null,
        pool: {
          status: pool.status,
          buildWindowOpenedAt: pool.joinDeadline,
          buildDeadline: pool.buildDeadline,
        },
        alreadySubmitted: entry?.submittedAt != null,
      };
    },
    verifyRepo: async (url) => {
      const result = await getGitHubConnector().fetchRepoSignals({ repoUrl: url });
      return result.ok
        ? { ok: true, signals: result.signals }
        : { ok: false, reason: result.reason };
    },
    storeVideo: (entryId, v) =>
      getVideoClient().store({
        entryId,
        filename: v.filename,
        contentType: v.contentType,
        data: v.data,
      }),
    recordSubmission: async (sub) => {
      await getDb()
        .update(entries)
        .set({
          repoUrl: sub.repoUrl,
          repoCreatedAt: sub.repoCreatedAt,
          videoId: sub.videoId,
          videoPlaybackUrl: sub.videoPlaybackUrl,
          submittedAt: sub.submittedAt,
        })
        .where(eq(entries.id, sub.entryId));
    },
  };

  const result = await submitEntry(
    deps,
    { userId: identity.userId, poolId, repoUrl, video },
    new Date(),
  );

  if (!result.ok) return { status: 'error', message: submitErrorMessage(result) };

  revalidatePath(`/pools/${poolId}`);
  return { status: 'submitted' };
}
