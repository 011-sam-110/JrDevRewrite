import { describe, expect, it } from 'vitest';
import { onboardingStatus } from './onboarding';

/**
 * Onboarding completeness is a pure rule so the route guards (landing /
 * onboarding / dashboard) all derive the SAME answer from the same data —
 * no page invents its own definition of "onboarded".
 */
describe('onboardingStatus', () => {
  it('fresh account → needs a job role first', () => {
    expect(onboardingStatus({ jobRole: null, githubConnected: false })).toBe('needs-role');
  });

  it('role chosen but no GitHub → needs the mandatory GitHub connect', () => {
    expect(onboardingStatus({ jobRole: 'backend', githubConnected: false })).toBe('needs-github');
  });

  it('role + GitHub → complete', () => {
    expect(onboardingStatus({ jobRole: 'backend', githubConnected: true })).toBe('complete');
  });

  it('GitHub connected but no role (out-of-order) → still needs the role', () => {
    // Order is role-first by design, but the rule must be total: any state a
    // crashed/abandoned onboarding can leave the row in still maps to a step.
    expect(onboardingStatus({ jobRole: null, githubConnected: true })).toBe('needs-role');
  });
});
