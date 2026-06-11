/**
 * `npm run problems:seed` — seed the battle problem bank by running the REAL
 * pipeline, not raw inserts: for each tier, draft every curated fixture →
 * validate (kernel) → VERIFY each reference solution against its own hidden
 * tests via `infra/judge` → persist as a verified draft → approve into the bank.
 *
 * Verification goes through real Judge0 when it's running (JUDGE0_URL set —
 * docker compose up judge0), otherwise the dev local-process runner; either way
 * the reference solutions are MACHINE-CHECKED before anything is approved, so a
 * fixture with a wrong expected output can never reach the bank.
 *
 * Idempotent: the draft insert dedups on slug (onConflictDoNothing) and approval
 * only touches still-draft rows, so a re-run adds only what's missing.
 *
 * Thin entry point (VSA): wires real deps and runs the pipeline. Relative
 * imports so tsx needs no path-alias config.
 */

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { PROBLEM_TIERS, type ProblemTier } from '../../../domain/battles';
import { getDb } from '../../../infra/db/client';
import { problems } from '../../../infra/db/schema';
import { isJudge0Configured } from '../../../infra/judge';
import { isProblemAiConfigured } from '../../../infra/ai/problem-drafter';
import { approveProblemDraft, type ReviewProblemDeps } from '../approve-draft/approve-draft';
import { makeDraftProblemDeps } from './draft-deps';
import { draftProblems } from './draft-problem';

/** How many problems to seed per tier (the curated library caps the real number). */
const PER_TIER = 50;

function makeApproveDeps(): ReviewProblemDeps {
  return {
    getProblem: async (problemId) => {
      const row = await getDb().query.problems.findFirst({ where: eq(problems.id, problemId) });
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        verifiedAt: row.verifiedAt,
        rejectedAt: row.rejectedAt,
      };
    },
    setApproved: async (problemId, approvedAt) => {
      await getDb()
        .update(problems)
        .set({ status: 'approved', approvedAt })
        .where(eq(problems.id, problemId));
    },
    setRetired: async () => {
      /* unused in seeding */
    },
    markRejected: async () => {
      /* unused in seeding */
    },
  };
}

async function main(): Promise<number> {
  const now = new Date();
  const draftDeps = await makeDraftProblemDeps();
  const approveDeps = makeApproveDeps();

  console.log(
    `verifier: ${isJudge0Configured() ? 'real Judge0' : 'dev local-process runner'}` +
      ` · drafter: ${isProblemAiConfigured() ? 'Anthropic' : 'curated fixtures'}\n`,
  );

  for (const tier of PROBLEM_TIERS) {
    const report = await draftProblems(
      draftDeps,
      { tier: tier as ProblemTier, count: PER_TIER },
      now,
    );
    for (const slug of report.created) console.log(`drafted+verified  ${tier}  ${slug}`);
    for (const skip of report.skipped) {
      console.log(`skipped           ${tier}  ${skip.slug} (${skip.reason.kind})`);
    }

    // Approve every draft that now exists for this tier (created this run or a
    // prior one). Re-querying keeps the seed idempotent across partial runs.
    const tierDrafts = await getDb()
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.tier, tier as ProblemTier));
    for (const { id } of tierDrafts) {
      await approveProblemDraft(approveDeps, id, now);
    }
  }

  // Report the final approved count per tier.
  const counts = await getDb()
    .select({ tier: problems.tier, status: problems.status })
    .from(problems);
  const approvedByTier: Record<string, number> = {};
  for (const row of counts) {
    if (row.status === 'approved') approvedByTier[row.tier] = (approvedByTier[row.tier] ?? 0) + 1;
  }
  const totalInBank = Object.values(approvedByTier).reduce((a, b) => a + b, 0);
  console.log(
    `\nbank: ${totalInBank} approved problems` +
      ` (${PROBLEM_TIERS.map((t) => `${t}: ${approvedByTier[t] ?? 0}`).join(', ')})`,
  );
  return totalInBank >= 30 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
