/**
 * Wager settlement — PHASE 2, DESIGNED NOW, WIRED TO NOTHING.
 *
 * Binding decision (CLAUDE.md → Real-money & compliance): paid pools and
 * battle wagers ship together in Phase 2 behind one shared wallet/KYC/escrow/
 * geo-gating build, after legal review. The DOMAIN rules — who is owed what on
 * win/draw/void/forfeit — are designed and unit-tested with the rest of the
 * kernel so the money build starts from settled, proven rules; the
 * money-moving service does not exist yet. NOTHING outside this module's tests
 * may reference it until Phase 2 ships.
 *
 * Design decisions encoded here:
 * - Both players stake the SAME amount (stakes are escrowed at the `matched`
 *   transition, symmetric by construction).
 * - Amounts are integer MINOR units (pence); stakes never live raw in our DB —
 *   the escrow provider holds them; these numbers are instructions to it.
 * - Rake is basis points and a PARAMETER: the rake % is an explicit pre-launch
 *   TBD, and a disclosed-rate change must never require a kernel change. The
 *   rake rounds DOWN — the house never takes more than the disclosed rate —
 *   and is only ever taken from a DECIDED match: draws and voids refund both
 *   stakes in full, because the house must not profit from a non-result.
 * - A flagged result HOLDS settlement entirely (binding: "flagged staked
 *   matches automatically hold payout") until the operator review resolves it
 *   to a win/forfeit (or void), which is then settled normally.
 */

import { opponentOf, type PlayerSide } from './lifecycle';

export type WagerOutcome =
  | { kind: 'win'; winner: PlayerSide }
  | { kind: 'forfeit'; by: PlayerSide }
  | { kind: 'draw' }
  | { kind: 'void' }
  | { kind: 'flagged' };

export type WagerSettlement =
  | { kind: 'paid'; payoutA: number; payoutB: number; rake: number }
  | { kind: 'refunded'; payoutA: number; payoutB: number; rake: 0 }
  | { kind: 'held' };

/**
 * Who is owed what. `stakeMinor` is each player's (equal) stake in minor
 * units; `rakeBps` the disclosed rake in basis points (0–10000). Total
 * conservation — payoutA + payoutB + rake === 2 × stake — holds for every
 * settled outcome and is pinned by test; money rules fail loudly on corrupt
 * input rather than rounding their way past it.
 */
export function settleWager(
  stakeMinor: number,
  rakeBps: number,
  outcome: WagerOutcome,
): WagerSettlement {
  if (!Number.isInteger(stakeMinor) || stakeMinor < 0) {
    throw new RangeError('stakeMinor must be a non-negative integer');
  }
  if (!Number.isInteger(rakeBps) || rakeBps < 0 || rakeBps > 10_000) {
    throw new RangeError('rakeBps must be an integer in [0, 10000]');
  }

  switch (outcome.kind) {
    case 'win':
    case 'forfeit': {
      const winner = outcome.kind === 'win' ? outcome.winner : opponentOf(outcome.by);
      const pot = 2 * stakeMinor;
      const rake = Math.floor((pot * rakeBps) / 10_000);
      const winnings = pot - rake;
      return {
        kind: 'paid',
        payoutA: winner === 'a' ? winnings : 0,
        payoutB: winner === 'b' ? winnings : 0,
        rake,
      };
    }
    case 'draw':
    case 'void':
      return { kind: 'refunded', payoutA: stakeMinor, payoutB: stakeMinor, rake: 0 };
    case 'flagged':
      return { kind: 'held' };
  }
}
