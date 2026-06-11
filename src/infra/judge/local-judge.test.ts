import { describe, expect, it } from 'vitest';
import { LocalProcessJudgeClient, normalizeOutput } from './local-judge';

/** Reads all of stdin, prints the sum of whitespace-separated integers. */
const SUM_JS = `
const data = require('fs').readFileSync(0, 'utf8').trim();
const nums = data.length ? data.split(/\\s+/).map(Number) : [];
console.log(nums.reduce((a, b) => a + b, 0));
`;

describe('normalizeOutput (Judge0-style comparison)', () => {
  it('ignores trailing whitespace per line and trailing newlines', () => {
    expect(normalizeOutput('3  \n')).toBe('3');
    expect(normalizeOutput('a \nb\t\n\n\n')).toBe('a\nb');
    expect(normalizeOutput('a\r\nb\r\n')).toBe('a\nb');
  });

  it('does NOT ignore leading whitespace or interior blank lines', () => {
    expect(normalizeOutput(' 3')).toBe(' 3');
    expect(normalizeOutput('a\n\nb')).toBe('a\n\nb');
  });
});

describe('LocalProcessJudgeClient (dev verifier — javascript via node)', () => {
  const client = new LocalProcessJudgeClient();

  it('accepts a correct solution on every test', async () => {
    const run = await client.run({
      source: SUM_JS,
      language: 'javascript',
      tests: [
        { input: '1 2', expectedOutput: '3' },
        { input: '10 -4 1', expectedOutput: '7' },
        { input: '', expectedOutput: '0' },
      ],
    });
    expect(run.passedAll).toBe(true);
    expect(run.testsPassed).toBe(3);
  });

  it('reports wrong-answer per failing test, with partial credit', async () => {
    const run = await client.run({
      source: SUM_JS,
      language: 'javascript',
      tests: [
        { input: '1 2', expectedOutput: '3' },
        { input: '1 2', expectedOutput: '4' }, // wrong expectation → WA
      ],
    });
    expect(run.passedAll).toBe(false);
    expect(run.testsPassed).toBe(1);
    expect(run.results[1]?.verdict).toBe('wrong-answer');
  });

  it('maps a crash to runtime-error', async () => {
    const run = await client.run({
      source: 'throw new Error("boom")',
      language: 'javascript',
      tests: [{ input: '', expectedOutput: 'never' }],
    });
    expect(run.passedAll).toBe(false);
    expect(run.results[0]?.verdict).toBe('runtime-error');
  });

  it('rejects languages it has no local runtime for', async () => {
    await expect(
      client.run({ source: 'int main(){}', language: 'cpp', tests: [] }),
    ).rejects.toThrow(/local judge/i);
  });

  it('satisfies the submit/poll half of the seam too', async () => {
    const tokens = await client.submit({
      source: SUM_JS,
      language: 'javascript',
      tests: [{ input: '2 2', expectedOutput: '4' }],
    });
    const polled = await client.poll(tokens);
    expect(polled.done).toBe(true);
    if (!polled.done) throw new Error('unreachable');
    expect(polled.run.passedAll).toBe(true);
  });
});
