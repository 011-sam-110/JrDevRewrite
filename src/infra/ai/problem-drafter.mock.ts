/**
 * Scripted problem drafter for unit tests: returns specs from an injected
 * script with no network, no fixtures. Mirrors MockGitHubConnector /
 * MockJudgeClient in their seams — a slice test controls exactly what the
 * drafter yields (including malformed drafts, to prove the slice's validation
 * gate rejects them).
 */

import type { ProblemSpec } from '@/domain/battles';
import type { DraftRequest, ProblemDrafter } from './problem-drafter';

export class MockProblemDrafter implements ProblemDrafter {
  readonly source: 'curated' | 'ai';
  readonly requests: DraftRequest[] = [];

  constructor(
    private readonly specs: ProblemSpec[] = [],
    source: 'curated' | 'ai' = 'curated',
  ) {
    this.source = source;
  }

  async draft(request: DraftRequest): Promise<ProblemSpec[]> {
    this.requests.push(request);
    const existing = request.existingSlugs ?? new Set<string>();
    return this.specs
      .filter((s) => s.tier === request.tier && !existing.has(s.slug))
      .slice(0, request.count);
  }
}
