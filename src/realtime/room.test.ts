import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  DISCONNECT_GRACE_SECONDS,
  matchBattle,
  READY_WINDOW_SECONDS,
  type BattleEffect,
  type BattleSnapshot,
} from '@/domain/battles';
import type { RevealedProblem, ServerEvent } from '@/lib/match-events';
import { BattleRoom, TIMER_SYNC_SECONDS, type RoomDeps, type RoomOutcome } from './room';

/* ------------------------------------------------------------------ harness */

const T0 = new Date('2026-06-11T12:00:00.000Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

const PROBLEM: RevealedProblem = {
  id: 'p1',
  slug: 'sum-two-integers',
  title: 'Sum of Two Integers',
  statementMd: 'Read two integers and print their sum.',
  tier: 'easy',
  timeLimitSeconds: 120,
};

/** Deterministic clock + scheduler: jobs fire in time order on advanceTo. */
function makeWorld() {
  const clock = { now: T0 };
  interface Job {
    at: Date;
    fn: () => void;
    cancelled: boolean;
  }
  const jobs: Job[] = [];

  const deps: RoomDeps & {
    effects: { effects: BattleEffect[]; battle: BattleSnapshot; outcome?: RoomOutcome }[];
  } = {
    effects: [],
    now: () => clock.now,
    schedule: (when, fn) => {
      const job: Job = { at: when, fn, cancelled: false };
      jobs.push(job);
      return () => {
        job.cancelled = true;
      };
    },
    onEffects: (effects, battle, outcome) => {
      deps.effects.push({ effects, battle, ...(outcome ? { outcome } : {}) });
    },
  };

  /** Advance the clock, firing every due job in time order (jobs may chain). */
  function advanceTo(when: Date): void {
    for (;;) {
      const due = jobs
        .filter((j) => !j.cancelled && j.at.getTime() <= when.getTime())
        .sort((x, y) => x.at.getTime() - y.at.getTime())[0];
      if (!due) break;
      due.cancelled = true; // consume
      clock.now = due.at;
      due.fn();
    }
    clock.now = when;
  }

  return { clock, deps, advanceTo };
}

function makeClient(userId: string) {
  const events: ServerEvent[] = [];
  return {
    userId,
    events,
    conn: { userId, send: (e: ServerEvent) => events.push(e) },
    /** All events of one type, typed. */
    of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
      return events.filter((e): e is Extract<ServerEvent, { type: T }> => e.type === type);
    },
    last(): ServerEvent | undefined {
      return events[events.length - 1];
    },
  };
}

/** A freshly matched battle (the state M15's slices hand the room). */
function matchedBattle(): BattleSnapshot {
  const result = matchBattle(
    {
      status: 'challenged',
      readyDeadline: null,
      readyA: false,
      readyB: false,
      goAt: null,
      timeLimitSeconds: PROBLEM.timeLimitSeconds,
    },
    T0,
  );
  if (!result.ok) throw new Error('unreachable');
  return result.battle;
}

function makeRoom() {
  const world = makeWorld();
  const room = new BattleRoom(
    { battleId: 'battle-1', players: { a: 'user-a', b: 'user-b' }, battle: matchedBattle() },
    PROBLEM,
    world.deps,
  );
  const a = makeClient('user-a');
  const b = makeClient('user-b');
  return { ...world, room, a, b };
}

/** Join both players and ready both — battle ends up in countdown. */
function toCountdown(w: ReturnType<typeof makeRoom>): void {
  w.room.join(w.a.conn);
  w.room.join(w.b.conn);
  w.room.ready('user-a');
  w.room.ready('user-b');
}

/** Drive all the way to live (the go has fired). */
function toLive(w: ReturnType<typeof makeRoom>): void {
  toCountdown(w);
  w.advanceTo(at(COUNTDOWN_SECONDS));
}

/* ------------------------------------------------------------------- joining */

describe('joining a room', () => {
  it('a player joining receives the full room-state resync with their side', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);

    const state = w.a.of('room-state')[0]!;
    expect(state.battleId).toBe('battle-1');
    expect(state.side).toBe('a');
    expect(state.status).toBe('matched');
    expect(state.problem).toBeNull(); // never revealed before live
    expect(state.goAt).toBeNull();
    expect(state.presence).toEqual({ a: true, b: false });
  });

  it('joins broadcast presence to everyone connected', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    w.room.join(w.b.conn);

    // A sees B arrive.
    expect(w.a.of('presence').at(-1)?.presence).toEqual({ a: true, b: true });
  });

  it('a non-player is rejected with not-a-player and learns nothing', () => {
    const w = makeRoom();
    const stranger = makeClient('user-x');
    w.room.join(stranger.conn);

    expect(stranger.events).toEqual([{ type: 'error', code: 'not-a-player' }]);
  });
});

/* ----------------------------------------------------------- ready/countdown */

describe('ready signals and the synchronized countdown', () => {
  it('one ready broadcasts ready-state but starts nothing', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    w.room.join(w.b.conn);
    w.room.ready('user-a');

    expect(w.b.of('ready-state').at(-1)?.ready).toEqual({ a: true, b: false });
    expect(w.room.battle.status).toBe('matched');
    expect(w.a.of('countdown')).toHaveLength(0);
  });

  it('the second ready starts the countdown — both receive the IDENTICAL goAt', () => {
    const w = makeRoom();
    toCountdown(w);

    const goAtA = w.a.of('countdown')[0]?.goAt;
    const goAtB = w.b.of('countdown')[0]?.goAt;
    expect(goAtA).toBeDefined();
    expect(goAtA).toBe(goAtB); // the same instant, byte for byte
    expect(w.room.battle.status).toBe('countdown');
    // The kernel decided the transition; its effects were forwarded untouched.
    expect(w.deps.effects.at(-1)?.effects).toEqual(['start-countdown']);
  });

  it('ready from a settled battle is rejected with not-matched', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    // Nobody readies; the ready window expires and the kernel voids the battle.
    w.advanceTo(at(READY_WINDOW_SECONDS));
    w.room.ready('user-a');

    expect(w.a.last()).toEqual({ type: 'error', code: 'not-matched' });
  });
});

/* ------------------------------------------------------- time-driven: voided */

describe('ready-deadline no-show (kernel tick → voided)', () => {
  it('voids the battle at the deadline and tells everyone', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    w.room.ready('user-a'); // only one side shows up

    w.advanceTo(at(READY_WINDOW_SECONDS));

    expect(w.room.battle.status).toBe('voided');
    expect(w.a.of('battle-status')[0]).toEqual({
      type: 'battle-status',
      status: 'voided',
      winner: null,
      reason: null,
    });
    expect(w.deps.effects.at(-1)?.effects).toEqual(['notify-void']);
  });
});

/* ------------------------------------------------------------ the go + reveal */

describe('the synchronized go', () => {
  it('at goAt both players receive go with the problem and the SAME endsAt', () => {
    const w = makeRoom();
    toLive(w);

    const goA = w.a.of('go')[0]!;
    const goB = w.b.of('go')[0]!;
    expect(goA.problem).toEqual(PROBLEM);
    expect(goB).toEqual(goA); // identical payload, including endsAt
    expect(w.room.battle.status).toBe('live');
    expect(w.deps.effects.at(-1)?.effects).toEqual(['reveal-problem', 'start-match-timer']);
  });

  it('the problem stays hidden in the countdown resync (reveal is at go, not join)', () => {
    const w = makeRoom();
    toCountdown(w);

    // Rejoin during the countdown — resync must not leak the statement early.
    w.room.join(w.a.conn);
    const state = w.a.of('room-state').at(-1)!;
    expect(state.status).toBe('countdown');
    expect(state.goAt).not.toBeNull();
    expect(state.problem).toBeNull();
  });

  it('a rejoin during live resyncs the problem + endsAt (reconnect recovery)', () => {
    const w = makeRoom();
    toLive(w);

    w.room.join(w.a.conn);
    const state = w.a.of('room-state').at(-1)!;
    expect(state.status).toBe('live');
    expect(state.problem).toEqual(PROBLEM);
    expect(state.endsAt).toBe(w.a.of('go')[0]!.endsAt);
  });
});

/* ----------------------------------------------------------------- the timer */

describe('the match timer', () => {
  it('broadcasts server-authoritative remaining time on the sync cadence', () => {
    const w = makeRoom();
    toLive(w);

    w.advanceTo(at(COUNTDOWN_SECONDS + TIMER_SYNC_SECONDS));
    const tick = w.a.of('timer').at(-1);
    expect(tick?.remainingSeconds).toBe(PROBLEM.timeLimitSeconds - TIMER_SYNC_SECONDS);
  });

  it('resolves the battle at the time limit (kernel tick) and stops ticking', () => {
    const w = makeRoom();
    toLive(w);

    w.advanceTo(at(COUNTDOWN_SECONDS + PROBLEM.timeLimitSeconds));

    expect(w.room.battle.status).toBe('resolved');
    expect(w.a.of('battle-status')[0]).toEqual({
      type: 'battle-status',
      status: 'resolved',
      winner: null, // scoring over submissions is the M15 slice's job, not transport's
      reason: null,
    });
    expect(w.deps.effects.at(-1)?.effects).toEqual(['record-result', 'apply-ratings']);

    const timerCount = w.a.of('timer').length;
    w.advanceTo(at(COUNTDOWN_SECONDS + PROBLEM.timeLimitSeconds + 60));
    expect(w.a.of('timer')).toHaveLength(timerCount); // no ticks after settle
  });
});

/* ----------------------------------------------- disconnects, grace, forfeit */

describe('disconnect handling', () => {
  it('a disconnect during the countdown voids the battle (nothing was revealed)', () => {
    const w = makeRoom();
    toCountdown(w);

    w.room.disconnect('user-b');

    expect(w.room.battle.status).toBe('voided');
    expect(w.a.of('battle-status')[0]?.status).toBe('voided');
  });

  it('a disconnect while matched does NOT void — the ready deadline decides', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    w.room.join(w.b.conn);
    w.room.disconnect('user-b');

    expect(w.room.battle.status).toBe('matched'); // they may still come back
    expect(w.a.of('presence').at(-1)?.presence).toEqual({ a: true, b: false });
  });

  it('a live disconnect past the grace window forfeits to the opponent', () => {
    const w = makeRoom();
    toLive(w);

    w.room.disconnect('user-b');
    w.advanceTo(at(COUNTDOWN_SECONDS + DISCONNECT_GRACE_SECONDS));

    expect(w.room.battle.status).toBe('forfeited');
    expect(w.a.of('battle-status')[0]).toEqual({
      type: 'battle-status',
      status: 'forfeited',
      winner: 'a',
      reason: 'disconnect-grace-expired',
    });
    expect(w.deps.effects.at(-1)?.effects).toEqual(['record-result', 'apply-ratings']);
  });

  it('reconnecting inside the grace window cancels the forfeit', () => {
    const w = makeRoom();
    toLive(w);

    w.room.disconnect('user-b');
    w.advanceTo(at(COUNTDOWN_SECONDS + DISCONNECT_GRACE_SECONDS - 5));
    w.room.join(w.b.conn); // back inside the window

    w.advanceTo(at(COUNTDOWN_SECONDS + DISCONNECT_GRACE_SECONDS + 60));
    expect(w.room.battle.status).toBe('live'); // no forfeit fired
  });
});

/* -------------------------------------------------------------------- quitting */

describe('quitting', () => {
  it('quitting a live battle forfeits to the opponent with reason quit', () => {
    const w = makeRoom();
    toLive(w);

    w.room.quit('user-a');

    expect(w.room.battle.status).toBe('forfeited');
    expect(w.b.of('battle-status')[0]).toEqual({
      type: 'battle-status',
      status: 'forfeited',
      winner: 'b',
      reason: 'quit',
    });
  });

  it('quitting before the reveal voids the battle (nothing happened)', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    w.room.join(w.b.conn);

    w.room.quit('user-a');

    expect(w.room.battle.status).toBe('voided');
    expect(w.b.of('battle-status')[0]?.status).toBe('voided');
  });
});

/* ------------------------------------------------------------ progress relay */

describe('opponent progress relay', () => {
  it('relays progress to the OPPONENT only, while live', () => {
    const w = makeRoom();
    toLive(w);

    w.room.progress('user-a', 3);

    expect(w.b.of('opponent-progress')[0]?.testsPassed).toBe(3);
    expect(w.a.of('opponent-progress')).toHaveLength(0);
  });

  it('rejects progress outside live (nothing to relay against)', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);
    w.room.progress('user-a', 2);

    expect(w.a.last()).toEqual({ type: 'error', code: 'not-live' });
  });
});

/* ------------------------------------------------- anti-cheat telemetry (M14) */

describe('in-match anti-cheat telemetry', () => {
  it('records live telemetry server-stamped as seconds from the go', () => {
    const w = makeRoom();
    toLive(w);

    w.advanceTo(at(COUNTDOWN_SECONDS + 7));
    w.room.recordTelemetry('user-a', 'focus-lost');
    w.advanceTo(at(COUNTDOWN_SECONDS + 9));
    w.room.recordTelemetry('user-a', 'focus-regained');
    w.advanceTo(at(COUNTDOWN_SECONDS + 30));
    w.room.recordTelemetry('user-b', 'paste-blocked');

    // The client never supplied a time — these stamps are the server clock's.
    expect(w.room.telemetryLog).toEqual([
      { side: 'a', kind: 'focus-lost', atSeconds: 7 },
      { side: 'a', kind: 'focus-regained', atSeconds: 9 },
      { side: 'b', kind: 'paste-blocked', atSeconds: 30 },
    ]);
  });

  it('is NEVER relayed to the opponent (a cheat signal must not tip anyone off)', () => {
    const w = makeRoom();
    toLive(w);
    const before = w.b.events.length;

    w.room.recordTelemetry('user-a', 'paste-blocked');

    expect(w.b.events).toHaveLength(before); // b heard nothing
    expect(w.a.events.filter((e) => e.type === 'error')).toHaveLength(0); // no echo either
  });

  it('silently drops telemetry outside live (nothing is being measured yet)', () => {
    const w = makeRoom();
    toCountdown(w);

    w.room.recordTelemetry('user-a', 'focus-lost');

    expect(w.room.telemetryLog).toEqual([]);
    // Fire-and-forget: unlike progress, no error frame — blur/focus noise during
    // pre-live phases must not generate an error storm.
    expect(w.a.events.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  it('ignores telemetry from a non-player', () => {
    const w = makeRoom();
    toLive(w);

    w.room.recordTelemetry('user-x', 'paste-blocked');

    expect(w.room.telemetryLog).toEqual([]);
  });
});

/* -------------------------------------------- M15: outcome-carrying effects */

describe('effects carry the outcome for the executor', () => {
  it('a quit forfeit forwards winner + reason alongside the effects', () => {
    const w = makeRoom();
    toLive(w);

    w.room.quit('user-a');

    const last = w.deps.effects[w.deps.effects.length - 1]!;
    expect(last.effects).toEqual(['record-result', 'apply-ratings']);
    expect(last.outcome).toEqual({ winner: 'b', reason: 'quit' });
  });

  it('a grace-expiry forfeit names the reason', () => {
    const w = makeRoom();
    toLive(w);

    w.room.disconnect('user-b');
    w.advanceTo(at(COUNTDOWN_SECONDS + DISCONNECT_GRACE_SECONDS));

    const last = w.deps.effects[w.deps.effects.length - 1]!;
    expect(last.outcome).toEqual({ winner: 'a', reason: 'disconnect-grace-expired' });
  });

  it('a time-limit resolve carries NO outcome — scoring over submissions is the slice job', () => {
    const w = makeRoom();
    toLive(w);

    w.advanceTo(at(COUNTDOWN_SECONDS + PROBLEM.timeLimitSeconds));

    const last = w.deps.effects[w.deps.effects.length - 1]!;
    expect(last.effects).toEqual(['record-result', 'apply-ratings']);
    expect(last.outcome).toBeUndefined();
  });
});

describe('settleFromAuthority — the slice-settled decisive path', () => {
  it('transitions live to resolved via the kernel and broadcasts the winner WITHOUT forwarding effects', () => {
    const w = makeRoom();
    toLive(w);
    const effectsBefore = w.deps.effects.length;

    w.room.settleFromAuthority('b');

    expect(w.room.battle.status).toBe('resolved');
    // The authority (resolve-battle) already executed record-result and
    // apply-ratings — re-forwarding would double-settle.
    expect(w.deps.effects).toHaveLength(effectsBefore);
    const announced = { type: 'battle-status', status: 'resolved', winner: 'b', reason: null };
    expect(w.a.of('battle-status').at(-1)).toEqual(announced);
    expect(w.b.of('battle-status').at(-1)).toEqual(announced);
  });

  it('re-announces the computed winner when the room already settled (the timeout follow-up)', () => {
    const w = makeRoom();
    toLive(w);
    w.advanceTo(at(COUNTDOWN_SECONDS + PROBLEM.timeLimitSeconds));
    expect(w.room.battle.status).toBe('resolved');
    expect(w.a.of('battle-status').at(-1)!.winner).toBeNull(); // transport announced, unscored

    w.room.settleFromAuthority('a');

    expect(w.a.of('battle-status').at(-1)!.winner).toBe('a');
    expect(w.b.of('battle-status').at(-1)!.winner).toBe('a');
  });

  it('cannot settle a lobby — before the reveal a poke does nothing', () => {
    const w = makeRoom();
    w.room.join(w.a.conn);

    w.room.settleFromAuthority('a');

    expect(w.room.battle.status).toBe('matched');
    expect(w.a.of('battle-status')).toHaveLength(0);
  });
});

describe('WS frames decide nothing (binding: the judge verdict is authoritative)', () => {
  it('a progress claim of any size changes no status and mandates no result', () => {
    const w = makeRoom();
    toLive(w);

    w.room.progress('user-a', 999);

    expect(w.room.battle.status).toBe('live');
    expect(w.deps.effects.flatMap((e) => e.effects)).not.toContain('record-result');
    expect(w.deps.effects.flatMap((e) => e.effects)).not.toContain('apply-ratings');
  });
});
