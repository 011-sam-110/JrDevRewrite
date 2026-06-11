/**
 * Dev-only judge: runs a solution as a LOCAL child process (node / python)
 * against the IO pairs and compares stdout the way Judge0 does. It exists so
 * the seed/verification pipeline stays machine-checked when the real Judge0
 * container isn't running.
 *
 * NEVER point this at player submissions — it executes code on the host with
 * no sandbox. It is for OUR OWN curated/AI reference solutions during
 * development; battles always go through real Judge0 (M15). The seam gate in
 * index.ts enforces that posture by preferring Judge0 whenever configured.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  JudgeClient,
  JudgeRun,
  JudgeSubmission,
  JudgeTokens,
  PollResult,
  TestResult,
  TestVerdict,
} from './types';
import { aggregateRun } from './verdict';

/**
 * Judge0's default comparison semantics: trailing whitespace on each line and
 * trailing newlines are ignored; everything else is exact.
 */
export function normalizeOutput(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/** Local runtimes we can spawn. Windows ships `python`; node runs this repo. */
const LOCAL_RUNTIMES: Partial<Record<JudgeSubmission['language'], { cmd: string; ext: string }>> = {
  javascript: { cmd: 'node', ext: 'js' },
  python: { cmd: 'python', ext: 'py' },
};

const PER_TEST_TIMEOUT_MS = 10_000;

interface ExecOutcome {
  verdict: TestVerdict;
  stdout: string;
  timeSeconds: number | null;
}

function runOnce(cmd: string, file: string, stdin: string): Promise<ExecOutcome> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = execFile(
      cmd,
      [file],
      { timeout: PER_TEST_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        const timeSeconds = (Date.now() - startedAt) / 1000;
        if (error) {
          const timedOut = 'killed' in error && error.killed === true;
          resolve({ verdict: timedOut ? 'time-limit' : 'runtime-error', stdout: '', timeSeconds });
          return;
        }
        resolve({ verdict: 'accepted', stdout, timeSeconds });
      },
    );
    child.stdin?.end(stdin);
  });
}

export class LocalProcessJudgeClient implements JudgeClient {
  /** submit() executes eagerly; poll() hands the cached run back. */
  private readonly pending = new Map<string, JudgeRun>();
  private nextToken = 0;

  async run(submission: JudgeSubmission): Promise<JudgeRun> {
    const runtime = LOCAL_RUNTIMES[submission.language];
    if (!runtime) {
      throw new Error(
        `No local judge runtime for '${submission.language}' — start real Judge0 (docker compose up judge0) or use a python/javascript reference solution.`,
      );
    }

    const dir = mkdtempSync(join(tmpdir(), 'jrdev-judge-'));
    const file = join(dir, `solution.${runtime.ext}`);
    writeFileSync(file, submission.source, 'utf8');
    try {
      const results: TestResult[] = [];
      for (const [testIndex, test] of submission.tests.entries()) {
        const outcome = await runOnce(runtime.cmd, file, test.input);
        const verdict: TestVerdict =
          outcome.verdict !== 'accepted'
            ? outcome.verdict
            : normalizeOutput(outcome.stdout) === normalizeOutput(test.expectedOutput)
              ? 'accepted'
              : 'wrong-answer';
        results.push({ testIndex, verdict, timeSeconds: outcome.timeSeconds });
      }
      return aggregateRun(results);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async submit(submission: JudgeSubmission): Promise<JudgeTokens> {
    const token = `local-${this.nextToken++}`;
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
