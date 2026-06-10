import { describe, expect, it } from 'vitest';
import {
  approvePool,
  canTransition,
  EXTENSION_HOURS,
  isJoinable,
  MAX_EXTENSIONS,
  MIN_ENTRANTS,
  POOL_STATUSES,
  tickPool,
  type PoolSnapshot,
  type PoolStatus,
} from './lifecycle';

/**
 * The pool lifecycle is a TIME-DRIVEN state machine: a cron job (M5) calls
 * `tickPool(pool, now)` and executes whatever decision comes back. The kernel
 * only ever *decides* — effects (`refund-credits`, …) are returned as data so
 * the rules are testable without a DB, queue, or clock. Every transition and
 * every guard below is a binding CLAUDE.md decision.
 */

const JOIN = new Date('2026-07-03T12:00:00Z');
const BUILD = new Date('2026-07-10T12:00:00Z');
const JUDGING = new Date('2026-07-13T12:00:00Z');

const before = (d: Date) => new Date(d.getTime() - 1);
const after = (d: Date) => new Date(d.getTime() + 1);
const plus48h = (d: Date) => new Date(d.getTime() + EXTENSION_HOURS * 60 * 60 * 1000);

function pool(overrides: Partial<PoolSnapshot> = {}): PoolSnapshot {
  return {
    status: 'published',
    joinDeadline: JOIN,
    buildDeadline: BUILD,
    judgingDeadline: JUDGING,
    entrantCount: MIN_ENTRANTS,
    minEntrants: MIN_ENTRANTS,
    entrantCap: 30,
    extensionsUsed: 0,
    ...overrides,
  };
}

describe('approvePool (operator action: draft → published)', () => {
  it('approves a draft', () => {
    expect(approvePool('draft')).toEqual({ ok: true, status: 'published' });
  });

  it.each(POOL_STATUSES.filter((s) => s !== 'draft'))('rejects approval from %s', (status) => {
    expect(approvePool(status)).toEqual({ ok: false, error: 'not-a-draft' });
  });
});

describe('canTransition (the explicit transition table)', () => {
  it('allows only the spec edges', () => {
    expect(canTransition('draft', 'published')).toBe(true);
    expect(canTransition('published', 'building')).toBe(true);
    expect(canTransition('published', 'extended')).toBe(true);
    expect(canTransition('extended', 'building')).toBe(true);
    expect(canTransition('extended', 'cancelled')).toBe(true);
    expect(canTransition('building', 'judging')).toBe(true);
    expect(canTransition('judging', 'closed')).toBe(true);
  });

  it('forbids everything else', () => {
    expect(canTransition('draft', 'building')).toBe(false);
    expect(canTransition('published', 'judging')).toBe(false);
    expect(canTransition('building', 'published')).toBe(false); // no going back
    expect(canTransition('judging', 'building')).toBe(false);
    expect(canTransition('closed', 'published')).toBe(false); // terminal
    expect(canTransition('cancelled', 'published')).toBe(false); // terminal
    expect(canTransition('extended', 'extended')).toBe(false); // one extension only
  });
});

describe('tickPool — published at the join deadline', () => {
  it('does nothing before the join deadline', () => {
    expect(tickPool(pool(), before(JOIN))).toEqual({ changed: false });
  });

  it('fires AT the deadline (now === deadline counts as elapsed)', () => {
    const result = tickPool(pool({ entrantCount: 6 }), JOIN);
    expect(result.changed).toBe(true);
  });

  it('opens the build window when entrants ≥ minimum', () => {
    const result = tickPool(pool({ entrantCount: 6 }), JOIN);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('building');
    expect(result.effects).toEqual([]);
  });

  it('extends once (+48h on every deadline) when under-filled', () => {
    const result = tickPool(pool({ entrantCount: 5 }), JOIN);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('extended');
    expect(result.pool.extensionsUsed).toBe(1);
    // The whole schedule shifts so the build window keeps its full length.
    expect(result.pool.joinDeadline).toEqual(plus48h(JOIN));
    expect(result.pool.buildDeadline).toEqual(plus48h(BUILD));
    expect(result.pool.judgingDeadline).toEqual(plus48h(JUDGING));
    expect(result.effects).toEqual(['notify-extension']);
  });

  it('cancels (defensively) if the extension is somehow already spent', () => {
    // Shouldn't be reachable — extension moves the pool to `extended` — but the
    // rule must be total over any state a crashed job could leave behind.
    const result = tickPool(pool({ entrantCount: 5, extensionsUsed: MAX_EXTENSIONS }), JOIN);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('cancelled');
    expect(result.effects).toEqual(['refund-credits', 'notify-cancellation']);
  });
});

describe('tickPool — extended at the (shifted) join deadline', () => {
  const extended = () => pool({ status: 'extended', extensionsUsed: 1 });

  it('does nothing before the extended deadline', () => {
    expect(tickPool(extended(), before(JOIN))).toEqual({ changed: false });
  });

  it('opens the build window when the extension filled the pool', () => {
    const result = tickPool({ ...extended(), entrantCount: 7 }, JOIN);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('building');
  });

  it('cancels with refund + notification when still under-filled', () => {
    const result = tickPool({ ...extended(), entrantCount: 5 }, JOIN);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('cancelled');
    expect(result.effects).toEqual(['refund-credits', 'notify-cancellation']);
  });
});

describe('tickPool — build and judging windows', () => {
  it('building → judging at the build deadline, triggering judge assignment', () => {
    const result = tickPool(pool({ status: 'building' }), BUILD);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('judging');
    expect(result.effects).toEqual(['assign-judges']);
  });

  it('building holds before its deadline (even though the join deadline passed)', () => {
    expect(tickPool(pool({ status: 'building' }), before(BUILD))).toEqual({ changed: false });
  });

  it('judging → closed at the judging deadline, triggering result finalization', () => {
    const result = tickPool(pool({ status: 'judging' }), JUDGING);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.pool.status).toBe('closed');
    expect(result.effects).toEqual(['finalize-results']);
  });

  it('judging holds before its deadline', () => {
    expect(tickPool(pool({ status: 'judging' }), before(JUDGING))).toEqual({ changed: false });
  });
});

describe('tickPool — states the clock never moves', () => {
  const wayPast = after(JUDGING);

  it.each(['draft', 'closed', 'cancelled'] as PoolStatus[])('%s never ticks', (status) => {
    // draft needs the OPERATOR (approvePool); closed/cancelled are terminal.
    expect(tickPool(pool({ status }), wayPast)).toEqual({ changed: false });
  });

  it('never mutates its input', () => {
    const input = pool({ entrantCount: 5 });
    const frozen = structuredClone(input);
    tickPool(input, JOIN);
    expect(input).toEqual(frozen);
  });
});

describe('isJoinable', () => {
  it('published, before the deadline, below cap → joinable', () => {
    expect(isJoinable(pool(), before(JOIN))).toBe(true);
  });

  it('extended pools are still joinable — the extension exists to fill seats', () => {
    expect(isJoinable(pool({ status: 'extended', extensionsUsed: 1 }), before(JOIN))).toBe(true);
  });

  it.each(['draft', 'building', 'judging', 'closed', 'cancelled'] as PoolStatus[])(
    '%s is not joinable',
    (status) => {
      expect(isJoinable(pool({ status }), before(JOIN))).toBe(false);
    },
  );

  it('closes at the deadline instant (now === deadline → no longer joinable)', () => {
    expect(isJoinable(pool(), JOIN)).toBe(false);
  });

  it('full pool (entrants === cap) is not joinable', () => {
    expect(isJoinable(pool({ entrantCount: 30, entrantCap: 30 }), before(JOIN))).toBe(false);
  });

  it('one seat left is joinable', () => {
    expect(isJoinable(pool({ entrantCount: 29, entrantCap: 30 }), before(JOIN))).toBe(true);
  });
});
