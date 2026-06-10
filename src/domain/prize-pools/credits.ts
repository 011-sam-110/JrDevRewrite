/**
 * Free-credit policy (PRD §6.9 — the default, non-cash path). Credits are
 * entry tokens, not money: granted once per account, debited by joining a
 * pool, refunded when a pool cancels. Nothing here can become cashable in v1.
 *
 * This module is the single source of the AMOUNTS; the ledger that records
 * movements (infra/db `credit_transactions`) derives every row's amount from
 * `creditDelta`, so the policy and the bookkeeping can't drift apart.
 */

/**
 * One-time grant on first touch. Tunable product number — must stay ≥ the
 * active-pool cap × join cost so a fresh account can fill its slate
 * (enforced by test).
 */
export const STARTING_CREDITS = 5;

/** What one pool entry costs. */
export const JOIN_CREDIT_COST = 1;

export const CREDIT_REASONS = ['starting-grant', 'pool-join', 'pool-refund'] as const;

/** Why a credit moved — the ledger's closed vocabulary. */
export type CreditReason = (typeof CREDIT_REASONS)[number];

/** The signed balance change for each ledger reason. */
export function creditDelta(reason: CreditReason): number {
  switch (reason) {
    case 'starting-grant':
      return STARTING_CREDITS;
    case 'pool-join':
      return -JOIN_CREDIT_COST;
    case 'pool-refund':
      return JOIN_CREDIT_COST;
  }
}
