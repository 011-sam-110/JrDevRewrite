import { describe, expect, it } from 'vitest';
import { checkWindows, schedulePool, type PoolWindows } from './schedule';

const WINDOWS: PoolWindows = { joinHours: 72, buildHours: 168, judgingHours: 72 };
const T0 = new Date('2026-06-10T12:00:00Z');

describe('schedulePool', () => {
  it('lays the three deadlines end to end from the publish instant', () => {
    const deadlines = schedulePool(WINDOWS, T0);

    expect(deadlines.joinDeadline).toEqual(new Date('2026-06-13T12:00:00Z'));
    // Build window starts when the join window ends, not at publish.
    expect(deadlines.buildDeadline).toEqual(new Date('2026-06-20T12:00:00Z'));
    expect(deadlines.judgingDeadline).toEqual(new Date('2026-06-23T12:00:00Z'));
  });

  it('supports sub-day windows (operator test pools)', () => {
    const deadlines = schedulePool({ joinHours: 1, buildHours: 2, judgingHours: 1 }, T0);

    expect(deadlines.joinDeadline).toEqual(new Date('2026-06-10T13:00:00Z'));
    expect(deadlines.buildDeadline).toEqual(new Date('2026-06-10T15:00:00Z'));
    expect(deadlines.judgingDeadline).toEqual(new Date('2026-06-10T16:00:00Z'));
  });

  it('does not mutate the publish instant', () => {
    const from = new Date(T0);
    schedulePool(WINDOWS, from);
    expect(from).toEqual(T0);
  });

  it('throws on non-positive windows (drafts are validated before approval)', () => {
    expect(() => schedulePool({ ...WINDOWS, joinHours: 0 }, T0)).toThrow();
    expect(() => schedulePool({ ...WINDOWS, buildHours: -1 }, T0)).toThrow();
  });
});

describe('checkWindows', () => {
  it('accepts positive finite windows', () => {
    expect(checkWindows(WINDOWS)).toBe(true);
  });

  it.each([
    ['zero', { joinHours: 0, buildHours: 168, judgingHours: 72 }],
    ['negative', { joinHours: 72, buildHours: -168, judgingHours: 72 }],
    ['NaN', { joinHours: 72, buildHours: 168, judgingHours: NaN }],
    ['infinite', { joinHours: Infinity, buildHours: 168, judgingHours: 72 }],
  ])('rejects %s windows', (_label, windows) => {
    expect(checkWindows(windows)).toBe(false);
  });
});
