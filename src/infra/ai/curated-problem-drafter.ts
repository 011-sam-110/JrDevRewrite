/**
 * The dev/seed drafter: deterministic, backed by the hand-authored fixture
 * library (problem-fixtures.ts). No network, no model — it just serves the
 * curated specs for the requested tier, skipping any slug already in the bank.
 * This is how the bank is seeded when no Anthropic key is configured, and it
 * keeps the whole pipeline (draft → verify → approve) machine-checkable.
 */

import type { ProblemSpec } from '@/domain/battles';
import type { DraftRequest, ProblemDrafter } from './problem-drafter';
import { PROBLEM_FIXTURES } from './problem-fixtures';

export class CuratedProblemDrafter implements ProblemDrafter {
  readonly source = 'curated' as const;

  constructor(private readonly library: readonly ProblemSpec[] = PROBLEM_FIXTURES) {}

  async draft(request: DraftRequest): Promise<ProblemSpec[]> {
    const existing = request.existingSlugs ?? new Set<string>();
    return this.library
      .filter((spec) => spec.tier === request.tier && !existing.has(spec.slug))
      .slice(0, request.count);
  }
}
