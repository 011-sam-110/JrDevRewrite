import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class strings with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values (conditional classes)', () => {
    expect(cn('base', false, undefined, null, '', 'active')).toBe('base active');
  });

  it('returns an empty string when everything is falsy', () => {
    expect(cn(false, undefined, null)).toBe('');
  });
});
