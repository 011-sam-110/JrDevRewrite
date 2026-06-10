/**
 * Pool scheduling — durations → deadlines. A spec (manual or AI-drafted) is
 * written before anyone knows when the operator will approve it, so specs
 * carry window DURATIONS; the approve transition converts them into the
 * concrete deadlines `tickPool` runs on, anchored at the publish instant.
 * Pure, so approval logic stays unit-testable without a clock.
 */

/** Window durations from the pool spec, in hours (sub-day test pools allowed). */
export interface PoolWindows {
  joinHours: number;
  buildHours: number;
  judgingHours: number;
}

export interface PoolDeadlines {
  joinDeadline: Date;
  buildDeadline: Date;
  judgingDeadline: Date;
}

const HOUR_MS = 60 * 60 * 1000;

/** Are these windows usable? (Import validation rejects bad ones with detail.) */
export function checkWindows(windows: PoolWindows): boolean {
  return [windows.joinHours, windows.buildHours, windows.judgingHours].every(
    (h) => Number.isFinite(h) && h > 0,
  );
}

/**
 * Lay the three windows end to end from the publish instant: the build window
 * starts when joining ends, judging when building ends — each phase gets its
 * full promised length regardless of when approval happened.
 */
export function schedulePool(windows: PoolWindows, publishedAt: Date): PoolDeadlines {
  if (!checkWindows(windows)) {
    throw new Error('pool windows must be positive finite hours');
  }

  const joinDeadline = new Date(publishedAt.getTime() + windows.joinHours * HOUR_MS);
  const buildDeadline = new Date(joinDeadline.getTime() + windows.buildHours * HOUR_MS);
  const judgingDeadline = new Date(buildDeadline.getTime() + windows.judgingHours * HOUR_MS);
  return { joinDeadline, buildDeadline, judgingDeadline };
}
