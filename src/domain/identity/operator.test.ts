import { describe, expect, it } from 'vitest';
import { isOperator, parseOperatorEmails } from './operator';

describe('parseOperatorEmails', () => {
  it('returns an empty list when the variable is unset or blank', () => {
    expect(parseOperatorEmails(undefined)).toEqual([]);
    expect(parseOperatorEmails('')).toEqual([]);
    expect(parseOperatorEmails('   ')).toEqual([]);
  });

  it('splits on commas, trims whitespace, and lowercases', () => {
    expect(parseOperatorEmails('ab123@sussex.ac.uk, CD456@sussex.ac.uk')).toEqual([
      'ab123@sussex.ac.uk',
      'cd456@sussex.ac.uk',
    ]);
  });

  it('ignores empty segments from stray or trailing commas', () => {
    expect(parseOperatorEmails(',ab123@sussex.ac.uk,,')).toEqual(['ab123@sussex.ac.uk']);
  });
});

describe('isOperator', () => {
  const operators = ['ab123@sussex.ac.uk'];

  it('accepts a listed email', () => {
    expect(isOperator('ab123@sussex.ac.uk', operators)).toBe(true);
  });

  it('matches case-insensitively with surrounding whitespace', () => {
    expect(isOperator('  AB123@Sussex.ac.uk ', operators)).toBe(true);
  });

  it('rejects emails not on the list', () => {
    expect(isOperator('cd456@sussex.ac.uk', operators)).toBe(false);
  });

  it('rejects everyone when the list is empty (deny by default)', () => {
    expect(isOperator('ab123@sussex.ac.uk', [])).toBe(false);
  });

  it('does not prefix-match (ab123@sussex.ac.uk.evil.com is not ab123@sussex.ac.uk)', () => {
    expect(isOperator('ab123@sussex.ac.uk.evil.com', operators)).toBe(false);
  });
});
