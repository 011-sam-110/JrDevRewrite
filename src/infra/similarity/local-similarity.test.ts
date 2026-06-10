import { describe, expect, it } from 'vitest';
import { LocalSimilarityClient } from './local-similarity';
import type { SubmissionFingerprint } from './types';

/** Jaccard over token sets — the v1 detector's only moving part. */
const client = new LocalSimilarityClient();

function fp(entryId: string, tokens: string[]): SubmissionFingerprint {
  return { entryId, tokens };
}

describe('LocalSimilarityClient.compare', () => {
  it('identical token sets score 1 (same repo = the duplicate signal)', () => {
    const a = fp('e1', ['owner:alice', 'name:todo-api']);
    const b = fp('e2', ['owner:alice', 'name:todo-api']);
    expect(client.compare(a, b)).toBe(1);
  });

  it('disjoint token sets score 0', () => {
    const a = fp('e1', ['owner:alice', 'name:todo-api']);
    const b = fp('e2', ['owner:bob', 'name:chat-app']);
    expect(client.compare(a, b)).toBe(0);
  });

  it('partial overlap scores between 0 and 1 (same owner, different repo)', () => {
    const a = fp('e1', ['owner:alice', 'name:todo-api']);
    const b = fp('e2', ['owner:alice', 'name:chat-app']);
    // intersection 1, union 3 → 1/3.
    expect(client.compare(a, b)).toBeCloseTo(1 / 3, 5);
  });

  it('ignores token order and duplication (set semantics)', () => {
    const a = fp('e1', ['name:todo-api', 'owner:alice', 'owner:alice']);
    const b = fp('e2', ['owner:alice', 'name:todo-api']);
    expect(client.compare(a, b)).toBe(1);
  });

  it('an empty fingerprint is unknowable, not identical — scores 0', () => {
    expect(client.compare(fp('e1', []), fp('e2', []))).toBe(0);
    expect(client.compare(fp('e1', ['owner:alice']), fp('e2', []))).toBe(0);
  });
});
