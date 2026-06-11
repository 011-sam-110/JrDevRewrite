/**
 * Badges / achievements (CLAUDE.md → Gamification: "unlock rules as data + pure
 * predicates"). The catalogue is DATA — a list of definitions, each owning a
 * pure `earned(stats)` predicate — so adding a badge is a data edit, never a new
 * code path, and every unlock is unit-testable without a DB.
 *
 * Two families share the one catalogue: the v1 POOL set (M10) and the BATTLE
 * milestones (M16 — first blood, battle-tested, win streaks, giant-killer).
 * Tiers (bronze / silver / gold) drive the medal colour on the profile and
 * rank nothing — they are display metadata, not a separate rating.
 *
 * The numeric thresholds are tunable product dials. The binding part is the
 * SHAPE: badges are monotonic in the stats (a better record never revokes one),
 * and shipping/placing/winning/persisting each unlock progressively rarer tiers.
 */

import type { BattleXpResult } from './battle-xp';

export type BadgeTier = 'bronze' | 'silver' | 'gold';

/** Everything a badge predicate is allowed to read — a flat, pure snapshot. */
export interface BadgeStats {
  /** Closed pools this user was an entrant of. */
  poolsEntered: number;
  /** Of those, how many shipped a verified, judgeable entry. */
  poolsSubmitted: number;
  /** 1st-place finishes. */
  wins: number;
  /** Top-3 finishes (includes wins). */
  podiums: number;
  /** Current level (gamification/levels). */
  level: number;
  /** Current participation streak (gamification/xp advanceStreak). */
  poolStreak: number;
  /** Global pool-rank points. */
  globalRank: number;
  /** Settled battles this user fought (voids never reach the results table). */
  battlesPlayed: number;
  /** Battle wins (decisive, timeout or by opponent forfeit). */
  battleWins: number;
  /**
   * Best CONSECUTIVE-win run ever, folded from the result history. "Best ever"
   * rather than the current run so the stat itself only grows — a streak badge
   * earned is a streak badge kept.
   */
  bestBattleWinStreak: number;
  /** Wins over an opponent rated GIANT_KILLER_ELO_GAP+ above (the upset). */
  giantKills: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  tier: BadgeTier;
  /** Pure: does this stat snapshot unlock the badge? */
  earned: (stats: BadgeStats) => boolean;
}

/**
 * The catalogue. Ordered roughly by how a player earns them — the profile
 * renders earned ones in this order, then the locked ones as "to unlock".
 */
export const BADGES: readonly BadgeDef[] = [
  {
    id: 'first-pool',
    name: 'First Steps',
    description: 'Entered your first prize pool.',
    tier: 'bronze',
    earned: (s) => s.poolsEntered >= 1,
  },
  {
    id: 'shipper',
    name: 'Shipper',
    description: 'Submitted a verified, judgeable entry — you shipped something real.',
    tier: 'bronze',
    earned: (s) => s.poolsSubmitted >= 1,
  },
  {
    id: 'ranked',
    name: 'On the Board',
    description: 'Earned your first global rank points.',
    tier: 'bronze',
    earned: (s) => s.globalRank >= 1,
  },
  {
    id: 'podium',
    name: 'Podium',
    description: 'Finished in the top 3 of a pool.',
    tier: 'silver',
    earned: (s) => s.podiums >= 1,
  },
  {
    id: 'on-fire',
    name: 'On Fire',
    description: 'Completed 3 pools in an unbroken streak.',
    tier: 'silver',
    earned: (s) => s.poolStreak >= 3,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Competed in 5 pools.',
    tier: 'silver',
    earned: (s) => s.poolsEntered >= 5,
  },
  {
    id: 'champion',
    name: 'Champion',
    description: 'Won a pool outright — 1st place.',
    tier: 'gold',
    earned: (s) => s.wins >= 1,
  },
  {
    id: 'dominant',
    name: 'Dominant',
    description: 'Won 3 pools.',
    tier: 'gold',
    earned: (s) => s.wins >= 3,
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Completed 5 pools in an unbroken streak.',
    tier: 'gold',
    earned: (s) => s.poolStreak >= 5,
  },
  // ----------------------------------------------- battle milestones (M16)
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Won your first live code battle.',
    tier: 'bronze',
    earned: (s) => s.battleWins >= 1,
  },
  {
    id: 'battle-tested',
    name: 'Battle-Tested',
    description: 'Fought 5 live battles — win or lose, you showed up.',
    tier: 'bronze',
    earned: (s) => s.battlesPlayed >= 5,
  },
  {
    id: 'rampage',
    name: 'Rampage',
    description: 'Won 3 battles back-to-back.',
    tier: 'silver',
    earned: (s) => s.bestBattleWinStreak >= 3,
  },
  {
    id: 'giant-killer',
    name: 'Giant-Killer',
    description: 'Beat an opponent rated 150+ Elo above you.',
    tier: 'silver',
    earned: (s) => s.giantKills >= 1,
  },
  {
    id: 'warlord',
    name: 'Warlord',
    description: 'Won 10 live battles.',
    tier: 'gold',
    earned: (s) => s.battleWins >= 10,
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Won 5 battles back-to-back.',
    tier: 'gold',
    earned: (s) => s.bestBattleWinStreak >= 5,
  },
] as const;

/** The badge definitions this stat snapshot has unlocked, in catalogue order. */
export function earnedBadges(stats: BadgeStats): BadgeDef[] {
  return BADGES.filter((b) => b.earned(stats));
}

/** Just the ids of the unlocked badges — convenient for tests/serialization. */
export function earnedBadgeIds(stats: BadgeStats): string[] {
  return earnedBadges(stats).map((b) => b.id);
}

/** One closed-pool outcome for a user — the minimum `badgeStatsFrom` reads. */
export interface ResultSummary {
  /** 1-based placement among eligible finishers, or null if they didn't place. */
  placement: number | null;
  /** Shipped a verified, judgeable entry. */
  submitted: boolean;
}

/** The current profile numbers a badge predicate can read. */
export interface ProfileSummary {
  level: number;
  poolStreak: number;
  globalRank: number;
}

/**
 * One settled battle FOR THIS USER, in chronological order — the row shape
 * battle_results persists (eloBefore pins the rating going in, so the upset
 * gap is computable from the audit trail alone, no replay needed).
 */
export interface BattleResultSummary {
  result: BattleXpResult;
  /** This user's rating before the battle. */
  eloBefore: number;
  /** The opponent's rating before the battle (their results row). */
  opponentEloBefore: number;
}

/** Minimum Elo deficit that makes a win an upset (the giant-killer gap). */
export const GIANT_KILLER_ELO_GAP = 150;

const PODIUM_CUTOFF = 3;

/**
 * Fold a user's closed-pool results + their profile into a `BadgeStats`. Pure:
 * the read model hands in plain rows, this counts them, the predicates judge
 * them. "Losses appear in aggregate stats only" is honoured here — a non-podium
 * placement contributes to `poolsEntered`/`poolsSubmitted` but is never singled
 * out as a loss.
 */
export function badgeStatsFrom(input: {
  profile: ProfileSummary;
  results: ResultSummary[];
  /** Settled battle results in CHRONOLOGICAL order (streaks need the order). */
  battles?: BattleResultSummary[];
}): BadgeStats {
  const { profile, results, battles = [] } = input;
  let poolsSubmitted = 0;
  let wins = 0;
  let podiums = 0;
  for (const r of results) {
    if (r.submitted) poolsSubmitted++;
    if (r.placement === 1) wins++;
    if (r.placement != null && r.placement <= PODIUM_CUTOFF) podiums++;
  }

  let battleWins = 0;
  let bestBattleWinStreak = 0;
  let giantKills = 0;
  let run = 0;
  for (const b of battles) {
    if (b.result === 'win') {
      battleWins++;
      run++;
      if (run > bestBattleWinStreak) bestBattleWinStreak = run;
      if (b.opponentEloBefore - b.eloBefore >= GIANT_KILLER_ELO_GAP) giantKills++;
    } else {
      // Anything that isn't a win — loss, draw, forfeit — ends a WIN streak
      // (a draw spares the participation streak, but it is not a win).
      run = 0;
    }
  }

  return {
    poolsEntered: results.length,
    poolsSubmitted,
    wins,
    podiums,
    level: profile.level,
    poolStreak: profile.poolStreak,
    globalRank: profile.globalRank,
    battlesPlayed: battles.length,
    battleWins,
    bestBattleWinStreak,
    giantKills,
  };
}
