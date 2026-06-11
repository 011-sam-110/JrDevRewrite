import { Judge0Client } from './judge0-client';
import { LocalProcessJudgeClient } from './local-judge';
import type { JudgeClient } from './types';

export { Judge0Client } from './judge0-client';
export { LocalProcessJudgeClient, normalizeOutput } from './local-judge';
export { allAcceptedRun, failingRun, MockJudgeClient, type JudgeScript } from './mock-judge';
export type {
  JudgeClient,
  JudgeRun,
  JudgeSubmission,
  JudgeTokens,
  PollResult,
  TestResult,
  TestVerdict,
} from './types';
export { aggregateRun, JUDGE0_LANGUAGE_IDS, mapJudge0Status } from './verdict';

export function isJudge0Configured(): boolean {
  return Boolean(process.env.JUDGE0_URL);
}

/**
 * Dev/e2e-only escape hatch: a NON-EMPTY env var that forces the local
 * runner even when .env configures JUDGE0_URL. It exists because Next's env
 * loader refills empty-string overrides from .env, so "unset JUDGE0_URL for
 * this spawned server" cannot be expressed — a positive flag can. Hard-gated
 * out of production like /dev/login.
 */
function isLocalJudgeForced(): boolean {
  return process.env.JUDGE_FORCE_LOCAL === '1' && process.env.NODE_ENV !== 'production';
}

/**
 * Adapter seam (the infra/github / infra/video pattern): with JUDGE0_URL set
 * the real sandboxed Judge0 answers; without it the dev local-process runner
 * keeps the verification pipeline machine-checked. Player submissions (M15)
 * must only ever run with Judge0 configured — the local runner is unsandboxed
 * and exists for verifying OUR reference solutions in dev and for the
 * hermetic battle e2e on localhost.
 */
export function getJudgeClient(): JudgeClient {
  if (isLocalJudgeForced()) return new LocalProcessJudgeClient();
  return isJudge0Configured() ? new Judge0Client() : new LocalProcessJudgeClient();
}
