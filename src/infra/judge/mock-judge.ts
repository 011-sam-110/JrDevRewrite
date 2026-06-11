/**
 * Scripted judge for unit tests: deterministic, no processes, no network.
 * Default script accepts every test (the happy path); pass a script to fail
 * specific tests. Mirrors MockGitHubConnector's role in the github seam.
 */

import type {
  JudgeClient,
  JudgeRun,
  JudgeSubmission,
  JudgeTokens,
  PollResult,
  TestResult,
} from './types';
import { aggregateRun } from './verdict';

export type JudgeScript = (submission: JudgeSubmission) => JudgeRun;

/** A run where every submitted test is accepted. */
export function allAcceptedRun(submission: JudgeSubmission): JudgeRun {
  const results: TestResult[] = submission.tests.map((_, testIndex) => ({
    testIndex,
    verdict: 'accepted',
    timeSeconds: 0.01,
  }));
  return aggregateRun(results);
}

/** A run failing the given test indexes with wrong-answer. */
export function failingRun(submission: JudgeSubmission, failIndexes: number[]): JudgeRun {
  const results: TestResult[] = submission.tests.map((_, testIndex) => ({
    testIndex,
    verdict: failIndexes.includes(testIndex) ? 'wrong-answer' : 'accepted',
    timeSeconds: 0.01,
  }));
  return aggregateRun(results);
}

export class MockJudgeClient implements JudgeClient {
  readonly submissions: JudgeSubmission[] = [];
  private readonly pending = new Map<string, JudgeRun>();
  private nextToken = 0;

  constructor(private readonly script: JudgeScript = allAcceptedRun) {}

  async run(submission: JudgeSubmission): Promise<JudgeRun> {
    this.submissions.push(submission);
    return this.script(submission);
  }

  async submit(submission: JudgeSubmission): Promise<JudgeTokens> {
    const token = `mock-${this.nextToken++}`;
    this.pending.set(token, await this.run(submission));
    return { tokens: [token] };
  }

  async poll(tokens: JudgeTokens): Promise<PollResult> {
    const token = tokens.tokens[0];
    const run = token === undefined ? undefined : this.pending.get(token);
    if (!run) return { done: false };
    return { done: true, run };
  }
}
