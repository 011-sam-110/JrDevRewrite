import { describe, expect, it } from 'vitest';
import {
  buildPoolView,
  timeLeftLabel,
  type BrowseContext,
  type BrowsePoolRow,
} from './browse-pools';

/**
 * The listing and the join button must agree on who may join what — so the
 * view model carries the kernel's checkJoin verdict, computed ONCE here and
 * rendered everywhere. These tests cover the assembly, not the guards
 * (those live in domain/prize-pools/entry.test.ts).
 */

const NOW = new Date('2026-07-01T12:00:00Z');

function row(overrides: Partial<BrowsePoolRow> = {}): BrowsePoolRow {
  return {
    id: 'pool-1',
    slug: 'be-test-pool',
    title: 'Test Pool',
    role: 'backend',
    difficulty: 'beginner',
    status: 'published',
    brief: 'Build a thing.',
    requirements: ['Do it well'],
    joinDeadline: new Date('2026-07-03T12:00:00Z'),
    buildDeadline: new Date('2026-07-10T12:00:00Z'),
    judgingDeadline: new Date('2026-07-13T12:00:00Z'),
    entrantCount: 4,
    entrantCap: 30,
    minEntrants: 6,
    ...overrides,
  };
}

function ctx(overrides: Partial<BrowseContext> = {}): BrowseContext {
  return {
    jobRole: 'backend',
    globalRank: 0,
    credits: 5,
    activePoolCount: 0,
    joinedPoolIds: new Set<string>(),
    ...overrides,
  };
}

describe('buildPoolView', () => {
  it('an eligible user sees a joinable pool', () => {
    const view = buildPoolView(row(), ctx(), NOW);
    expect(view.joined).toBe(false);
    expect(view.verdict).toEqual({ ok: true });
  });

  it('a joined pool is marked joined and not joinable again', () => {
    const view = buildPoolView(row(), ctx({ joinedPoolIds: new Set(['pool-1']) }), NOW);
    expect(view.joined).toBe(true);
    expect(view.verdict).toEqual({ ok: false, reasons: ['already-entered'] });
  });

  it('a pool without stamped deadlines is never joinable (defensive)', () => {
    const view = buildPoolView(row({ joinDeadline: null }), ctx(), NOW);
    expect(view.verdict).toEqual({ ok: false, reasons: ['pool-not-open'] });
  });

  it('kernel guards flow through (difficulty lock)', () => {
    const view = buildPoolView(row({ difficulty: 'advanced' }), ctx({ globalRank: 0 }), NOW);
    expect(view.verdict).toEqual({ ok: false, reasons: ['difficulty-locked'] });
  });
});

describe('timeLeftLabel', () => {
  it('renders days + hours for long windows', () => {
    expect(timeLeftLabel(NOW, new Date('2026-07-03T15:30:00Z'))).toBe('2d 3h left');
  });

  it('renders hours for sub-day windows', () => {
    expect(timeLeftLabel(NOW, new Date('2026-07-01T18:00:00Z'))).toBe('6h left');
  });

  it('renders minutes inside the final hour', () => {
    expect(timeLeftLabel(NOW, new Date('2026-07-01T12:40:00Z'))).toBe('40m left');
  });

  it('a passed deadline reads as ended', () => {
    expect(timeLeftLabel(NOW, new Date('2026-07-01T11:00:00Z'))).toBe('ended');
  });
});
