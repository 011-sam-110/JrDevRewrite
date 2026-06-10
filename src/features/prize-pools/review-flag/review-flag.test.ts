import { describe, expect, it, vi } from 'vitest';
import { clearFlag, upholdFlag, type FlaggedEntryRow, type ReviewFlagDeps } from './review-flag';

/**
 * Slice behaviour: the kernel's reviewFlag owns the "only an open flag is
 * reviewable" rule (its edges are in domain/), so these cover the orchestration
 * — the entry is loaded, the right new status is persisted, and nothing is
 * written when the transition is illegal.
 */

const NOW = new Date('2026-07-21T09:00:00Z');

function entry(overrides: Partial<FlaggedEntryRow> = {}): FlaggedEntryRow {
  return { id: 'entry-1', moderationStatus: 'flagged', ...overrides };
}

function makeDeps(row: FlaggedEntryRow | null): ReviewFlagDeps {
  return {
    getEntry: vi.fn(async () => row),
    setModeration: vi.fn(async () => {}),
  };
}

describe('upholdFlag', () => {
  it('confirms a flagged entry → upheld, stamped reviewedAt', async () => {
    const deps = makeDeps(entry());
    expect(await upholdFlag(deps, 'entry-1', NOW)).toEqual({ ok: true });
    expect(deps.setModeration).toHaveBeenCalledExactlyOnceWith('entry-1', 'upheld', NOW);
  });

  it('refuses an entry that was never flagged', async () => {
    const deps = makeDeps(entry({ moderationStatus: 'none' }));
    expect(await upholdFlag(deps, 'entry-1', NOW)).toEqual({ ok: false, error: 'not-flagged' });
    expect(deps.setModeration).not.toHaveBeenCalled();
  });

  it('reports an unknown entry id', async () => {
    const deps = makeDeps(null);
    expect(await upholdFlag(deps, 'ghost', NOW)).toEqual({ ok: false, error: 'not-found' });
    expect(deps.setModeration).not.toHaveBeenCalled();
  });
});

describe('clearFlag', () => {
  it('dismisses a flagged entry → cleared (back in the running)', async () => {
    const deps = makeDeps(entry());
    expect(await clearFlag(deps, 'entry-1', NOW)).toEqual({ ok: true });
    expect(deps.setModeration).toHaveBeenCalledExactlyOnceWith('entry-1', 'cleared', NOW);
  });

  it('refuses to re-review an already-upheld entry', async () => {
    const deps = makeDeps(entry({ moderationStatus: 'upheld' }));
    expect(await clearFlag(deps, 'entry-1', NOW)).toEqual({ ok: false, error: 'not-flagged' });
    expect(deps.setModeration).not.toHaveBeenCalled();
  });
});
