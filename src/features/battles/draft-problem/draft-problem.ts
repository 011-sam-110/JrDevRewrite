/**
 * Use-case: draft battle problems into the bank as `draft` rows awaiting
 * operator approval. The pipeline is the binding "AI-drafted, machine-verified,
 * human-approved":
 *
 *   1. DRAFT     — the drafter (curated fixtures in dev, Claude with a key)
 *                  proposes specs for a tier.
 *   2. VALIDATE  — kernel `checkProblemSpec` rejects structurally broken specs
 *                  (the slice never trusts the drafter's shape).
 *   3. VERIFY    — the reference solution MUST pass its OWN hidden tests via
 *                  `infra/judge` (real Judge0 if up, mock in tests). A spec whose
 *                  reference solution can't pass the tests it ships is garbage,
 *                  whatever the model claimed.
 *   4. PERSIST   — survivors land as `draft` (verified, source recorded); only an
 *                  operator's `approveProblem` makes them playable (approve-draft
 *                  slice). Dedup is by slug — re-running never double-inserts.
 *
 * Orchestration only: the kernel owns validity, `infra/judge` owns execution,
 * `infra/ai` owns generation. Plain deps in, a report out — unit-testable with
 * the mock drafter + mock judge, no DB or network.
 */

import { checkProblemSpec, type ProblemSpec, type ProblemSpecRejection } from '@/domain/battles';
import type { JudgeClient } from '@/infra/judge';
import type { DraftRequest, ProblemDrafter } from '@/infra/ai/problem-drafter';

/** A draft persisted to the bank (the row the slice writes). */
export interface DraftedProblem {
  spec: ProblemSpec;
  source: 'curated' | 'ai';
  /** When the reference solution passed its own hidden tests. */
  verifiedAt: Date;
}

export interface DraftProblemDeps {
  drafter: ProblemDrafter;
  judge: JudgeClient;
  /** Slugs already in the bank (any status) — dedup target. */
  existingSlugs(): Promise<Set<string>>;
  /** Persist verified drafts. Implementations dedup on slug (idempotent). */
  saveDrafts(drafts: DraftedProblem[]): Promise<void>;
}

/** Why a candidate didn't make it into the bank, for the report. */
export type SkipReason =
  | { kind: 'invalid'; reasons: ProblemSpecRejection[] }
  | { kind: 'duplicate-slug' }
  | { kind: 'verification-failed'; testsPassed: number; total: number };

export interface DraftProblemReport {
  /** Slugs saved as fresh verified drafts. */
  created: string[];
  /** Candidates rejected, with the reason (the operator/seed log reads this). */
  skipped: { slug: string; reason: SkipReason }[];
}

/**
 * Run the draft → validate → verify → persist pipeline for one tier batch.
 * Pure orchestration over injected deps. `now` stamps verification time.
 */
export async function draftProblems(
  deps: DraftProblemDeps,
  request: DraftRequest,
  now: Date,
): Promise<DraftProblemReport> {
  const existing = await deps.existingSlugs();
  const specs = await deps.drafter.draft({ ...request, existingSlugs: existing });

  const created: string[] = [];
  const skipped: DraftProblemReport['skipped'] = [];
  const toSave: DraftedProblem[] = [];
  // Track slugs claimed within THIS batch too, so a drafter that emits the same
  // slug twice doesn't slip a duplicate past the DB-level dedup.
  const claimed = new Set(existing);

  for (const spec of specs) {
    // 2. VALIDATE — structural gate (kernel), before spending a judge run.
    const check = checkProblemSpec(spec);
    if (!check.ok) {
      skipped.push({ slug: spec.slug, reason: { kind: 'invalid', reasons: check.reasons } });
      continue;
    }
    if (claimed.has(spec.slug)) {
      skipped.push({ slug: spec.slug, reason: { kind: 'duplicate-slug' } });
      continue;
    }

    // 3. VERIFY — the reference solution must pass its OWN hidden tests.
    const run = await deps.judge.run({
      source: spec.referenceSolution,
      language: spec.referenceLanguage,
      tests: spec.hiddenTests,
    });
    if (!run.passedAll) {
      skipped.push({
        slug: spec.slug,
        reason: {
          kind: 'verification-failed',
          testsPassed: run.testsPassed,
          total: spec.hiddenTests.length,
        },
      });
      continue;
    }

    claimed.add(spec.slug);
    toSave.push({ spec, source: deps.drafter.source, verifiedAt: now });
    created.push(spec.slug);
  }

  // 4. PERSIST — one write for the whole survivors set.
  if (toSave.length > 0) await deps.saveDrafts(toSave);

  return { created, skipped };
}
