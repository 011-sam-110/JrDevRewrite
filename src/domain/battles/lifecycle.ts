/**
 * Live Code Battle lifecycle — an EVENT-driven state machine with three
 * time-driven edges (CLAUDE.md → Live Code Battle lifecycle). Player and judge
 * events arrive through the realtime service and the submit-solution slice
 * (M13/M15), but the realtime layer is TRANSPORT ONLY: a WS message is input
 * that routes through a slice into these rules — it never decides a result.
 * Like the pool kernel, this module only *decides*; every transition returns
 * the new snapshot plus effects-as-data for the owning slice to execute.
 *
 * `challenged`/`queued` → `matched` → `countdown` → `live` → `resolved`,
 * with branch exits `voided` (nothing happened — never any rating change),
 * `forfeited` (opponent wins) and `flagged` (anti-cheat review, M16).
 */

export const BATTLE_STATUSES = [
  'challenged',
  'queued',
  'matched',
  'countdown',
  'live',
  'resolved',
  'voided',
  'forfeited',
  'flagged',
] as const;

export type BattleStatus = (typeof BATTLE_STATUSES)[number];

/** The two seats in a 1v1 — battles are always exactly two players in v1. */
export type PlayerSide = 'a' | 'b';

export function opponentOf(side: PlayerSide): PlayerSide {
  return side === 'a' ? 'b' : 'a';
}

/** How long both players have to signal ready once matched. */
export const READY_WINDOW_SECONDS = 60;
/** Length of the synchronized countdown before the simultaneous "go". */
export const COUNTDOWN_SECONDS = 5;
/**
 * How long a disconnected player has to reconnect before the battle is
 * forfeited. The realtime service (M13) TRACKS the grace clock; the forfeit
 * decision routes back through `forfeitBattle` here.
 */
export const DISCONNECT_GRACE_SECONDS = 30;
/** Default match length; the problem bank (M12) may override per problem. */
export const DEFAULT_TIME_LIMIT_SECONDS = 1800;

/**
 * The explicit transition table — the single source of truth for which edges
 * exist. `voided` is reachable from everything BEFORE the problem reveal
 * (declined/expired challenge, leaving the queue, a no-show, a failure during
 * countdown) because at those points nothing has happened; once `live`, the
 * only exits are `resolved` and `forfeited` — abandoning a revealed problem is
 * a forfeit, never a void. `flagged` is terminal in this kernel; the operator
 * review move lands with the battle anti-cheat slice (M16).
 */
export const BATTLE_TRANSITIONS: Record<BattleStatus, readonly BattleStatus[]> = {
  challenged: ['matched', 'voided'],
  queued: ['matched', 'voided'],
  matched: ['countdown', 'voided'],
  countdown: ['live', 'voided'],
  live: ['resolved', 'forfeited'],
  resolved: ['flagged'],
  forfeited: ['flagged'],
  voided: [],
  flagged: [],
};

export function canTransition(from: BattleStatus, to: BattleStatus): boolean {
  return BATTLE_TRANSITIONS[from].includes(to);
}

/** Everything the lifecycle rules need to decide a transition — plain data. */
export interface BattleSnapshot {
  status: BattleStatus;
  /** Deadline for both ready signals; set when the match is made. */
  readyDeadline: Date | null;
  readyA: boolean;
  readyB: boolean;
  /** The synchronized reveal instant; set when the countdown starts. */
  goAt: Date | null;
  /** Match length — live ends at goAt + timeLimitSeconds. */
  timeLimitSeconds: number;
}

/**
 * Side effects a transition mandates, named as data. The owning slice maps
 * each to an infra/realtime call; the kernel never performs them.
 */
export type BattleEffect =
  | 'start-countdown'
  | 'reveal-problem'
  | 'start-match-timer'
  | 'record-result'
  | 'apply-ratings'
  | 'notify-void'
  | 'notify-review';

export type ForfeitReason = 'disconnect-grace-expired' | 'quit';

type Ok = { ok: true; battle: BattleSnapshot; effects: BattleEffect[] };

export type MatchResult = Ok | { ok: false; error: 'not-pending' };

/**
 * An accepted direct challenge or a queue pairing → `matched`. Phase 2:
 * wagered matches escrow both stakes AT THIS TRANSITION (binding decision) —
 * the escrow effect slots in here when wagering ships; v1 mandates nothing.
 */
export function matchBattle(battle: BattleSnapshot, now: Date): MatchResult {
  if (battle.status !== 'challenged' && battle.status !== 'queued') {
    return { ok: false, error: 'not-pending' };
  }
  return {
    ok: true,
    battle: {
      ...battle,
      status: 'matched',
      readyDeadline: new Date(now.getTime() + READY_WINDOW_SECONDS * 1000),
      readyA: false,
      readyB: false,
    },
    effects: [],
  };
}

export type CancelResult = Ok | { ok: false; error: 'not-pending' };

/**
 * A declined/expired challenge or a player leaving the queue → `voided`.
 * Nothing happened, so nothing is rated or recorded — only notified.
 */
export function cancelPending(battle: BattleSnapshot): CancelResult {
  if (battle.status !== 'challenged' && battle.status !== 'queued') {
    return { ok: false, error: 'not-pending' };
  }
  return { ok: true, battle: { ...battle, status: 'voided' }, effects: ['notify-void'] };
}

export type AbortResult = Ok | { ok: false; error: 'not-before-reveal' };

/**
 * An event-driven void AFTER matching but BEFORE the problem reveal — a player
 * disconnecting during the countdown, or a failure delivering the problem.
 * Nothing has been revealed yet, so nothing is rated or recorded (binding:
 * "no-show before problem reveal → voided"). This is the kernel move behind
 * the matched/countdown → voided event edges; the ready-deadline TIMEOUT void
 * is `tickBattle`'s job. Once `live`, leaving is a forfeit, never a void.
 */
export function abortBeforeReveal(battle: BattleSnapshot): AbortResult {
  if (battle.status !== 'matched' && battle.status !== 'countdown') {
    return { ok: false, error: 'not-before-reveal' };
  }
  return { ok: true, battle: { ...battle, status: 'voided' }, effects: ['notify-void'] };
}

export type ReadyResult = Ok | { ok: false; error: 'not-matched' | 'ready-window-closed' };

/**
 * A player signals ready inside the join window. The SECOND ready starts the
 * countdown, scheduling the synchronized go at now + COUNTDOWN_SECONDS — both
 * clients receive the identical instant, which is what makes the simultaneous
 * reveal a testable correctness property (M13 verifies the transport half).
 * Deadlines are inclusive, as everywhere in this codebase: now === deadline
 * means the window has closed.
 */
export function markReady(battle: BattleSnapshot, side: PlayerSide, now: Date): ReadyResult {
  if (battle.status !== 'matched') return { ok: false, error: 'not-matched' };
  if (battle.readyDeadline !== null && now.getTime() >= battle.readyDeadline.getTime()) {
    return { ok: false, error: 'ready-window-closed' };
  }
  const next = {
    ...battle,
    readyA: battle.readyA || side === 'a',
    readyB: battle.readyB || side === 'b',
  };
  if (next.readyA && next.readyB) {
    return {
      ok: true,
      battle: {
        ...next,
        status: 'countdown',
        goAt: new Date(now.getTime() + COUNTDOWN_SECONDS * 1000),
      },
      effects: ['start-countdown'],
    };
  }
  return { ok: true, battle: next, effects: [] };
}

/** The live window ends at goAt + the time limit; null before the go exists. */
export function liveDeadline(battle: BattleSnapshot): Date | null {
  if (battle.goAt === null) return null;
  return new Date(battle.goAt.getTime() + battle.timeLimitSeconds * 1000);
}

export type TickResult =
  | { changed: false }
  | { changed: true; battle: BattleSnapshot; effects: BattleEffect[] };

/**
 * Decide the time-driven transition for one battle at `now`, if any — the
 * `tickPool` pattern. Three clocks: the ready window (no-show → `voided`, no
 * Elo change — nothing happened), the countdown (goAt fires the go → `live`),
 * and the match time limit (→ `resolved`; the slice then runs the scoring
 * kernel over the submission history). Deadlines inclusive; never mutates.
 */
export function tickBattle(battle: BattleSnapshot, now: Date): TickResult {
  switch (battle.status) {
    case 'matched': {
      if (battle.readyDeadline === null || now.getTime() < battle.readyDeadline.getTime()) {
        return { changed: false };
      }
      if (battle.readyA && battle.readyB) {
        // Unreachable via markReady (the second ready transitions immediately),
        // but the rules must be total over any snapshot a crashed slice could
        // persist — both players showed up, so the battle proceeds.
        return {
          changed: true,
          battle: {
            ...battle,
            status: 'countdown',
            goAt: new Date(now.getTime() + COUNTDOWN_SECONDS * 1000),
          },
          effects: ['start-countdown'],
        };
      }
      return { changed: true, battle: { ...battle, status: 'voided' }, effects: ['notify-void'] };
    }
    case 'countdown': {
      if (battle.goAt === null || now.getTime() < battle.goAt.getTime()) {
        return { changed: false };
      }
      return {
        changed: true,
        battle: { ...battle, status: 'live' },
        effects: ['reveal-problem', 'start-match-timer'],
      };
    }
    case 'live': {
      const deadline = liveDeadline(battle);
      if (deadline === null || now.getTime() < deadline.getTime()) return { changed: false };
      return {
        changed: true,
        battle: { ...battle, status: 'resolved' },
        effects: ['record-result', 'apply-ratings'],
      };
    }
    // challenged/queued wait for players; the rest are settled or terminal.
    case 'challenged':
    case 'queued':
    case 'resolved':
    case 'voided':
    case 'forfeited':
    case 'flagged':
      return { changed: false };
  }
}

export type ResolveResult = Ok | { ok: false; error: 'not-live' };

/**
 * A decisive win: the first submission passing ALL hidden tests ends the
 * match at that wall-clock instant. The Judge0 VERDICT is the authoritative
 * input (a WS "I finished" event is not) — the submit-solution slice routes
 * the verdict through the scoring kernel and, when decisive, through here.
 */
export function resolveDecisive(battle: BattleSnapshot): ResolveResult {
  if (battle.status !== 'live') return { ok: false, error: 'not-live' };
  return {
    ok: true,
    battle: { ...battle, status: 'resolved' },
    effects: ['record-result', 'apply-ratings'],
  };
}

export type ForfeitResult =
  | {
      ok: true;
      battle: BattleSnapshot;
      effects: BattleEffect[];
      winner: PlayerSide;
      /** Why the loser forfeited — recorded with the result for stats/review. */
      reason: ForfeitReason;
    }
  | { ok: false; error: 'not-live' };

/**
 * Disconnect past the grace window, or quit → the opponent wins. A forfeit IS
 * a result: it is recorded and rated (unlike a void, where nothing happened).
 */
export function forfeitBattle(
  battle: BattleSnapshot,
  side: PlayerSide,
  reason: ForfeitReason,
): ForfeitResult {
  if (battle.status !== 'live') return { ok: false, error: 'not-live' };
  return {
    ok: true,
    battle: { ...battle, status: 'forfeited' },
    effects: ['record-result', 'apply-ratings'],
    winner: opponentOf(side),
    reason,
  };
}

export type FlagResult = Ok | { ok: false; error: 'not-reviewable' };

/**
 * Any anti-cheat signal marks a settled result for review. Elo/XP have
 * already been applied at resolution and STAY applied — the flag queues the
 * result for the operator; confirmed cheating (forfeit + Elo penalty +
 * escalating bans) is the M16 review move.
 */
export function flagBattle(battle: BattleSnapshot): FlagResult {
  if (battle.status !== 'resolved' && battle.status !== 'forfeited') {
    return { ok: false, error: 'not-reviewable' };
  }
  return { ok: true, battle: { ...battle, status: 'flagged' }, effects: ['notify-review'] };
}
