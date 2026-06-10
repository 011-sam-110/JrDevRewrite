import { describe, expect, it } from 'vitest';
import {
  abortBeforeReveal,
  BATTLE_STATUSES,
  BATTLE_TRANSITIONS,
  cancelPending,
  canTransition,
  COUNTDOWN_SECONDS,
  flagBattle,
  forfeitBattle,
  liveDeadline,
  markReady,
  matchBattle,
  READY_WINDOW_SECONDS,
  resolveDecisive,
  tickBattle,
  type BattleSnapshot,
  type BattleStatus,
} from './lifecycle';

/**
 * The battle lifecycle is an EVENT-driven state machine (player/judge events)
 * with three time-driven edges handled by `tickBattle` (the M3 `tickPool`
 * pattern): the ready window, the countdown firing "go", and the match time
 * limit. The kernel only *decides* — effects come back as data for the M15
 * slices to execute; the realtime service merely relays events INTO these
 * rules and never owns them (CLAUDE.md → realtime is transport, not authority).
 */

const NOW = new Date('2026-07-01T12:00:00Z');
const secondsAfter = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
const before = (d: Date) => new Date(d.getTime() - 1);

function battle(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return {
    status: 'challenged',
    readyDeadline: null,
    readyA: false,
    readyB: false,
    goAt: null,
    timeLimitSeconds: 1800,
    ...overrides,
  };
}

function matched(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return battle({
    status: 'matched',
    readyDeadline: secondsAfter(NOW, READY_WINDOW_SECONDS),
    ...overrides,
  });
}

function inCountdown(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return battle({
    status: 'countdown',
    readyDeadline: secondsAfter(NOW, READY_WINDOW_SECONDS),
    readyA: true,
    readyB: true,
    goAt: secondsAfter(NOW, COUNTDOWN_SECONDS),
    ...overrides,
  });
}

function live(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return inCountdown({ status: 'live', ...overrides });
}

describe('BATTLE_TRANSITIONS (the explicit transition table)', () => {
  it('allows only the spec edges', () => {
    expect(canTransition('challenged', 'matched')).toBe(true);
    expect(canTransition('queued', 'matched')).toBe(true);
    expect(canTransition('challenged', 'voided')).toBe(true); // declined / expired
    expect(canTransition('queued', 'voided')).toBe(true); // left the queue
    expect(canTransition('matched', 'countdown')).toBe(true);
    expect(canTransition('matched', 'voided')).toBe(true); // no-show
    expect(canTransition('countdown', 'live')).toBe(true);
    expect(canTransition('countdown', 'voided')).toBe(true); // failure before reveal
    expect(canTransition('live', 'resolved')).toBe(true);
    expect(canTransition('live', 'forfeited')).toBe(true);
    expect(canTransition('resolved', 'flagged')).toBe(true);
    expect(canTransition('forfeited', 'flagged')).toBe(true);
  });

  it('forbids every edge not in the table', () => {
    const allowed = new Set(
      BATTLE_STATUSES.flatMap((from) => BATTLE_TRANSITIONS[from].map((to) => `${from}->${to}`)),
    );
    for (const from of BATTLE_STATUSES) {
      for (const to of BATTLE_STATUSES) {
        if (!allowed.has(`${from}->${to}`)) {
          expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
        }
      }
    }
  });

  it('voided and flagged are terminal (in the M11 kernel; M16 adds flag review)', () => {
    expect(BATTLE_TRANSITIONS.voided).toEqual([]);
    expect(BATTLE_TRANSITIONS.flagged).toEqual([]);
  });

  it('once live, the only exits are resolved and forfeited — never voided', () => {
    // Past the reveal something HAS happened; abandoning is a forfeit, not a void.
    expect(canTransition('live', 'voided')).toBe(false);
  });
});

describe('matchBattle (challenge accepted / queue paired → matched)', () => {
  it.each(['challenged', 'queued'] as BattleStatus[])('matches from %s', (status) => {
    const result = matchBattle(battle({ status }), NOW);
    if (!result.ok) throw new Error('expected a transition');
    expect(result.battle.status).toBe('matched');
    expect(result.battle.readyDeadline).toEqual(secondsAfter(NOW, READY_WINDOW_SECONDS));
    expect(result.battle.readyA).toBe(false);
    expect(result.battle.readyB).toBe(false);
    // Phase 2: wagered matches escrow both stakes AT THIS TRANSITION — the
    // effect slots in here; v1 has nothing to do.
    expect(result.effects).toEqual([]);
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'challenged' && s !== 'queued'))(
    'rejects matching from %s',
    (status) => {
      expect(matchBattle(battle({ status }), NOW)).toEqual({ ok: false, error: 'not-pending' });
    },
  );
});

describe('cancelPending (declined / expired challenge, leaving the queue)', () => {
  it.each(['challenged', 'queued'] as BattleStatus[])('voids from %s', (status) => {
    const result = cancelPending(battle({ status }));
    if (!result.ok) throw new Error('expected a transition');
    expect(result.battle.status).toBe('voided');
    expect(result.effects).toEqual(['notify-void']);
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'challenged' && s !== 'queued'))(
    'rejects cancelling from %s',
    (status) => {
      expect(cancelPending(battle({ status }))).toEqual({ ok: false, error: 'not-pending' });
    },
  );
});

describe('markReady (both players must signal within the join window)', () => {
  it('first ready is recorded; the battle stays matched', () => {
    const result = markReady(matched(), 'a', NOW);
    if (!result.ok) throw new Error('expected ok');
    expect(result.battle.status).toBe('matched');
    expect(result.battle.readyA).toBe(true);
    expect(result.battle.readyB).toBe(false);
    expect(result.battle.goAt).toBeNull();
    expect(result.effects).toEqual([]);
  });

  it('re-readying the same side is idempotent', () => {
    const once = markReady(matched(), 'b', NOW);
    if (!once.ok) throw new Error('expected ok');
    const twice = markReady(once.battle, 'b', NOW);
    if (!twice.ok) throw new Error('expected ok');
    expect(twice.battle).toEqual(once.battle);
    expect(twice.effects).toEqual([]);
  });

  it('the second ready starts the countdown, scheduling the synchronized go', () => {
    const first = markReady(matched(), 'a', NOW);
    if (!first.ok) throw new Error('expected ok');
    const readyAt = secondsAfter(NOW, 10);
    const second = markReady(first.battle, 'b', readyAt);
    if (!second.ok) throw new Error('expected ok');
    expect(second.battle.status).toBe('countdown');
    expect(second.battle.goAt).toEqual(secondsAfter(readyAt, COUNTDOWN_SECONDS));
    expect(second.effects).toEqual(['start-countdown']);
  });

  it('order does not matter (b then a)', () => {
    const first = markReady(matched(), 'b', NOW);
    if (!first.ok) throw new Error('expected ok');
    const second = markReady(first.battle, 'a', NOW);
    if (!second.ok) throw new Error('expected ok');
    expect(second.battle.status).toBe('countdown');
  });

  it('rejects a ready AT the deadline instant (deadlines are inclusive, as in pools)', () => {
    const m = matched();
    expect(markReady(m, 'a', m.readyDeadline!)).toEqual({
      ok: false,
      error: 'ready-window-closed',
    });
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'matched'))('rejects ready in %s', (status) => {
    const result = markReady(matched({ status }), 'a', NOW);
    expect(result).toEqual({ ok: false, error: 'not-matched' });
  });
});

describe('abortBeforeReveal (failure/disconnect before the problem is revealed)', () => {
  // Once matched, `cancelPending` no longer applies — but until the go fires
  // nothing has been revealed, so a disconnect during countdown or a delivery
  // failure still voids (binding: "no-show BEFORE PROBLEM REVEAL → voided").
  // This is the kernel move behind the table's matched/countdown → voided
  // event edges; without it a slice would have to bypass the kernel.
  it.each(['matched', 'countdown'] as BattleStatus[])('voids from %s', (status) => {
    const result = abortBeforeReveal(inCountdown({ status }));
    if (!result.ok) throw new Error('expected a transition');
    expect(result.battle.status).toBe('voided');
    // No Elo change, no result — nothing happened yet.
    expect(result.effects).toEqual(['notify-void']);
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'matched' && s !== 'countdown'))(
    'rejects aborting from %s — once live, leaving is a forfeit, never a void',
    (status) => {
      expect(abortBeforeReveal(inCountdown({ status }))).toEqual({
        ok: false,
        error: 'not-before-reveal',
      });
    },
  );
});

describe('tickBattle — matched at the ready deadline (no-show → voided)', () => {
  it('does nothing before the deadline', () => {
    const m = matched();
    expect(tickBattle(m, before(m.readyDeadline!))).toEqual({ changed: false });
  });

  it('voids at the deadline when a player never signalled ready', () => {
    const m = markReady(matched(), 'a', NOW);
    if (!m.ok) throw new Error('expected ok');
    const result = tickBattle(m.battle, m.battle.readyDeadline!);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.battle.status).toBe('voided');
    // No Elo change, no result — NOTHING happened (binding spec).
    expect(result.effects).toEqual(['notify-void']);
  });

  it('voids when neither signalled', () => {
    const m = matched();
    const result = tickBattle(m, m.readyDeadline!);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.battle.status).toBe('voided');
  });

  it('defensively starts the countdown if both were ready but the transition was lost', () => {
    // Unreachable via markReady (the second ready transitions immediately), but
    // the rules must be total over any snapshot a crashed slice could persist.
    const m = matched({ readyA: true, readyB: true });
    const result = tickBattle(m, m.readyDeadline!);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.battle.status).toBe('countdown');
    expect(result.battle.goAt).toEqual(secondsAfter(m.readyDeadline!, COUNTDOWN_SECONDS));
    expect(result.effects).toEqual(['start-countdown']);
  });
});

describe('tickBattle — countdown fires the go', () => {
  it('holds before goAt', () => {
    const c = inCountdown();
    expect(tickBattle(c, before(c.goAt!))).toEqual({ changed: false });
  });

  it('goes live AT goAt, revealing the problem and starting the match timer', () => {
    const c = inCountdown();
    const result = tickBattle(c, c.goAt!);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.battle.status).toBe('live');
    expect(result.effects).toEqual(['reveal-problem', 'start-match-timer']);
  });
});

describe('tickBattle — live at the time limit', () => {
  it('computes the live deadline from goAt + the time limit', () => {
    const l = live();
    expect(liveDeadline(l)).toEqual(secondsAfter(l.goAt!, l.timeLimitSeconds));
  });

  it('has no live deadline before the go (goAt unset)', () => {
    expect(liveDeadline(battle())).toBeNull();
  });

  it('holds before the deadline', () => {
    const l = live();
    expect(tickBattle(l, before(liveDeadline(l)!))).toEqual({ changed: false });
  });

  it('resolves AT the deadline — the timeout path the scoring kernel ranks', () => {
    const l = live();
    const result = tickBattle(l, liveDeadline(l)!);
    if (!result.changed) throw new Error('expected a transition');
    expect(result.battle.status).toBe('resolved');
    expect(result.effects).toEqual(['record-result', 'apply-ratings']);
  });
});

describe('tickBattle — states the clock never moves', () => {
  const wayPast = secondsAfter(NOW, 100_000);

  it.each(['challenged', 'queued', 'resolved', 'voided', 'forfeited', 'flagged'] as BattleStatus[])(
    '%s never ticks',
    (status) => {
      expect(tickBattle(live({ status }), wayPast)).toEqual({ changed: false });
    },
  );

  it('never mutates its input', () => {
    const input = matched({ readyA: true });
    const frozen = structuredClone(input);
    tickBattle(input, input.readyDeadline!);
    expect(input).toEqual(frozen);
  });
});

describe('resolveDecisive (first fully-correct verdict ends the match)', () => {
  it('resolves a live battle, recording the result and applying ratings', () => {
    const result = resolveDecisive(live());
    if (!result.ok) throw new Error('expected ok');
    expect(result.battle.status).toBe('resolved');
    expect(result.effects).toEqual(['record-result', 'apply-ratings']);
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'live'))('rejects from %s', (status) => {
    expect(resolveDecisive(live({ status }))).toEqual({ ok: false, error: 'not-live' });
  });
});

describe('forfeitBattle (disconnect past grace, or quit → opponent wins)', () => {
  it('forfeits a live battle and names the opponent as winner', () => {
    const result = forfeitBattle(live(), 'a', 'quit');
    if (!result.ok) throw new Error('expected ok');
    expect(result.battle.status).toBe('forfeited');
    expect(result.winner).toBe('b');
    expect(result.reason).toBe('quit'); // recorded with the result for stats/review
    expect(result.effects).toEqual(['record-result', 'apply-ratings']);
  });

  it('works for either side and either reason', () => {
    const result = forfeitBattle(live(), 'b', 'disconnect-grace-expired');
    if (!result.ok) throw new Error('expected ok');
    expect(result.winner).toBe('a');
    expect(result.reason).toBe('disconnect-grace-expired');
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'live'))('rejects from %s', (status) => {
    expect(forfeitBattle(live({ status }), 'a', 'quit')).toEqual({
      ok: false,
      error: 'not-live',
    });
  });
});

describe('flagBattle (anti-cheat signal → result reviewable)', () => {
  it.each(['resolved', 'forfeited'] as BattleStatus[])('flags a %s battle', (status) => {
    const result = flagBattle(live({ status }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.battle.status).toBe('flagged');
    // Elo/XP have ALREADY been applied at resolution and stay applied — the
    // flag queues the result for operator review (M16 owns the review move).
    expect(result.effects).toEqual(['notify-review']);
  });

  it.each(BATTLE_STATUSES.filter((s) => s !== 'resolved' && s !== 'forfeited'))(
    'rejects flagging from %s',
    (status) => {
      expect(flagBattle(live({ status }))).toEqual({ ok: false, error: 'not-reviewable' });
    },
  );
});

describe('invariant: a void NEVER touches ratings or results', () => {
  // "No-show before problem reveal → voided (no Elo change — nothing happened)"
  // is binding. Sweep every path that can produce `voided` and assert none of
  // them mandates a rating or result effect.
  it('holds across every void-producing path', () => {
    const voidEffects = [
      cancelPending(battle({ status: 'challenged' })),
      cancelPending(battle({ status: 'queued' })),
      abortBeforeReveal(matched()),
      abortBeforeReveal(inCountdown()),
      tickBattle(matched(), matched().readyDeadline!),
      tickBattle(matched({ readyA: true }), matched().readyDeadline!),
    ].flatMap((r) => ('ok' in r ? (r.ok ? r.effects : []) : r.changed ? r.effects : []));

    expect(voidEffects).not.toContain('apply-ratings');
    expect(voidEffects).not.toContain('record-result');
  });
});
