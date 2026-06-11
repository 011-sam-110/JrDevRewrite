import { describe, expect, it, vi } from 'vitest';
import { SUBMISSION_COOLDOWN_SECONDS, type BattleSubmission } from '@/domain/battles';
import type { JudgeRun } from '@/infra/judge';
import { submitSolution, type SubmitContext, type SubmitSolutionDeps } from './submit-solution';

/**
 * The submission path: cooldown gate (BEFORE a judge run is spent) → Judge0 →
 * verdict recorded → decisive settle ONLY on a full pass. The Judge0 verdict
 * is the sole authority: nothing here trusts a client claim, and a failing
 * run can never settle anything — the "WS finished events decide nothing"
 * binding is structural (there IS no finished event; the only resolver input
 * is the judge run this slice performs).
 */

const GO_AT = new Date('2026-07-01T12:00:00Z');
const NOW = (seconds: number) => new Date(GO_AT.getTime() + seconds * 1000);

function context(overrides: Partial<SubmitContext> = {}): SubmitContext {
  return {
    battle: {
      id: 'battle-1',
      status: 'live',
      goAt: GO_AT,
      timeLimitSeconds: 1800,
      players: { a: 'user-a', b: 'user-b' },
    },
    hiddenTests: [
      { input: '1 2', expectedOutput: '3' },
      { input: '5 5', expectedOutput: '10' },
      { input: '0 0', expectedOutput: '0' },
    ],
    history: [],
    ...overrides,
  };
}

function passRun(tests: number): JudgeRun {
  return {
    passedAll: true,
    testsPassed: tests,
    results: Array.from({ length: tests }, (_, i) => ({
      testIndex: i,
      verdict: 'accepted' as const,
      timeSeconds: 0.01,
    })),
  };
}

function failRun(passed: number, total: number): JudgeRun {
  return {
    passedAll: false,
    testsPassed: passed,
    results: Array.from({ length: total }, (_, i) => ({
      testIndex: i,
      verdict: i < passed ? ('accepted' as const) : ('wrong-answer' as const),
      timeSeconds: 0.01,
    })),
  };
}

function makeDeps(overrides: Partial<SubmitSolutionDeps> = {}): SubmitSolutionDeps {
  return {
    loadSubmitContext: vi.fn(async () => context()),
    runJudge: vi.fn(async () => passRun(3)),
    recordSubmission: vi.fn(async () => {}),
    settleDecisive: vi.fn(async () => {}),
    now: () => NOW(120),
    ...overrides,
  };
}

describe('submitSolution — guards', () => {
  it('rejects a non-player without spending a judge run', async () => {
    const deps = makeDeps();
    const result = await submitSolution(deps, 'stranger', 'battle-1', 'code', 'python');
    expect(result).toEqual({ ok: false, error: 'not-a-player' });
    expect(deps.runJudge).not.toHaveBeenCalled();
  });

  it('rejects when the battle is not live', async () => {
    const deps = makeDeps({
      loadSubmitContext: vi.fn(async () =>
        context({
          battle: { ...context().battle, status: 'countdown' },
        }),
      ),
    });
    const result = await submitSolution(deps, 'user-a', 'battle-1', 'code', 'python');
    expect(result).toEqual({ ok: false, error: 'not-live' });
  });

  it('rejects an unknown battle', async () => {
    const deps = makeDeps({ loadSubmitContext: vi.fn(async () => null) });
    const result = await submitSolution(deps, 'user-a', 'missing', 'code', 'python');
    expect(result).toEqual({ ok: false, error: 'not-found' });
  });

  it('the deadline instant is closed — a submission AT the limit is too late', async () => {
    const deps = makeDeps({ now: () => NOW(1800) });
    const result = await submitSolution(deps, 'user-a', 'battle-1', 'code', 'python');
    expect(result).toEqual({ ok: false, error: 'window-closed' });
    expect(deps.runJudge).not.toHaveBeenCalled();
  });

  it('enforces the cooldown BEFORE spending a judge run', async () => {
    const lastShot: BattleSubmission = {
      player: 'a',
      atSeconds: 100,
      passedAll: false,
      testsPassed: 1,
    };
    const deps = makeDeps({
      loadSubmitContext: vi.fn(async () => context({ history: [lastShot] })),
      now: () => NOW(110), // 10s after the last submission, cooldown 30s
    });
    const result = await submitSolution(deps, 'user-a', 'battle-1', 'code', 'python');
    expect(result).toEqual({
      ok: false,
      error: 'cooldown',
      remainingSeconds: SUBMISSION_COOLDOWN_SECONDS - 10,
    });
    expect(deps.runJudge).not.toHaveBeenCalled();
    expect(deps.recordSubmission).not.toHaveBeenCalled();
  });

  it("the opponent's recent submission does not cool ME down", async () => {
    const opponentShot: BattleSubmission = {
      player: 'b',
      atSeconds: 115,
      passedAll: false,
      testsPassed: 1,
    };
    const deps = makeDeps({
      loadSubmitContext: vi.fn(async () => context({ history: [opponentShot] })),
      now: () => NOW(120),
    });
    const result = await submitSolution(deps, 'user-a', 'battle-1', 'code', 'python');
    expect(result.ok).toBe(true);
  });
});

describe('submitSolution — the judge verdict is the only authority', () => {
  it('a full pass records the submission and settles decisively', async () => {
    const deps = makeDeps({ runJudge: vi.fn(async () => passRun(3)) });
    const result = await submitSolution(deps, 'user-b', 'battle-1', 'solution', 'javascript');

    expect(result).toEqual({
      ok: true,
      outcome: { status: 'accepted', testsPassed: 3, testsTotal: 3 },
    });
    expect(deps.recordSubmission).toHaveBeenCalledWith({
      battleId: 'battle-1',
      userId: 'user-b',
      side: 'b',
      language: 'javascript',
      code: 'solution',
      atSeconds: 120,
      testsPassed: 3,
      testsTotal: 3,
      passedAll: true,
    });
    expect(deps.settleDecisive).toHaveBeenCalledExactlyOnceWith('battle-1');
  });

  it('a failing verdict is recorded but settles NOTHING', async () => {
    const deps = makeDeps({ runJudge: vi.fn(async () => failRun(2, 3)) });
    const result = await submitSolution(deps, 'user-a', 'battle-1', 'wrong', 'python');

    expect(result).toEqual({
      ok: true,
      outcome: { status: 'rejected', testsPassed: 2, testsTotal: 3 },
    });
    expect(deps.recordSubmission).toHaveBeenCalledTimes(1);
    expect(deps.settleDecisive).not.toHaveBeenCalled();
  });

  it('a judge infrastructure failure is an error outcome — not a wrong answer, no penalty', async () => {
    const deps = makeDeps({
      runJudge: vi.fn(async () => {
        throw new Error('judge0 unreachable');
      }),
    });
    const result = await submitSolution(deps, 'user-a', 'battle-1', 'code', 'python');

    expect(result).toEqual({
      ok: true,
      outcome: { status: 'error', testsPassed: 0, testsTotal: 3 },
    });
    expect(deps.recordSubmission).not.toHaveBeenCalled();
    expect(deps.settleDecisive).not.toHaveBeenCalled();
  });

  it('runs the judge against the problem hidden tests with the submitted source', async () => {
    const deps = makeDeps();
    await submitSolution(deps, 'user-a', 'battle-1', 'my code', 'cpp');
    expect(deps.runJudge).toHaveBeenCalledWith({
      source: 'my code',
      language: 'cpp',
      tests: context().hiddenTests,
    });
  });
});
