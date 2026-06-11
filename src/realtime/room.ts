/**
 * One battle's match room — the transport heart of the realtime service.
 *
 * The room owns SOCKETS and CLOCKS; the kernel owns RULES. Every transition
 * below is produced by an M11 kernel call (`markReady`, `tickBattle`,
 * `abortBeforeReveal`, `forfeitBattle`) and the room's job is only to
 * (1) feed those calls with events and scheduled instants, (2) broadcast the
 * outcome over the typed contract, and (3) forward the kernel's
 * effects-as-data to an injected executor — in M13 a logger, in M15 the
 * owning slices (record-result, apply-ratings). If you find a `status =`
 * assignment in this file that didn't come out of a kernel result, that's a
 * review failure.
 *
 * Time is injected (`now`, `schedule`) so every clock-driven edge — ready
 * deadline, the synchronized go, timer syncs, disconnect grace — is
 * deterministic under test. The schedule seam fires at EXACT instants rather
 * than a polling interval because the simultaneous go is a correctness
 * property: both sends happen in the same event-loop turn at goAt.
 */

import {
  abortBeforeReveal,
  DISCONNECT_GRACE_SECONDS,
  forfeitBattle,
  liveDeadline,
  markReady,
  opponentOf,
  tickBattle,
  type BattleEffect,
  type BattleSnapshot,
  type ForfeitReason,
  type PlayerSide,
} from '@/domain/battles';
import type {
  MatchErrorCode,
  RevealedProblem,
  RoomStateEvent,
  ServerEvent,
  SideFlags,
} from '@/lib/match-events';

/** How often the server re-syncs its authoritative remaining time while live. */
export const TIMER_SYNC_SECONDS = 10;

/** A connected client the room can push events to (the socket seam). */
export interface ClientConnection {
  userId: string;
  send(event: ServerEvent): void;
}

export interface RoomConfig {
  battleId: string;
  /** Which userId sits in which seat — fixed for the battle's lifetime. */
  players: { a: string; b: string };
  /** The authoritative snapshot the room drives through the kernel. */
  battle: BattleSnapshot;
}

export interface RoomDeps {
  now(): Date;
  /** Run `fn` at `when`; returns a cancel. The server backs this with setTimeout. */
  schedule(when: Date, fn: () => void): () => void;
  /**
   * The kernel's effects-as-data, forwarded verbatim after every transition.
   * Transport effects (start-countdown, reveal-problem, start-match-timer)
   * are also acted on by the room itself; result effects (record-result,
   * apply-ratings, notify-*) are the M15 slices' job — the room never
   * interprets them.
   */
  onEffects(effects: BattleEffect[], battle: BattleSnapshot): void;
}

const KERNEL_ERROR_CODES: Record<string, MatchErrorCode> = {
  'not-matched': 'not-matched',
  'ready-window-closed': 'ready-window-closed',
  'not-live': 'not-live',
};

export class BattleRoom {
  private battleState: BattleSnapshot;
  private readonly conns: { a: ClientConnection | null; b: ClientConnection | null } = {
    a: null,
    b: null,
  };
  /** Every outstanding cancel — settled rooms must leave no timers behind. */
  private cancels = new Set<() => void>();
  private readonly grace: { a: (() => void) | null; b: (() => void) | null } = {
    a: null,
    b: null,
  };

  constructor(
    private readonly config: RoomConfig,
    /** Held by the room, revealed ONLY at the go — secrecy is a transport duty. */
    private readonly problem: RevealedProblem,
    private readonly deps: RoomDeps,
  ) {
    this.battleState = config.battle;
    this.armClock();
  }

  get battle(): BattleSnapshot {
    return this.battleState;
  }

  get isSettled(): boolean {
    return (
      this.battleState.status === 'voided' ||
      this.battleState.status === 'resolved' ||
      this.battleState.status === 'forfeited' ||
      this.battleState.status === 'flagged'
    );
  }

  /* ------------------------------------------------------------- player events */

  /** Returns false when the user is not a player — the caller must not bind them. */
  join(conn: ClientConnection): boolean {
    const side = this.sideOf(conn.userId);
    if (!side) {
      conn.send({ type: 'error', code: 'not-a-player' });
      return false;
    }
    this.conns[side] = conn;
    // A reconnect inside the grace window saves the battle.
    this.clearGrace(side);
    conn.send(this.roomState(side));
    this.broadcast({ type: 'presence', presence: this.presence() });
    return true;
  }

  disconnect(userId: string): void {
    const side = this.sideOf(userId);
    if (!side || !this.conns[side]) return;
    this.conns[side] = null;
    this.broadcast({ type: 'presence', presence: this.presence() });

    if (this.battleState.status === 'countdown') {
      // Binding: a no-show before the problem reveal voids the battle —
      // nothing was revealed, so nothing is rated.
      const result = abortBeforeReveal(this.battleState);
      if (result.ok) this.applyTransition(result.battle, result.effects);
      return;
    }
    if (this.battleState.status === 'live') {
      // Transport tracks the grace clock; the forfeit DECISION is the kernel's.
      const cancel = this.deps.schedule(
        new Date(this.deps.now().getTime() + DISCONNECT_GRACE_SECONDS * 1000),
        () => this.graceExpired(side),
      );
      this.grace[side] = cancel;
      this.cancels.add(cancel);
    }
    // While merely `matched`, a dropped socket changes nothing — the ready
    // deadline (kernel tick) is the arbiter of no-shows.
  }

  ready(userId: string): void {
    const side = this.sideOf(userId);
    if (!side) return;
    const result = markReady(this.battleState, side, this.deps.now());
    if (!result.ok) {
      this.sendTo(side, { type: 'error', code: KERNEL_ERROR_CODES[result.error] ?? 'not-matched' });
      return;
    }
    this.battleState = result.battle;
    this.broadcast({ type: 'ready-state', ready: this.readyFlags() });
    if (result.battle.status === 'countdown') {
      this.forwardEffects(result.effects);
      this.clearClock();
      this.armClock(); // schedules the go at the kernel's goAt
      const goAt = result.battle.goAt;
      if (goAt) this.broadcast({ type: 'countdown', goAt: goAt.toISOString() });
    }
  }

  quit(userId: string): void {
    const side = this.sideOf(userId);
    if (!side || this.isSettled) return;
    if (this.battleState.status === 'matched' || this.battleState.status === 'countdown') {
      const result = abortBeforeReveal(this.battleState);
      if (result.ok) this.applyTransition(result.battle, result.effects);
      return;
    }
    const result = forfeitBattle(this.battleState, side, 'quit');
    if (!result.ok) {
      this.sendTo(side, { type: 'error', code: 'not-live' });
      return;
    }
    this.applyTransition(result.battle, result.effects, result.winner, result.reason);
  }

  progress(userId: string, testsPassed: number): void {
    const side = this.sideOf(userId);
    if (!side) return;
    if (this.battleState.status !== 'live') {
      this.sendTo(side, { type: 'error', code: 'not-live' });
      return;
    }
    this.sendTo(opponentOf(side), { type: 'opponent-progress', testsPassed });
  }

  /* --------------------------------------------------------------- the clocks */

  /** Schedule the next time-driven kernel edge for the current status. */
  private armClock(): void {
    const b = this.battleState;
    if (b.status === 'matched' && b.readyDeadline) {
      this.scheduleTick(b.readyDeadline);
    } else if (b.status === 'countdown' && b.goAt) {
      this.scheduleTick(b.goAt);
    } else if (b.status === 'live') {
      const deadline = liveDeadline(b);
      if (deadline) this.scheduleTick(deadline); // scheduled BEFORE timer syncs:
      this.scheduleTimerSync(); // at a tie the resolve wins, syncs get cancelled
    }
  }

  private scheduleTick(when: Date): void {
    const cancel = this.deps.schedule(when, () => this.clockFired());
    this.cancels.add(cancel);
  }

  /** A scheduled instant arrived — let the kernel decide what (if anything) changed. */
  private clockFired(): void {
    const result = tickBattle(this.battleState, this.deps.now());
    if (!result.changed) return;
    this.battleState = result.battle;
    this.forwardEffects(result.effects);

    if (result.battle.status === 'live') {
      // The synchronized go: ONE payload, both sends in the same event-loop
      // turn. The reveal happens here and only here.
      const endsAt = liveDeadline(result.battle);
      const go: ServerEvent = {
        type: 'go',
        problem: this.problem,
        endsAt: endsAt ? endsAt.toISOString() : this.deps.now().toISOString(),
      };
      this.broadcast(go);
      this.armClock();
      return;
    }
    // voided (ready no-show) or resolved (time limit) — both settle the room.
    this.announceSettled();
  }

  private scheduleTimerSync(): void {
    const cancel = this.deps.schedule(
      new Date(this.deps.now().getTime() + TIMER_SYNC_SECONDS * 1000),
      () => {
        if (this.battleState.status !== 'live') return;
        const endsAt = liveDeadline(this.battleState);
        if (!endsAt) return;
        const remaining = Math.max(
          0,
          Math.round((endsAt.getTime() - this.deps.now().getTime()) / 1000),
        );
        this.broadcast({ type: 'timer', remainingSeconds: remaining });
        this.scheduleTimerSync();
      },
    );
    this.cancels.add(cancel);
  }

  private graceExpired(side: PlayerSide): void {
    this.grace[side] = null;
    const result = forfeitBattle(this.battleState, side, 'disconnect-grace-expired');
    if (!result.ok) return; // already settled by something else — nothing to do
    this.applyTransition(result.battle, result.effects, result.winner, result.reason);
  }

  /* ------------------------------------------------------------------ internals */

  /** Commit a kernel-produced snapshot, forward its effects, announce, settle. */
  private applyTransition(
    battle: BattleSnapshot,
    effects: BattleEffect[],
    winner: PlayerSide | null = null,
    reason: ForfeitReason | null = null,
  ): void {
    this.battleState = battle;
    this.forwardEffects(effects);
    this.announceSettled(winner, reason);
  }

  private announceSettled(
    winner: PlayerSide | null = null,
    reason: ForfeitReason | null = null,
  ): void {
    this.broadcast({ type: 'battle-status', status: this.battleState.status, winner, reason });
    this.clearClock();
  }

  private forwardEffects(effects: BattleEffect[]): void {
    if (effects.length > 0) this.deps.onEffects(effects, this.battleState);
  }

  private clearClock(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels.clear();
    this.grace.a = null;
    this.grace.b = null;
  }

  private clearGrace(side: PlayerSide): void {
    const cancel = this.grace[side];
    if (cancel) {
      cancel();
      this.cancels.delete(cancel);
      this.grace[side] = null;
    }
  }

  private sideOf(userId: string): PlayerSide | null {
    if (userId === this.config.players.a) return 'a';
    if (userId === this.config.players.b) return 'b';
    return null;
  }

  private presence(): SideFlags {
    return { a: this.conns.a !== null, b: this.conns.b !== null };
  }

  private readyFlags(): SideFlags {
    return { a: this.battleState.readyA, b: this.battleState.readyB };
  }

  private roomState(side: PlayerSide): RoomStateEvent {
    const live = this.battleState.status === 'live';
    const endsAt = liveDeadline(this.battleState);
    return {
      type: 'room-state',
      battleId: this.config.battleId,
      side,
      status: this.battleState.status,
      presence: this.presence(),
      ready: this.readyFlags(),
      goAt: this.battleState.goAt ? this.battleState.goAt.toISOString() : null,
      endsAt: this.battleState.goAt && endsAt ? endsAt.toISOString() : null,
      problem: live ? this.problem : null,
    };
  }

  private broadcast(event: ServerEvent): void {
    if (this.conns.a) this.conns.a.send(event);
    if (this.conns.b) this.conns.b.send(event);
  }

  private sendTo(side: PlayerSide, event: ServerEvent): void {
    this.conns[side]?.send(event);
  }
}
