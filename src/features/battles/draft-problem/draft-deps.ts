/**
 * Real DB + judge + drafter wiring for the draft pipeline, shared by the
 * operator action and the `problems:seed` CLI so the two can't drift (the
 * scan-deps pattern). Relative imports (no `@/`) because the seed CLI runs under
 * tsx without path-alias config.
 */

import { inArray } from 'drizzle-orm';
import { getDb } from '../../../infra/db/client';
import { problems } from '../../../infra/db/schema';
import { getJudgeClient } from '../../../infra/judge';
import { getProblemDrafter } from '../../../infra/ai/problem-drafter';
import type { DraftProblemDeps } from './draft-problem';

/** Build the real deps (async because the drafter selection is async). */
export async function makeDraftProblemDeps(): Promise<DraftProblemDeps> {
  const drafter = await getProblemDrafter();
  const judge = getJudgeClient();

  return {
    drafter,
    judge,

    existingSlugs: async () => {
      const rows = await getDb().select({ slug: problems.slug }).from(problems);
      return new Set(rows.map((r) => r.slug));
    },

    saveDrafts: async (drafts) => {
      if (drafts.length === 0) return;
      await getDb()
        .insert(problems)
        .values(
          drafts.map((d) => ({
            slug: d.spec.slug,
            title: d.spec.title,
            statementMd: d.spec.statementMd,
            tier: d.spec.tier,
            status: 'draft' as const,
            source: d.source,
            referenceLanguage: d.spec.referenceLanguage,
            referenceSolution: d.spec.referenceSolution,
            hiddenTests: d.spec.hiddenTests,
            verifiedAt: d.verifiedAt,
          })),
        )
        // A re-run finds the slug already claimed (the unique index) and skips
        // it — verification + insert are idempotent, like pools:import.
        .onConflictDoNothing({ target: problems.slug });
    },
  };
}

/** Slugs already in the bank, for the existingSlugs dep used standalone. */
export async function loadExistingProblemSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const rows = await getDb()
    .select({ slug: problems.slug })
    .from(problems)
    .where(inArray(problems.slug, slugs));
  return new Set(rows.map((r) => r.slug));
}
