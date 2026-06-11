import { describe, expect, it } from 'vitest';
import { codeFingerprint } from './fingerprint';
import { LocalSimilarityClient } from './local-similarity';

/**
 * The battle-code fingerprint (M16): normalized token SHINGLES (3-token
 * windows), not bare tokens — bare token sets make every two JS solutions
 * look alike (they all say `const`, `console`, `log`); shingles preserve
 * local ordering, so only genuinely copied code overlaps heavily.
 */

const client = new LocalSimilarityClient();

const SOLUTION = `const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);
console.log(a + b);`;

describe('codeFingerprint', () => {
  it('identical code scores 1 against itself', () => {
    const a = codeFingerprint('s1', SOLUTION);
    const b = codeFingerprint('s2', SOLUTION);
    expect(client.compare(a, b)).toBe(1);
  });

  it('whitespace and case changes do not hide a copy', () => {
    const reformatted = SOLUTION.replace(/\s+/g, ' ').toUpperCase();
    const score = client.compare(
      codeFingerprint('s1', SOLUTION),
      codeFingerprint('s2', reformatted),
    );
    expect(score).toBe(1);
  });

  it('a genuinely different solution to the same problem scores well below the threshold', () => {
    const other = `import sys
nums = sys.stdin.read().split()
print(int(nums[0]) + int(nums[1]))`;
    const score = client.compare(codeFingerprint('s1', SOLUTION), codeFingerprint('s2', other));
    expect(score).toBeLessThan(0.5);
  });

  it('a near-copy with one renamed variable still scores high', () => {
    const renamed = SOLUTION.replace(/\bb\b/g, 'y');
    const score = client.compare(codeFingerprint('s1', SOLUTION), codeFingerprint('s2', renamed));
    expect(score).toBeGreaterThan(0.5);
  });

  it('carries the ref id and yields an empty fingerprint for empty code (unknowable, scores 0)', () => {
    const empty = codeFingerprint('s1', '   ');
    expect(empty.entryId).toBe('s1');
    expect(empty.tokens).toEqual([]);
    expect(client.compare(empty, codeFingerprint('s2', SOLUTION))).toBe(0);
  });

  it('code shorter than one shingle still fingerprints (falls back to its tokens)', () => {
    const tiny = codeFingerprint('s1', 'print(1)');
    expect(tiny.tokens.length).toBeGreaterThan(0);
    expect(client.compare(tiny, codeFingerprint('s2', 'print(1)'))).toBe(1);
  });
});
