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
 * Adapter seam (the infra/github / infra/video pattern): with JUDGE0_URL set
 * the real sandboxed Judge0 answers; without it the dev local-process runner
 * keeps the verification pipeline machine-checked. Player submissions (M15)
 * must only ever run with Judge0 configured — the local runner is unsandboxed
 * and exists for verifying OUR reference solutions in dev.
 */
export function getJudgeClient(): JudgeClient {
  return isJudge0Configured() ? new Judge0Client() : new LocalProcessJudgeClient();
}
