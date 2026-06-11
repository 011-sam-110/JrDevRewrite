import { describe, expect, it } from 'vitest';
import type { BattleCheatSignal, MatchTelemetryRecord } from '../../../domain/battles';
import { LocalSimilarityClient } from '../../../infra/similarity';
import {
  scanBattle,
  type BattleScanContext,
  type PostMatchScanDeps,
  type ScanSubmissionRow,
} from './post-match-scan';

/**
 * The automatic post-match anti-cheat scan: loads the settled battle's
 * persisted evidence (full submission history, server-stamped telemetry, the
 * problem's bank reference solution), lets the kernel judge it, and — on any
 * signal — routes the battle through the kernel's flagBattle into the
 * operator review queue. Elo/XP stay applied (binding); the flag only queues
 * the result for a human.
 */

const NOW = new Date('2026-06-11T12:00:00Z');

const REFERENCE = `const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);
console.log(a + b);`;

const HONEST_SOLUTION = `import sys
values = sys.stdin.read().split()
total = int(values[0]) + int(values[1])
print(total)`;

let nextId = 0;
function sub(partial: Partial<ScanSubmissionRow>): ScanSubmissionRow {
  return {
    id: `sub-${nextId++}`,
    side: 'a',
    code: HONEST_SOLUTION,
    atSeconds: 600,
    passedAll: true,
    testsPassed: 3,
    ...partial,
  };
}

function makeDeps(ctx: BattleScanContext | null) {
  const flagged: { battleId: string; signals: BattleCheatSignal[]; flaggedAt: Date }[] = [];
  const similarity = new LocalSimilarityClient();
  const deps: PostMatchScanDeps = {
    loadScanContext: async () => ctx,
    compare: (a, b) => similarity.compare(a, b),
    flagBattle: async (battleId, signals, flaggedAt) => {
      flagged.push({ battleId, signals, flaggedAt });
    },
  };
  return { deps, flagged };
}

function ctxWith(partial: Partial<BattleScanContext>): BattleScanContext {
  return {
    status: 'resolved',
    winnerSide: 'a',
    timeLimitSeconds: 1800,
    telemetry: [],
    bankSolutions: [{ ref: 'prob-1', code: REFERENCE }],
    submissions: [sub({})],
    ...partial,
  };
}

describe('scanBattle — guards', () => {
  it('unknown battle → not-found', async () => {
    const { deps } = makeDeps(null);
    expect(await scanBattle(deps, 'nope', NOW)).toEqual({ scanned: false, reason: 'not-found' });
  });

  it('only settled (resolved/forfeited) battles are scannable — a live one is not', async () => {
    const { deps, flagged } = makeDeps(ctxWith({ status: 'live' }));
    expect(await scanBattle(deps, 'b1', NOW)).toEqual({
      scanned: false,
      reason: 'not-scannable',
    });
    expect(flagged).toHaveLength(0);
  });

  it('an already-flagged battle is never re-flagged (the canAutoFlag posture)', async () => {
    const { deps, flagged } = makeDeps(ctxWith({ status: 'flagged' }));
    expect(await scanBattle(deps, 'b1', NOW)).toEqual({
      scanned: false,
      reason: 'not-scannable',
    });
    expect(flagged).toHaveLength(0);
  });

  it('a draw has no winning submission to police → no-winner', async () => {
    const { deps } = makeDeps(ctxWith({ winnerSide: null }));
    expect(await scanBattle(deps, 'b1', NOW)).toEqual({ scanned: false, reason: 'no-winner' });
  });

  it('a forfeit win without any winner code has nothing to scan → no-submission', async () => {
    const { deps } = makeDeps(
      ctxWith({ status: 'forfeited', submissions: [sub({ side: 'b', passedAll: false })] }),
    );
    expect(await scanBattle(deps, 'b1', NOW)).toEqual({
      scanned: false,
      reason: 'no-submission',
    });
  });
});

describe('scanBattle — verdicts', () => {
  it('an honest win raises nothing and flags nothing', async () => {
    const { deps, flagged } = makeDeps(ctxWith({}));
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toEqual({ scanned: true, flagged: false, signals: [] });
    expect(flagged).toHaveLength(0);
  });

  it('a winning submission copied from the bank reference solution is flagged', async () => {
    const { deps, flagged } = makeDeps(
      ctxWith({ submissions: [sub({ code: REFERENCE, atSeconds: 300 })] }),
    );
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toMatchObject({ scanned: true, flagged: true });
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.battleId).toBe('b1');
    expect(flagged[0]!.flaggedAt).toBe(NOW);
    expect(flagged[0]!.signals.map((s) => s.reason)).toContain('bank-plagiarism');
  });

  it("a winning submission matching the opponent's code is flagged as collusion", async () => {
    const sharedCode = `function solve(line) {
  const parts = line.trim().split(' ').map(Number);
  return parts[0] + parts[1];
}
console.log(solve(require('fs').readFileSync(0, 'utf8')));`;
    const { deps, flagged } = makeDeps(
      ctxWith({
        submissions: [
          sub({ side: 'b', code: sharedCode, passedAll: false, testsPassed: 2, atSeconds: 200 }),
          sub({ side: 'a', code: sharedCode, atSeconds: 400 }),
        ],
      }),
    );
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toMatchObject({ scanned: true, flagged: true });
    expect(flagged[0]!.signals.map((s) => s.reason)).toContain('opponent-plagiarism');
  });

  it("repeated paste attempts in the winner's telemetry flag AI-likelihood", async () => {
    const pastes: MatchTelemetryRecord[] = [
      { side: 'a', kind: 'paste-blocked', atSeconds: 10 },
      { side: 'a', kind: 'paste-blocked', atSeconds: 11 },
      { side: 'a', kind: 'paste-blocked', atSeconds: 12 },
    ];
    const { deps, flagged } = makeDeps(ctxWith({ telemetry: pastes }));
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toMatchObject({ scanned: true, flagged: true });
    expect(flagged[0]!.signals.map((s) => s.reason)).toContain('ai-likelihood');
  });

  it('an implausibly fast full solve flags a cadence anomaly', async () => {
    const { deps, flagged } = makeDeps(ctxWith({ submissions: [sub({ atSeconds: 10 })] }));
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toMatchObject({ scanned: true, flagged: true });
    expect(flagged[0]!.signals.map((s) => s.reason)).toContain('cadence-anomaly');
  });

  it('assesses the COUNTING submission: an early failed probe does not taint a slow honest solve', async () => {
    const { deps, flagged } = makeDeps(
      ctxWith({
        submissions: [
          sub({ passedAll: false, testsPassed: 0, atSeconds: 10, code: 'print(0)' }),
          sub({ atSeconds: 700 }),
        ],
      }),
    );
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toEqual({ scanned: true, flagged: false, signals: [] });
    expect(flagged).toHaveLength(0);
  });

  it("a timeout winner's best partial is still checked against the bank", async () => {
    const { deps, flagged } = makeDeps(
      ctxWith({
        submissions: [
          sub({ passedAll: false, testsPassed: 2, atSeconds: 900, code: REFERENCE }),
          sub({ side: 'b', passedAll: false, testsPassed: 1, atSeconds: 800 }),
        ],
      }),
    );
    const report = await scanBattle(deps, 'b1', NOW);
    expect(report).toMatchObject({ scanned: true, flagged: true });
    expect(flagged[0]!.signals.map((s) => s.reason)).toContain('bank-plagiarism');
  });
});
