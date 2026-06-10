import { describe, expect, it } from 'vitest';
import { settleWager, type WagerOutcome } from './wager-settlement';

/**
 * PHASE 2 — designed and tested NOW, wired to NOTHING (binding decision:
 * "domain rules — who is owed what on win/draw/void/forfeit — get designed and
 * unit-tested with the rest of the kernel; the money-moving service is Phase 2").
 * No slice, no infra, no UI references this module until wagering ships behind
 * the shared wallet/KYC/escrow/geo-gating build.
 *
 * Amounts are integer MINOR units (pence); rake is basis points and a
 * PARAMETER, not a constant — the rake % is an explicit TBD to resolve before
 * wagering ships.
 */

describe('settleWager — decisive outcomes', () => {
  it('winner takes the pot minus the disclosed rake', () => {
    const result = settleWager(1000, 500, { kind: 'win', winner: 'a' }); // 5% rake
    expect(result).toEqual({ kind: 'paid', payoutA: 1900, payoutB: 0, rake: 100 });
  });

  it('works for either winner', () => {
    const result = settleWager(1000, 500, { kind: 'win', winner: 'b' });
    expect(result).toEqual({ kind: 'paid', payoutA: 0, payoutB: 1900, rake: 100 });
  });

  it('zero rake pays the full pot', () => {
    expect(settleWager(250, 0, { kind: 'win', winner: 'a' })).toEqual({
      kind: 'paid',
      payoutA: 500,
      payoutB: 0,
      rake: 0,
    });
  });

  it('rounds the rake DOWN — the house never takes more than the disclosed rate', () => {
    // pot 666 at 2.5% = 16.65 → rake 16, winner 650.
    const result = settleWager(333, 250, { kind: 'win', winner: 'b' });
    expect(result).toEqual({ kind: 'paid', payoutA: 0, payoutB: 650, rake: 16 });
  });

  it('a forfeit pays the opponent exactly like a win', () => {
    const result = settleWager(1000, 500, { kind: 'forfeit', by: 'a' });
    expect(result).toEqual({ kind: 'paid', payoutA: 0, payoutB: 1900, rake: 100 });
  });
});

describe('settleWager — non-decisive outcomes', () => {
  it('a draw refunds both stakes with NO rake — the house never profits from a non-result', () => {
    expect(settleWager(1000, 500, { kind: 'draw' })).toEqual({
      kind: 'refunded',
      payoutA: 1000,
      payoutB: 1000,
      rake: 0,
    });
  });

  it('a void refunds both stakes with no rake (nothing happened)', () => {
    expect(settleWager(1000, 500, { kind: 'void' })).toEqual({
      kind: 'refunded',
      payoutA: 1000,
      payoutB: 1000,
      rake: 0,
    });
  });

  it('a flagged result HOLDS the payout pending review — no money moves', () => {
    expect(settleWager(1000, 500, { kind: 'flagged' })).toEqual({ kind: 'held' });
  });
});

describe('settleWager — conservation invariant', () => {
  it('every settled outcome conserves the pot: payouts + rake === both stakes', () => {
    const outcomes: WagerOutcome[] = [
      { kind: 'win', winner: 'a' },
      { kind: 'win', winner: 'b' },
      { kind: 'forfeit', by: 'a' },
      { kind: 'forfeit', by: 'b' },
      { kind: 'draw' },
      { kind: 'void' },
    ];
    for (const stake of [0, 1, 7, 100, 333, 1000, 99_999]) {
      for (const rakeBps of [0, 1, 250, 500, 9_999, 10_000]) {
        for (const outcome of outcomes) {
          const result = settleWager(stake, rakeBps, outcome);
          if (result.kind === 'held') throw new Error('settled outcomes never hold');
          expect(
            result.payoutA + result.payoutB + result.rake,
            `stake=${stake} rake=${rakeBps} outcome=${outcome.kind}`,
          ).toBe(2 * stake);
        }
      }
    }
  });

  it('payouts are never negative and never integer-fractional', () => {
    const result = settleWager(333, 333, { kind: 'win', winner: 'a' });
    if (result.kind !== 'paid') throw new Error('expected paid');
    expect(result.payoutA).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.payoutA)).toBe(true);
    expect(Number.isInteger(result.rake)).toBe(true);
  });
});

describe('settleWager — validation (money rules fail loudly)', () => {
  it('throws on a negative or fractional stake', () => {
    expect(() => settleWager(-1, 500, { kind: 'draw' })).toThrow();
    expect(() => settleWager(10.5, 500, { kind: 'draw' })).toThrow();
  });

  it('throws on a rake outside [0, 10000] basis points or fractional', () => {
    expect(() => settleWager(100, -1, { kind: 'draw' })).toThrow();
    expect(() => settleWager(100, 10_001, { kind: 'draw' })).toThrow();
    expect(() => settleWager(100, 2.5, { kind: 'draw' })).toThrow();
  });
});
