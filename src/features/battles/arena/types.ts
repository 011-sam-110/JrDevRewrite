/**
 * The arena's submission seam. M14 ships the UI against a scripted mock
 * (`mock-room.ts`); M15's `submit-solution` slice implements the same
 * signature over the real cooldown check → Judge0 run → kernel verdict.
 * The shapes themselves live in the shared contract (`lib/match-events`) so
 * the slice never imports from this slice folder.
 */

import type { SubmissionOutcome } from '@/lib/match-events';

export type { SubmissionOutcome, SubmitSolution } from '@/lib/match-events';

/** One row of the verdict feed: a judged submission or an anti-cheat notice. */
export type FeedItem =
  | ({ kind: 'submission'; id: number; atClock: string } & SubmissionOutcome)
  | { kind: 'notice'; id: number; atClock: string; text: string };
