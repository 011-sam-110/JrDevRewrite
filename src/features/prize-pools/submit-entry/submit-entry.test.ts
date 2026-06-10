import { describe, expect, it, vi } from 'vitest';
import {
  submitEntry,
  type DemoVideoInput,
  type EntrySubmissionContext,
  type RepoVerification,
  type SubmitEntryDeps,
} from './submit-entry';

/**
 * Slice behaviour: the kernel's checkSubmissionWindow + checkRepoFreshness are
 * verdicts (their edges are tested in domain/), so these cover the
 * ORCHESTRATION — the right calls happen in the right order, and NOTHING is
 * stored or recorded unless every gate passes.
 */

const NOW = new Date('2026-07-10T12:00:00Z');

function ctx(overrides: Partial<EntrySubmissionContext> = {}): EntrySubmissionContext {
  return {
    entryId: 'entry-1',
    pool: {
      status: 'building',
      buildWindowOpenedAt: new Date('2026-07-05T12:00:00Z'),
      buildDeadline: new Date('2026-07-12T12:00:00Z'),
    },
    alreadySubmitted: false,
    ...overrides,
  };
}

const FRESH: RepoVerification = {
  ok: true,
  signals: {
    createdAt: new Date('2026-07-06T09:00:00Z'),
    pushedAt: [new Date('2026-07-08T18:00:00Z')],
  },
};

const VIDEO: DemoVideoInput = {
  filename: 'demo.webm',
  contentType: 'video/webm',
  data: Buffer.from([1, 2, 3]),
};

function makeDeps(overrides: Partial<SubmitEntryDeps> = {}): SubmitEntryDeps {
  return {
    loadContext: vi.fn(async () => ctx()),
    verifyRepo: vi.fn(async () => FRESH),
    storeVideo: vi.fn(async () => ({ videoId: 'vid-1', playbackUrl: '/.dev/videos/vid-1' })),
    recordSubmission: vi.fn(async () => {}),
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof submitEntry>[1]> = {}) {
  return {
    userId: 'user-1',
    poolId: 'pool-1',
    repoUrl: 'https://github.com/user-1/fresh-build',
    video: VIDEO,
    ...overrides,
  };
}

describe('submitEntry — happy path', () => {
  it('verifies the repo, stores the video, records the submission once', async () => {
    const deps = makeDeps();
    const result = await submitEntry(deps, input(), NOW);

    expect(result).toEqual({ ok: true, videoId: 'vid-1' });
    expect(deps.verifyRepo).toHaveBeenCalledWith('https://github.com/user-1/fresh-build');
    expect(deps.storeVideo).toHaveBeenCalledTimes(1);
    expect(deps.storeVideo).toHaveBeenCalledWith('entry-1', VIDEO);
    expect(deps.recordSubmission).toHaveBeenCalledWith({
      entryId: 'entry-1',
      repoUrl: 'https://github.com/user-1/fresh-build',
      repoCreatedAt: FRESH.ok ? FRESH.signals.createdAt : undefined,
      videoId: 'vid-1',
      videoPlaybackUrl: '/.dev/videos/vid-1',
      submittedAt: NOW,
    });
  });
});

describe('submitEntry — rejections record nothing', () => {
  it('unknown pool → not-found, nothing verified or stored', async () => {
    const deps = makeDeps({ loadContext: vi.fn(async () => null) });
    const result = await submitEntry(deps, input(), NOW);

    expect(result).toEqual({ ok: false, error: 'not-found' });
    expect(deps.verifyRepo).not.toHaveBeenCalled();
    expect(deps.storeVideo).not.toHaveBeenCalled();
    expect(deps.recordSubmission).not.toHaveBeenCalled();
  });

  it('window closed → window error, GitHub never called', async () => {
    const deps = makeDeps({
      loadContext: vi.fn(async () =>
        ctx({
          pool: {
            status: 'judging',
            buildWindowOpenedAt: new Date('2026-07-05T12:00:00Z'),
            buildDeadline: new Date('2026-07-12T12:00:00Z'),
          },
        }),
      ),
    });
    const result = await submitEntry(deps, input(), NOW);

    expect(result).toEqual({ ok: false, error: 'window', reasons: ['build-window-closed'] });
    expect(deps.verifyRepo).not.toHaveBeenCalled();
    expect(deps.storeVideo).not.toHaveBeenCalled();
  });

  it('not an entrant → window error (not-an-entrant)', async () => {
    const deps = makeDeps({ loadContext: vi.fn(async () => ctx({ entryId: null })) });
    const result = await submitEntry(deps, input(), NOW);

    expect(result).toEqual({ ok: false, error: 'window', reasons: ['not-an-entrant'] });
    expect(deps.storeVideo).not.toHaveBeenCalled();
  });

  it('already submitted → window error (already-submitted)', async () => {
    const deps = makeDeps({ loadContext: vi.fn(async () => ctx({ alreadySubmitted: true })) });
    const result = await submitEntry(deps, input(), NOW);

    expect(result).toEqual({ ok: false, error: 'window', reasons: ['already-submitted'] });
    expect(deps.verifyRepo).not.toHaveBeenCalled();
  });

  it('no video → missing-video, GitHub never called', async () => {
    const deps = makeDeps();
    const result = await submitEntry(deps, input({ video: null }), NOW);

    expect(result).toEqual({ ok: false, error: 'missing-video' });
    expect(deps.verifyRepo).not.toHaveBeenCalled();
    expect(deps.storeVideo).not.toHaveBeenCalled();
  });

  it.each(['invalid-url', 'not-found', 'forbidden', 'rate-limited'] as const)(
    'repo verification failure (%s) → repo error, nothing stored',
    async (reason) => {
      const deps = makeDeps({
        verifyRepo: vi.fn(async (): Promise<RepoVerification> => ({ ok: false, reason })),
      });
      const result = await submitEntry(deps, input(), NOW);

      expect(result).toEqual({ ok: false, error: 'repo', reason });
      expect(deps.storeVideo).not.toHaveBeenCalled();
      expect(deps.recordSubmission).not.toHaveBeenCalled();
    },
  );

  it('a stale/prepared repo (predates the window) → not-fresh, nothing stored', async () => {
    const deps = makeDeps({
      verifyRepo: vi.fn(
        async (): Promise<RepoVerification> => ({
          ok: true,
          signals: {
            createdAt: new Date('2026-07-01T00:00:00Z'), // before the window opened
            pushedAt: [new Date('2026-07-08T00:00:00Z')],
          },
        }),
      ),
    });
    const result = await submitEntry(deps, input(), NOW);

    expect(result).toEqual({ ok: false, error: 'not-fresh', flags: ['repo-predates-window'] });
    expect(deps.storeVideo).not.toHaveBeenCalled();
    expect(deps.recordSubmission).not.toHaveBeenCalled();
  });
});
