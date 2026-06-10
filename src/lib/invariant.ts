/**
 * Assert a condition that must hold; throw with a useful message if it doesn't.
 * TypeScript narrows the condition's type after the call (`asserts` signature).
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}
