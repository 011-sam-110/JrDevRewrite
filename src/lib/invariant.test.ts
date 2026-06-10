import { describe, expect, it } from 'vitest';
import { invariant } from './invariant';

describe('invariant', () => {
  it('passes silently when the condition holds', () => {
    expect(() => invariant(true, 'never thrown')).not.toThrow();
  });

  it('throws with the message when the condition fails', () => {
    expect(() => invariant(false, 'pool must have >= 6 entrants')).toThrow(
      'Invariant violation: pool must have >= 6 entrants',
    );
  });

  it('narrows types after the assertion', () => {
    const maybe: string | null = 'hello' as string | null;
    invariant(maybe !== null, 'value expected');
    // If narrowing failed this would be a compile error under strict mode.
    expect(maybe.length).toBe(5);
  });
});
