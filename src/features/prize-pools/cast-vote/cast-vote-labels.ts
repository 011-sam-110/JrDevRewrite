import type { CastVoteResult } from './cast-vote';

/** Map a cast-vote rejection to a human message for the judging form. */
export function castVoteErrorMessage(result: Extract<CastVoteResult, { ok: false }>): string {
  switch (result.error) {
    case 'not-found':
      return 'That pool no longer exists.';
    case 'not-judging':
      return 'Judging is not open for this pool right now.';
    case 'not-assigned':
      return "You weren't assigned any submissions to judge in this pool.";
    case 'already-voted':
      return "You've already submitted your ranking for this pool.";
    case 'coverage':
      return 'Rank all of your assigned submissions exactly once before submitting.';
    case 'ballot':
      return "That ranking isn't valid. Reload the page and try again.";
  }
}
