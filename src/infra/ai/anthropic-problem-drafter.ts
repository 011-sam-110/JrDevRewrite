/**
 * The REAL problem drafter: Claude drafts statement + reference solution +
 * hidden tests via the Vercel AI SDK with the Anthropic provider (CLAUDE.md →
 * AI layer). High-stakes generation, so the model is `claude-opus-4-8` (the
 * default for pool specs / battle problems per CLAUDE.md; consult the
 * `claude-api` skill for current IDs rather than hardcoding from memory).
 *
 * This client ONLY activates when `ANTHROPIC_API_KEY` is set (see
 * `getProblemDrafter`). The key is not available in dev, so the curated drafter
 * seeds the bank; this path is what runs once a key lands. The SDK packages
 * (`ai`, `@ai-sdk/anthropic`, `zod`) are imported dynamically so the rest of the
 * app builds without them until the AI path is wired.
 *
 * A drafted spec is still a CANDIDATE: the draft-problem slice runs structural
 * validation AND machine verification (reference solution passes its own hidden
 * tests in Judge0) before it reaches the operator queue. The model's word is
 * never trusted — Judge0's verdict is.
 */

import { BATTLE_LANGUAGES, PROBLEM_TIERS, type ProblemSpec } from '@/domain/battles';
import type { DraftRequest, ProblemDrafter } from './problem-drafter';

const MODEL_ID = 'claude-opus-4-8';

const SYSTEM_PROMPT = [
  'You draft competitive-programming problems for 1v1 timed coding battles.',
  'Each problem is a self-contained stdin/stdout task: read input from standard input,',
  'write the answer to standard output. Problems must be LANGUAGE-AGNOSTIC — the hidden',
  'tests are plain input/expected-output pairs, so one reference solution verifies them',
  'and players may answer in any language.',
  '',
  'For each problem produce: a url-safe slug, a title, a markdown statement, a difficulty',
  'tier, a reference language, a correct reference solution in that language, and at least',
  'three hidden tests with DISTINCT inputs whose expected outputs are EXACTLY what the',
  'reference solution prints (trailing whitespace ignored). The reference solution MUST be',
  'correct — it will be executed against your own hidden tests in a sandbox and rejected if',
  'it does not pass every one.',
].join('\n');

export class AnthropicProblemDrafter implements ProblemDrafter {
  readonly source = 'ai' as const;

  async draft(request: DraftRequest): Promise<ProblemSpec[]> {
    if (!PROBLEM_TIERS.includes(request.tier)) {
      throw new RangeError(`unknown tier '${request.tier}'`);
    }
    // Dynamic import: the AI SDK is only needed on this real path. Keeping it
    // lazy means the app (and tests, which use the mock/curated drafters)
    // builds without the dependency until a key is configured.
    const [{ generateObject }, { anthropic }, { z }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/anthropic'),
      import('zod'),
    ]);

    const hiddenTestSchema = z.object({
      input: z.string(),
      expectedOutput: z.string(),
    });
    const specSchema = z.object({
      slug: z.string(),
      title: z.string(),
      statementMd: z.string(),
      referenceLanguage: z.enum(BATTLE_LANGUAGES),
      referenceSolution: z.string(),
      hiddenTests: z.array(hiddenTestSchema).min(3),
    });

    const existing = [...(request.existingSlugs ?? new Set<string>())];
    const { object } = await generateObject({
      model: anthropic(MODEL_ID),
      system: SYSTEM_PROMPT,
      schema: z.object({ problems: z.array(specSchema) }),
      prompt: [
        `Draft ${request.count} distinct ${request.tier}-tier battle problems.`,
        existing.length > 0 ? `Do not reuse these slugs: ${existing.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    // Stamp the requested tier (the policy decides tier, not the model).
    return object.problems.map((p) => ({ ...p, tier: request.tier }));
  }
}
