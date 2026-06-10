/**
 * The single definition of "is this account fully onboarded?" — every route
 * guard derives its redirect from this one rule rather than re-deciding.
 */

export type OnboardingStatus = 'needs-role' | 'needs-github' | 'complete';

export interface OnboardingInput {
  jobRole: string | null;
  githubConnected: boolean;
}

export function onboardingStatus({ jobRole, githubConnected }: OnboardingInput): OnboardingStatus {
  if (jobRole === null) return 'needs-role';
  if (!githubConnected) return 'needs-github';
  return 'complete';
}
