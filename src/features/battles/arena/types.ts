/**
 * The arena's submission seam. M14 ships the UI against a scripted mock
 * (`mock-room.ts`); M15's `submit-solution` slice implements the same
 * signature over the real cooldown check → Judge0 run → kernel verdict.
 */

import type { BattleLanguage } from '@/domain/battles';

export interface SubmissionOutcome {
  status: 'accepted' | 'rejected' | 'error';
  testsPassed: number;
  testsTotal: number;
}

export type SubmitSolution = (code: string, language: BattleLanguage) => Promise<SubmissionOutcome>;

/** One row of the verdict feed: a judged submission or an anti-cheat notice. */
export type FeedItem =
  | ({ kind: 'submission'; id: number; atClock: string } & SubmissionOutcome)
  | { kind: 'notice'; id: number; atClock: string; text: string };
