import { describe, expect, it } from 'vitest';
import {
  checkRepoFreshness,
  checkSubmissionWindow,
  type BuildWindow,
  type RepoSignals,
  type SubmissionCandidate,
  type SubmissionTarget,
} from './submission';

/**
 * Both rules are pure (CLAUDE.md → the gamification/anti-cheat math is a
 * unit-testable kernel). checkSubmissionWindow is the deadline/state gate;
 * checkRepoFreshness is the authenticity anchor over GitHub's SERVER-SIDE
 * signals. Written before the implementation — every branch covered.
 */

const NOW = new Date('2026-07-10T12:00:00Z');

// ── checkSubmissionWindow ──────────────────────────────────────────────────

function candidate(overrides: Partial<SubmissionCandidate> = {}): SubmissionCandidate {
  return { isEntrant: true, alreadySubmitted: false, ...overrides };
}

function target(overrides: Partial<SubmissionTarget> = {}): SubmissionTarget {
  return {
    status: 'building',
    buildDeadline: new Date('2026-07-12T12:00:00Z'),
    ...overrides,
  };
}

describe('checkSubmissionWindow — accepts', () => {
  it('entrant, building pool, before the deadline, not yet submitted', () => {
    expect(checkSubmissionWindow(candidate(), target(), NOW)).toEqual({ ok: true });
  });

  it('the instant before the deadline still counts', () => {
    const deadline = new Date('2026-07-12T12:00:00Z');
    const justBefore = new Date(deadline.getTime() - 1);
    expect(
      checkSubmissionWindow(candidate(), target({ buildDeadline: deadline }), justBefore),
    ).toEqual({ ok: true });
  });
});

describe('checkSubmissionWindow — rejects', () => {
  it('a non-entrant', () => {
    const result = checkSubmissionWindow(candidate({ isEntrant: false }), target(), NOW);
    expect(result).toEqual({ ok: false, reasons: ['not-an-entrant'] });
  });

  it('an entry already submitted', () => {
    const result = checkSubmissionWindow(candidate({ alreadySubmitted: true }), target(), NOW);
    expect(result).toEqual({ ok: false, reasons: ['already-submitted'] });
  });

  it.each(['draft', 'published', 'extended'] as const)(
    'a pre-building pool (%s) — window not open yet',
    (status) => {
      const result = checkSubmissionWindow(candidate(), target({ status }), NOW);
      expect(result).toEqual({ ok: false, reasons: ['build-window-not-open'] });
    },
  );

  it.each(['judging', 'closed', 'cancelled'] as const)(
    'a post-building pool (%s) — window closed',
    (status) => {
      const result = checkSubmissionWindow(candidate(), target({ status }), NOW);
      expect(result).toEqual({ ok: false, reasons: ['build-window-closed'] });
    },
  );

  it('the deadline is inclusive — at the deadline the window is closed', () => {
    const deadline = new Date('2026-07-12T12:00:00Z');
    const result = checkSubmissionWindow(
      candidate(),
      target({ buildDeadline: deadline }),
      deadline,
    );
    expect(result).toEqual({ ok: false, reasons: ['build-window-closed'] });
  });

  it('collects every failed guard at once', () => {
    const result = checkSubmissionWindow(
      candidate({ isEntrant: false }),
      target({ status: 'judging' }),
      NOW,
    );
    expect(result).toEqual({ ok: false, reasons: ['not-an-entrant', 'build-window-closed'] });
  });
});

// ── checkRepoFreshness ─────────────────────────────────────────────────────

const WINDOW: BuildWindow = {
  openedAt: new Date('2026-07-05T12:00:00Z'),
  closesAt: new Date('2026-07-12T12:00:00Z'),
};

function signals(overrides: Partial<RepoSignals> = {}): RepoSignals {
  return {
    createdAt: new Date('2026-07-05T13:00:00Z'),
    pushedAt: [new Date('2026-07-06T09:00:00Z'), new Date('2026-07-08T18:00:00Z')],
    ...overrides,
  };
}

describe('checkRepoFreshness — accepts', () => {
  it('a fresh repo with in-window pushes, reporting the count', () => {
    expect(checkRepoFreshness(signals(), WINDOW)).toEqual({ ok: true, inWindowPushes: 2 });
  });

  it('a repo created exactly when the window opened (inclusive)', () => {
    const result = checkRepoFreshness(signals({ createdAt: WINDOW.openedAt }), WINDOW);
    expect(result).toEqual({ ok: true, inWindowPushes: 2 });
  });

  it('pushes on the window boundaries both count (inclusive)', () => {
    const result = checkRepoFreshness(
      signals({ pushedAt: [WINDOW.openedAt, WINDOW.closesAt] }),
      WINDOW,
    );
    expect(result).toEqual({ ok: true, inWindowPushes: 2 });
  });
});

describe('checkRepoFreshness — flags', () => {
  it('a repo created before the window opened — the "prepared earlier" cheat', () => {
    const result = checkRepoFreshness(
      signals({ createdAt: new Date('2026-07-05T11:59:59Z') }),
      WINDOW,
    );
    expect(result).toEqual({ ok: false, flags: ['repo-predates-window'] });
  });

  it('no pushes at all — no in-window work to show', () => {
    const result = checkRepoFreshness(signals({ pushedAt: [] }), WINDOW);
    expect(result).toEqual({ ok: false, flags: ['no-in-window-pushes'] });
  });

  it('pushes only before the window opened do not count', () => {
    const result = checkRepoFreshness(
      signals({ pushedAt: [new Date('2026-07-01T09:00:00Z')] }),
      WINDOW,
    );
    expect(result).toEqual({ ok: false, flags: ['no-in-window-pushes'] });
  });

  it('pushes only after the window closed do not count', () => {
    const result = checkRepoFreshness(
      signals({ pushedAt: [new Date('2026-07-13T09:00:00Z')] }),
      WINDOW,
    );
    expect(result).toEqual({ ok: false, flags: ['no-in-window-pushes'] });
  });

  it('both flags raise together when nothing is authentic', () => {
    const result = checkRepoFreshness(
      signals({
        createdAt: new Date('2026-07-01T00:00:00Z'),
        pushedAt: [new Date('2026-07-02T00:00:00Z')],
      }),
      WINDOW,
    );
    expect(result).toEqual({ ok: false, flags: ['repo-predates-window', 'no-in-window-pushes'] });
  });
});
