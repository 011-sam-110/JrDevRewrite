/**
 * The REAL judge: Judge0 CE over REST (self-hosted, network-denied — see
 * docker-compose.yml). One Judge0 submission per hidden test via the batch
 * endpoints; everything base64-encoded so arbitrary source/IO bytes survive
 * the JSON trip. Verdict mapping is the pure `verdict.ts` module.
 */

import type {
  JudgeClient,
  JudgeRun,
  JudgeSubmission,
  JudgeTokens,
  PollResult,
  TestResult,
} from './types';
import { aggregateRun, JUDGE0_LANGUAGE_IDS, mapJudge0Status } from './verdict';

const DEFAULT_URL = 'http://localhost:2358';
const POLL_INTERVAL_MS = 500;
const RUN_TIMEOUT_MS = 120_000;

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

interface BatchSubmissionResponse {
  token?: string;
  [key: string]: unknown;
}

interface BatchPollEntry {
  token: string;
  status_id: number;
  time: string | null;
}

export class Judge0Client implements JudgeClient {
  constructor(private readonly baseUrl: string = process.env.JUDGE0_URL ?? DEFAULT_URL) {}

  async submit(submission: JudgeSubmission): Promise<JudgeTokens> {
    const body = {
      submissions: submission.tests.map((test) => ({
        language_id: JUDGE0_LANGUAGE_IDS[submission.language],
        source_code: b64(submission.source),
        stdin: b64(test.input),
        expected_output: b64(test.expectedOutput),
      })),
    };
    const res = await fetch(`${this.baseUrl}/submissions/batch?base64_encoded=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Judge0 batch submit failed: ${res.status} ${await res.text()}`);
    const created = (await res.json()) as BatchSubmissionResponse[];
    const tokens = created.map((entry, i) => {
      if (typeof entry.token !== 'string') {
        throw new Error(`Judge0 rejected submission ${i}: ${JSON.stringify(entry)}`);
      }
      return entry.token;
    });
    return { tokens };
  }

  async poll(tokens: JudgeTokens): Promise<PollResult> {
    if (tokens.tokens.length === 0) return { done: true, run: aggregateRun([]) };
    const qs = new URLSearchParams({
      tokens: tokens.tokens.join(','),
      base64_encoded: 'true',
      fields: 'token,status_id,time',
    });
    const res = await fetch(`${this.baseUrl}/submissions/batch?${qs}`);
    if (!res.ok) throw new Error(`Judge0 batch poll failed: ${res.status} ${await res.text()}`);
    const payload = (await res.json()) as { submissions: BatchPollEntry[] };

    const byToken = new Map(payload.submissions.map((s) => [s.token, s]));
    const results: TestResult[] = [];
    for (const [testIndex, token] of tokens.tokens.entries()) {
      const entry = byToken.get(token);
      if (!entry) return { done: false }; // not visible yet — keep polling
      const verdict = mapJudge0Status(entry.status_id);
      if (verdict === 'pending') return { done: false };
      results.push({
        testIndex,
        verdict,
        timeSeconds: entry.time === null ? null : Number(entry.time),
      });
    }
    return { done: true, run: aggregateRun(results) };
  }

  async run(submission: JudgeSubmission): Promise<JudgeRun> {
    const tokens = await this.submit(submission);
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    for (;;) {
      const polled = await this.poll(tokens);
      if (polled.done) return polled.run;
      if (Date.now() > deadline) throw new Error('Judge0 run timed out waiting for verdicts');
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}
