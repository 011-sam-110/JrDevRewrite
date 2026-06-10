import { describe, expect, it } from 'vitest';
import { isJobRole, JOB_ROLES } from './job-roles';

describe('job roles', () => {
  it('covers the launch roles from the spec', () => {
    expect(JOB_ROLES.map((r) => r.id)).toEqual([
      'frontend',
      'backend',
      'fullstack',
      'ml',
      'mobile',
    ]);
  });

  it('isJobRole narrows valid ids', () => {
    expect(isJobRole('backend')).toBe(true);
    expect(isJobRole('ml')).toBe(true);
  });

  it('isJobRole rejects unknown or mis-cased input (form data is untrusted)', () => {
    expect(isJobRole('Backend')).toBe(false);
    expect(isJobRole('devops')).toBe(false);
    expect(isJobRole('')).toBe(false);
  });
});
