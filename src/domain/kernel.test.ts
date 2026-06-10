import { describe, expect, it } from 'vitest';

/**
 * Placeholder proving the domain-kernel test harness is wired (M0 acceptance).
 * Real kernel tests (pool state machine, scoring, Elo, ...) replace this from M3 on,
 * written test-first per CLAUDE.md.
 */
describe('domain kernel test harness', () => {
  it('runs under Vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
