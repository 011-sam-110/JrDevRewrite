import { describe, expect, it } from 'vitest';
import { ACTIVE_POOL_CAP } from './entry';
import { CREDIT_REASONS, creditDelta, JOIN_CREDIT_COST, STARTING_CREDITS } from './credits';

/**
 * The free-credit policy (PRD §6.9) — every credit movement in the system is
 * one of these reasons, and the signed amount for each comes from ONE pure
 * function so the ledger can never disagree with the policy.
 */

describe('credit policy constants', () => {
  it('joining costs a whole positive number of credits', () => {
    expect(Number.isInteger(JOIN_CREDIT_COST)).toBe(true);
    expect(JOIN_CREDIT_COST).toBeGreaterThan(0);
  });

  it('the starting grant covers a full slate of concurrent pools', () => {
    // A fresh account must be able to reach the active-pool cap without
    // winning anything first — otherwise the cap is a lie for new users.
    expect(STARTING_CREDITS).toBeGreaterThanOrEqual(ACTIVE_POOL_CAP * JOIN_CREDIT_COST);
  });
});

describe('creditDelta — the signed amount per ledger reason', () => {
  it('covers every reason in the vocabulary', () => {
    for (const reason of CREDIT_REASONS) {
      expect(Number.isInteger(creditDelta(reason))).toBe(true);
      expect(creditDelta(reason)).not.toBe(0);
    }
  });

  it('the starting grant credits the full starting balance', () => {
    expect(creditDelta('starting-grant')).toBe(STARTING_CREDITS);
  });

  it('a join debits, and a refund returns exactly what the join took', () => {
    expect(creditDelta('pool-join')).toBeLessThan(0);
    expect(creditDelta('pool-join') + creditDelta('pool-refund')).toBe(0);
  });
});
