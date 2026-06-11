/**
 * The code-execution seam (CLAUDE.md → Stack: self-hosted Judge0). A slice
 * hands source + language + hidden tests and gets back typed per-test
 * verdicts; whether they came from the real Judge0 REST API, the dev
 * local-process runner, or a scripted mock is invisible to the caller — the
 * same seam shape as `infra/github` and `infra/video`.
 *
 * Judge0 is UNTRUSTED transport: a verdict here is INPUT that a slice routes
 * through the kernel (M11 scoring consumes `testsPassed`/`passedAll`); it
 * never directly mutates a result.
 */

import type { BattleLanguage, HiddenTest } from '@/domain/battles';

/** Per-test outcome, normalized from Judge0's status table. */
export type TestVerdict =
  | 'accepted'
  | 'wrong-answer'
  | 'time-limit'
  | 'runtime-error'
  | 'compile-error'
  | 'internal-error';

export interface TestResult {
  /** Index into the submitted hidden-test array. */
  testIndex: number;
  verdict: TestVerdict;
  /** Wall time in seconds, when the backend reports it. */
  timeSeconds: number | null;
}

export interface JudgeRun {
  /** Every hidden test passed — the M11 `passedAll` input. */
  passedAll: boolean;
  /** How many hidden tests passed — the M11 `testsPassed` input. */
  testsPassed: number;
  results: TestResult[];
}

export interface JudgeSubmission {
  source: string;
  language: BattleLanguage;
  tests: HiddenTest[];
}

/** Result of submitting: one opaque token per hidden test, poll until done. */
export interface JudgeTokens {
  tokens: string[];
}

/** A poll that hasn't settled yet — keep polling. */
export type PollResult = { done: false } | { done: true; run: JudgeRun };

export interface JudgeClient {
  /** Queue one execution per hidden test; returns poll tokens. */
  submit(submission: JudgeSubmission): Promise<JudgeTokens>;
  /** Check the queued executions; `done` only when EVERY test has settled. */
  poll(tokens: JudgeTokens): Promise<PollResult>;
  /** Convenience: submit + poll (with backoff) until done or timed out. */
  run(submission: JudgeSubmission): Promise<JudgeRun>;
}
