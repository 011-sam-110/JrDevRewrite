/**
 * Pure verdict plumbing for the judge seam: Judge0's numeric status table →
 * our typed `TestVerdict`, plus the per-test → run aggregation both real and
 * dev clients share. Kept side-effect-free so the mapping is unit-testable
 * without a judge anywhere.
 */

import type { BattleLanguage } from '@/domain/battles';
import type { JudgeRun, TestResult, TestVerdict } from './types';

/**
 * Judge0 CE status ids (https://ce.judge0.com → GET /statuses):
 *   1 In Queue · 2 Processing · 3 Accepted · 4 Wrong Answer · 5 TLE ·
 *   6 Compilation Error · 7–12 Runtime Error variants (SIGSEGV/SIGXFSZ/
 *   SIGFPE/SIGABRT/NZEC/Other) · 13 Internal Error · 14 Exec Format Error.
 * Anything unknown maps to internal-error: an unrecognized status must never
 * silently count as a pass.
 */
export function mapJudge0Status(statusId: number): TestVerdict | 'pending' {
  if (statusId === 1 || statusId === 2) return 'pending';
  if (statusId === 3) return 'accepted';
  if (statusId === 4) return 'wrong-answer';
  if (statusId === 5) return 'time-limit';
  if (statusId === 6) return 'compile-error';
  if (statusId >= 7 && statusId <= 12) return 'runtime-error';
  return 'internal-error';
}

/** Fold per-test results into the run shape M11 scoring consumes. */
export function aggregateRun(results: TestResult[]): JudgeRun {
  const testsPassed = results.filter((r) => r.verdict === 'accepted').length;
  return {
    passedAll: results.length > 0 && testsPassed === results.length,
    testsPassed,
    results,
  };
}

/**
 * Judge0 CE language ids for the v1 battle set (GET /languages on 1.13.1):
 * Python 3.8.1, Node 12.14, TypeScript 3.7.4, OpenJDK 13, GCC 9.2.
 */
export const JUDGE0_LANGUAGE_IDS: Record<BattleLanguage, number> = {
  python: 71,
  javascript: 63,
  typescript: 74,
  java: 62,
  cpp: 54,
};
