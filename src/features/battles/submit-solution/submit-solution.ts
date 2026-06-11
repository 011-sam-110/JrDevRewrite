/**
 * submit-solution — the judge path (CLAUDE.md → battle lifecycle: "cooldown →
 * Judge0 → verdict into kernel"). The order is the rule:
 *
 *   1. guards (player, live, window) and the COOLDOWN — all checked before a
 *      judge run is spent (the judge-spam brake exists to protect Judge0);
 *   2. the judge runs the code against the problem's hidden tests;
 *   3. the verdict is recorded into the submission history (retained in full);
 *   4. ONLY a verdict passing every hidden test settles the battle, through
 *      the resolve-battle engine — which re-derives the winner from the
 *      history via the scoring kernel. Nothing client-sent can resolve a
 *      battle; the WS `progress` frame is cosmetic relay by construction.
 */

import {
  submissionCooldownRemaining,
  type BattleLanguage,
  type BattleStatus,
  type BattleSubmission,
  type HiddenTest,
  type PlayerSide,
} from '@/domain/battles';
import type { JudgeRun } from '@/infra/judge';
import type { SubmissionOutcome } from '@/lib/match-events';

export interface SubmitContext {
  battle: {
    id: string;
    status: BattleStatus;
    goAt: Date | null;
    timeLimitSeconds: number;
    players: { a: string; b: string };
  };
  hiddenTests: HiddenTest[];
  /** This battle's full judged history (the cooldown input). */
  history: BattleSubmission[];
}

export interface SubmitSolutionDeps {
  loadSubmitContext(battleId: string): Promise<SubmitContext | null>;
  runJudge(submission: {
    source: string;
    language: BattleLanguage;
    tests: HiddenTest[];
  }): Promise<JudgeRun>;
  recordSubmission(row: {
    battleId: string;
    userId: string;
    side: PlayerSide;
    language: BattleLanguage;
    code: string;
    atSeconds: number;
    testsPassed: number;
    testsTotal: number;
    passedAll: boolean;
  }): Promise<void>;
  /** Settle decisively via resolve-battle and tell the realtime room. */
  settleDecisive(battleId: string): Promise<void>;
  now(): Date;
}

export type SubmitSolutionResult =
  | { ok: true; outcome: SubmissionOutcome }
  | { ok: false; error: 'not-found' | 'not-a-player' | 'not-live' | 'window-closed' }
  | { ok: false; error: 'cooldown'; remainingSeconds: number };

export async function submitSolution(
  deps: SubmitSolutionDeps,
  userId: string,
  battleId: string,
  code: string,
  language: BattleLanguage,
): Promise<SubmitSolutionResult> {
  const ctx = await deps.loadSubmitContext(battleId);
  if (!ctx) return { ok: false, error: 'not-found' };

  const side: PlayerSide | null =
    userId === ctx.battle.players.a ? 'a' : userId === ctx.battle.players.b ? 'b' : null;
  if (!side) return { ok: false, error: 'not-a-player' };
  if (ctx.battle.status !== 'live' || ctx.battle.goAt === null) {
    return { ok: false, error: 'not-live' };
  }

  // Seconds-from-go, stamped by OUR clock — the scoring kernel's time base.
  const atSeconds = Math.floor((deps.now().getTime() - ctx.battle.goAt.getTime()) / 1000);
  // Deadline inclusive, like every deadline in this codebase: at the limit is late.
  if (atSeconds >= ctx.battle.timeLimitSeconds) return { ok: false, error: 'window-closed' };

  const remaining = submissionCooldownRemaining(ctx.history, side, atSeconds);
  if (remaining > 0) return { ok: false, error: 'cooldown', remainingSeconds: remaining };

  const testsTotal = ctx.hiddenTests.length;
  let run: JudgeRun;
  try {
    run = await deps.runJudge({ source: code, language, tests: ctx.hiddenTests });
  } catch {
    // Judge infra down is OUR failure, not the player's: no penalty, no record.
    return { ok: true, outcome: { status: 'error', testsPassed: 0, testsTotal } };
  }

  await deps.recordSubmission({
    battleId,
    userId,
    side,
    language,
    code,
    atSeconds,
    testsPassed: run.testsPassed,
    testsTotal,
    passedAll: run.passedAll,
  });

  if (run.passedAll) await deps.settleDecisive(battleId);

  return {
    ok: true,
    outcome: {
      status: run.passedAll ? 'accepted' : 'rejected',
      testsPassed: run.testsPassed,
      testsTotal,
    },
  };
}
