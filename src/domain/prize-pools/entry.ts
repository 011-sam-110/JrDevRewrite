/**
 * Entry rules — the per-user guards on joining a pool (CLAUDE.md → pool
 * lifecycle: "guards: role/difficulty eligibility, soft cap 3 concurrent
 * active pools"). Pure, so the join-pool slice (M5) and the listing UI derive
 * the same verdict from the same data instead of each inventing their own.
 */

import type { JobRole } from '../identity';
import { JOIN_CREDIT_COST } from './credits';
import { isJoinable, type PoolStatus, type PoolSnapshot } from './lifecycle';

/** Binding v1 decision: a user may be in at most 3 concurrently active pools. */
export const ACTIVE_POOL_CAP = 3;

/**
 * Which statuses count as "active" for the cap — everything between publish
 * and close. The slice computes `activePoolCount` from THIS list so the
 * definition lives in exactly one place.
 */
export const ACTIVE_POOL_STATUSES: readonly PoolStatus[] = [
  'published',
  'extended',
  'building',
  'judging',
];

/**
 * Difficulty tiers, gated by GLOBAL POOL RANK (binding decision: one global
 * rank drives difficulty gating). Rank movement is the M9 gamification
 * kernel's job; the unlock thresholds here are tunable product numbers, not
 * derived facts — revisit them when M9 defines the rank curve.
 */
export const POOL_DIFFICULTIES = [
  { id: 'beginner', label: 'Beginner', unlockRank: 0 },
  { id: 'intermediate', label: 'Intermediate', unlockRank: 100 },
  { id: 'advanced', label: 'Advanced', unlockRank: 250 },
] as const;

export type PoolDifficulty = (typeof POOL_DIFFICULTIES)[number]['id'];

export function isPoolDifficulty(value: string): value is PoolDifficulty {
  return POOL_DIFFICULTIES.some((d) => d.id === value);
}

export function difficultyUnlocked(globalRank: number, difficulty: PoolDifficulty): boolean {
  const tier = POOL_DIFFICULTIES.find((d) => d.id === difficulty);
  return tier !== undefined && globalRank >= tier.unlockRank;
}

/** The joining user, reduced to exactly what the guards need. */
export interface JoinCandidate {
  jobRole: JobRole;
  /** Global pool rank points (starts at 0; M9 owns movement). */
  globalRank: number;
  /** Pools the user has entered whose status is in ACTIVE_POOL_STATUSES. */
  activePoolCount: number;
  /** Free-credit balance (domain/prize-pools/credits) — joining costs JOIN_CREDIT_COST. */
  credits: number;
  alreadyEntered: boolean;
}

/** The pool being joined — lifecycle fields plus its role/difficulty labels. */
export interface JoinTarget extends Pick<
  PoolSnapshot,
  'status' | 'joinDeadline' | 'entrantCount' | 'entrantCap'
> {
  role: JobRole;
  difficulty: PoolDifficulty;
}

export type JoinRejection =
  | 'pool-not-open'
  | 'join-window-closed'
  | 'pool-full'
  | 'role-mismatch'
  | 'difficulty-locked'
  | 'active-pool-cap-reached'
  | 'insufficient-credits'
  | 'already-entered';

export type JoinCheck = { ok: true } | { ok: false; reasons: JoinRejection[] };

/**
 * Every guard on "may this user join this pool right now". Collects ALL
 * failures (not just the first) so the UI can explain the full picture.
 *
 * v1 keeps role eligibility strict (pool role === user role); softening that
 * (e.g. full-stack joining front-end pools) is a product decision for later.
 */
export function checkJoin(user: JoinCandidate, pool: JoinTarget, now: Date): JoinCheck {
  const reasons: JoinRejection[] = [];

  if (pool.status !== 'published' && pool.status !== 'extended') {
    reasons.push('pool-not-open');
  } else if (now.getTime() >= pool.joinDeadline.getTime()) {
    reasons.push('join-window-closed');
  } else if (pool.entrantCount >= pool.entrantCap) {
    reasons.push('pool-full');
  }

  if (pool.role !== user.jobRole) reasons.push('role-mismatch');
  if (!difficultyUnlocked(user.globalRank, pool.difficulty)) reasons.push('difficulty-locked');
  if (user.activePoolCount >= ACTIVE_POOL_CAP) reasons.push('active-pool-cap-reached');
  if (user.credits < JOIN_CREDIT_COST) reasons.push('insufficient-credits');
  if (user.alreadyEntered) reasons.push('already-entered');

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export { isJoinable };
