import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PENALTY_PER_WRONG_SECONDS,
  scoreBattle,
  SUBMISSION_COOLDOWN_SECONDS,
  submissionCooldownRemaining,
  type BattleSubmission,
} from './scoring';

/**
 * Speed + penalty scoring (binding spec): first fully-correct submission wins
 * outright — PENALTY NEVER OVERTURNS A DECISIVE REAL-TIME WIN. Penalty-adjusted
 * time only decides the timeout path (most tests passed, tie-broken by lowest
 * penalty-adjusted time, still equal → draw) and is recorded for stats either
 * way. The judge verdict data is the input; a WS "I finished" event never is.
 */

const LIMIT = 1800; // 30-minute match

const sub = (
  player: 'a' | 'b',
  atSeconds: number,
  testsPassed: number,
  passedAll = false,
): BattleSubmission => ({ player, atSeconds, testsPassed, passedAll });

const solve = (player: 'a' | 'b', atSeconds: number) => sub(player, atSeconds, 10, true);

describe('scoreBattle — decisive win', () => {
  it('the first submission passing ALL hidden tests wins at that instant', () => {
    const outcome = scoreBattle([solve('b', 400), solve('a', 900)], LIMIT, 60);
    expect(outcome.kind).toBe('decisive');
    if (outcome.kind !== 'decisive') throw new Error('unreachable');
    expect(outcome.winner).toBe('b');
    expect(outcome.decidedAtSeconds).toBe(400);
  });

  it('a partial submission never decides, however many tests it passes', () => {
    const outcome = scoreBattle([sub('a', 100, 9), solve('b', 1700)], LIMIT, 60);
    if (outcome.kind !== 'decisive') throw new Error('expected decisive');
    expect(outcome.winner).toBe('b');
  });

  it('PENALTY NEVER OVERTURNS A DECISIVE WIN — the binding invariant, swept', () => {
    // a solves first but with a pile of rejected attempts; b solves clean but
    // later. For ANY penalty size, a still wins: penalty is a tiebreaker for
    // the timeout path, never a tax on a real-time first.
    const history = [
      sub('a', 50, 2),
      sub('a', 120, 4),
      sub('a', 300, 6),
      solve('a', 600),
      solve('b', 601),
    ];
    for (const penalty of [0, 1, 60, 600, 100_000]) {
      const outcome = scoreBattle(history, LIMIT, penalty);
      if (outcome.kind !== 'decisive') throw new Error('expected decisive');
      expect(outcome.winner, `penalty=${penalty}`).toBe('a');
    }
  });

  it('records penalty-adjusted time for stats: solve time + penalty per prior rejection', () => {
    const outcome = scoreBattle([sub('a', 100, 3), sub('a', 200, 5), solve('a', 500)], LIMIT, 60);
    if (outcome.kind !== 'decisive') throw new Error('expected decisive');
    expect(outcome.players.a.solvedAtSeconds).toBe(500);
    expect(outcome.players.a.wrongSubmissions).toBe(2);
    expect(outcome.players.a.penaltyAdjustedSeconds).toBe(500 + 2 * 60);
    // The loser's stats are recorded too.
    expect(outcome.players.b.testsPassed).toBe(0);
    expect(outcome.players.b.penaltyAdjustedSeconds).toBeNull();
  });

  it('submissions after the solve are not penalized (judge-spam changes nothing)', () => {
    const outcome = scoreBattle([solve('a', 500), sub('a', 600, 1)], LIMIT, 60);
    if (outcome.kind !== 'decisive') throw new Error('expected decisive');
    expect(outcome.players.a.wrongSubmissions).toBe(0);
    expect(outcome.players.a.penaltyAdjustedSeconds).toBe(500);
  });

  it('both solve at the same instant: there is no "first" — fewer rejections wins', () => {
    const outcome = scoreBattle([sub('a', 100, 1), solve('a', 500), solve('b', 500)], LIMIT, 60);
    if (outcome.kind !== 'decisive') throw new Error('expected decisive');
    expect(outcome.winner).toBe('b');
  });

  it('both solve at the same instant with equal rejections → draw', () => {
    const outcome = scoreBattle([solve('a', 500), solve('b', 500)], LIMIT, 60);
    expect(outcome.kind).toBe('draw');
  });
});

describe('scoreBattle — submission window', () => {
  it('a solve AT the time limit is too late (the deadline instant is closed, as everywhere)', () => {
    const outcome = scoreBattle([solve('a', LIMIT)], LIMIT, 60);
    expect(outcome.kind).toBe('draw');
  });

  it('late submissions are ignored entirely — no score, no penalty', () => {
    const outcome = scoreBattle(
      [sub('a', 100, 3), solve('b', LIMIT + 5), sub('a', LIMIT + 1, 9)],
      LIMIT,
      60,
    );
    if (outcome.kind !== 'timeout') throw new Error('expected timeout');
    expect(outcome.winner).toBe('a');
    expect(outcome.players.a.testsPassed).toBe(3);
    expect(outcome.players.b.testsPassed).toBe(0);
  });
});

describe('scoreBattle — timeout (nobody fully correct)', () => {
  it('most hidden tests passed wins', () => {
    const outcome = scoreBattle([sub('a', 200, 4), sub('b', 100, 7)], LIMIT, 60);
    if (outcome.kind !== 'timeout') throw new Error('expected timeout');
    expect(outcome.winner).toBe('b');
    expect(outcome.basis).toBe('tests-passed');
  });

  it('only the best submission counts — not the sum of attempts', () => {
    const outcome = scoreBattle(
      [sub('a', 100, 3), sub('a', 200, 3), sub('a', 300, 3), sub('b', 400, 4)],
      LIMIT,
      60,
    );
    if (outcome.kind !== 'timeout') throw new Error('expected timeout');
    expect(outcome.winner).toBe('b');
  });

  it('equal tests passed → lowest penalty-adjusted time wins', () => {
    // Both peak at 6 tests; a got there at 300s clean, b at 200s but with two
    // earlier rejections (200 + 2*60 = 320 > 300).
    const history = [sub('b', 50, 1), sub('b', 120, 3), sub('b', 200, 6), sub('a', 300, 6)];
    const outcome = scoreBattle(history, LIMIT, 60);
    if (outcome.kind !== 'timeout') throw new Error('expected timeout');
    expect(outcome.winner).toBe('a');
    expect(outcome.basis).toBe('penalty-time');
    expect(outcome.players.a.penaltyAdjustedSeconds).toBe(300);
    expect(outcome.players.b.penaltyAdjustedSeconds).toBe(320);
  });

  it('the counting submission is the EARLIEST that reached the best score', () => {
    // b repeats their best later; the first time they hit 5 is what counts.
    const outcome = scoreBattle([sub('b', 100, 5), sub('b', 900, 5), sub('a', 200, 5)], LIMIT, 60);
    if (outcome.kind !== 'timeout') throw new Error('expected timeout');
    expect(outcome.players.b.penaltyAdjustedSeconds).toBe(100);
    expect(outcome.winner).toBe('b');
  });

  it('equal tests and equal penalty-adjusted time → draw', () => {
    const outcome = scoreBattle([sub('a', 300, 5), sub('b', 300, 5)], LIMIT, 60);
    expect(outcome.kind).toBe('draw');
  });

  it('zero tests passed by both → draw, even if only one of them submitted', () => {
    // Spamming wrong answers measures nothing; it must not beat silence.
    const outcome = scoreBattle([sub('a', 100, 0), sub('a', 200, 0)], LIMIT, 60);
    expect(outcome.kind).toBe('draw');
  });

  it('no submissions at all → draw with empty stats', () => {
    const outcome = scoreBattle([], LIMIT, 60);
    expect(outcome.kind).toBe('draw');
    if (outcome.kind !== 'draw') throw new Error('unreachable');
    expect(outcome.players.a.testsPassed).toBe(0);
    expect(outcome.players.a.penaltyAdjustedSeconds).toBeNull();
  });
});

describe('scoreBattle — determinism and validation', () => {
  it('is order-independent: a shuffled history scores identically', () => {
    const history = [
      sub('a', 50, 2),
      sub('b', 120, 6),
      sub('a', 300, 6),
      sub('b', 700, 6),
      sub('a', 900, 4),
    ];
    const reference = scoreBattle(history, LIMIT, 60);
    const shuffled = [3, 0, 4, 2, 1].map((i) => history[i]!);
    expect(scoreBattle(shuffled, LIMIT, 60)).toEqual(reference);
  });

  it('never mutates its input', () => {
    const history = [sub('b', 700, 6), sub('a', 50, 2)];
    const frozen = structuredClone(history);
    scoreBattle(history, LIMIT, 60);
    expect(history).toEqual(frozen);
  });

  it('throws on corrupt input rather than guessing', () => {
    expect(() => scoreBattle([sub('a', -1, 3)], LIMIT, 60)).toThrow();
    expect(() => scoreBattle([sub('a', 100, -2)], LIMIT, 60)).toThrow();
    expect(() => scoreBattle([], 0, 60)).toThrow();
    expect(() => scoreBattle([], LIMIT, -5)).toThrow();
  });
});

describe('submissionCooldownRemaining (anti judge-spam)', () => {
  it('a player with no prior submissions may submit immediately', () => {
    expect(submissionCooldownRemaining([], 'a', 0)).toBe(0);
  });

  it('the full cooldown applies right after a submission', () => {
    expect(submissionCooldownRemaining([sub('a', 100, 3)], 'a', 100)).toBe(
      SUBMISSION_COOLDOWN_SECONDS,
    );
  });

  it('counts down as time passes and reaches zero exactly at expiry', () => {
    const history = [sub('a', 100, 3)];
    expect(submissionCooldownRemaining(history, 'a', 110)).toBe(SUBMISSION_COOLDOWN_SECONDS - 10);
    expect(submissionCooldownRemaining(history, 'a', 100 + SUBMISSION_COOLDOWN_SECONDS)).toBe(0);
  });

  it('only your OWN submissions cool you down', () => {
    expect(submissionCooldownRemaining([sub('b', 100, 3)], 'a', 101)).toBe(0);
  });

  it('measures from the LATEST submission', () => {
    const history = [sub('a', 50, 1), sub('a', 200, 2)];
    expect(submissionCooldownRemaining(history, 'a', 205)).toBe(SUBMISSION_COOLDOWN_SECONDS - 5);
  });

  it('exposes a sane default penalty constant for callers', () => {
    expect(DEFAULT_PENALTY_PER_WRONG_SECONDS).toBeGreaterThan(0);
    expect(SUBMISSION_COOLDOWN_SECONDS).toBeGreaterThan(0);
  });
});
