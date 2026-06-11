/**
 * The problem-drafting seam (CLAUDE.md → AI generation layer, pipeline 2:
 * battle problems). A slice asks for a drafted `ProblemSpec`; whether the draft
 * came from the real Anthropic model or the dev curated drafter is invisible to
 * the caller — the same seam shape as `infra/github` and `infra/video`.
 *
 * This file is PROBLEM-SCOPED on purpose: the parallel M17 pool-spec drafter
 * lives in its own `infra/ai` files. There is deliberately NO generic
 * `infra/ai/index.ts` barrel — each AI use case owns its own surface so the two
 * pipelines never couple.
 *
 * A drafted spec is only a CANDIDATE: the draft-problem slice still runs
 * structural validation (`checkProblemSpec`) AND machine verification (the
 * reference solution passes its own hidden tests in Judge0) before the draft
 * reaches the operator queue. The drafter never decides what is bankable.
 */

import type { ProblemSpec, ProblemTier } from '@/domain/battles';

/** What a draft request asks for. The drafter returns specs matching it. */
export interface DraftRequest {
  /** Which tier(s) to draft for. */
  tier: ProblemTier;
  /** How many problems to draft. */
  count: number;
  /** Slugs already in the bank — the drafter must not re-emit these. */
  existingSlugs?: ReadonlySet<string>;
}

/**
 * The drafter contract. `source` lets the slice record where a draft came from
 * (curated fixture vs AI) without sniffing the client type.
 */
export interface ProblemDrafter {
  readonly source: 'curated' | 'ai';
  /** Draft up to `request.count` problem specs for the requested tier. */
  draft(request: DraftRequest): Promise<ProblemSpec[]>;
}

/** True when a real Anthropic key is configured (the AI drafter can run). */
export function isProblemAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Pick the drafter behind the seam (the infra/github / infra/video pattern):
 * with `ANTHROPIC_API_KEY` set, Claude drafts; without it, the curated fixture
 * library seeds the bank deterministically. Problem-scoped factory — there is
 * no generic infra/ai barrel; the M17 pool drafter owns its own selector.
 *
 * Dynamic import of the real client keeps the AI SDK off the dev/seed path
 * (and out of the bundle) until a key is present.
 */
export async function getProblemDrafter(): Promise<ProblemDrafter> {
  if (isProblemAiConfigured()) {
    const { AnthropicProblemDrafter } = await import('./anthropic-problem-drafter');
    return new AnthropicProblemDrafter();
  }
  const { CuratedProblemDrafter } = await import('./curated-problem-drafter');
  return new CuratedProblemDrafter();
}
