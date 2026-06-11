/**
 * Battle problem-bank rules (M12). The binding pipeline is "AI-drafted,
 * machine-verified, human-approved": a draft must pass `checkProblemSpec`
 * (structural validity, this module) AND machine verification (its reference
 * solution passes its own hidden tests in Judge0 — the slice's job, through
 * `infra/judge`) before it reaches the operator queue; only the operator's
 * `approveProblem` makes it playable, and `retireProblem` is the rotation
 * move for leaked problems (an operational duty per CLAUDE.md).
 *
 * Problems are LANGUAGE-AGNOSTIC stdin/stdout programs: hidden tests are plain
 * IO pairs, so one reference solution (in any supported language) verifies the
 * tests and players may answer in any supported language. Pure module — plain
 * data in, plain data out; Judge0 talk lives in `infra/judge`.
 */

/** Three difficulty tiers (binding). Distinct from POOL difficulty on purpose —
 * pools gate on rank (`beginner/intermediate/advanced`), battle problems are a
 * content scale picked at match time. */
export const PROBLEM_TIERS = ['easy', 'medium', 'hard'] as const;
export type ProblemTier = (typeof PROBLEM_TIERS)[number];

export function isProblemTier(value: string): value is ProblemTier {
  return (PROBLEM_TIERS as readonly string[]).includes(value);
}

/**
 * Bank lifecycle: `draft` (awaiting machine verification + operator approval)
 * → `approved` (in the playable bank) → `retired` (rotated out — leaked or
 * stale; kept for history, never served again).
 */
export const PROBLEM_STATUSES = ['draft', 'approved', 'retired'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/**
 * v1 battle languages (CLAUDE.md suggests Python, JS/TS, Java, C++ — pending
 * Sampo's confirmation, tracked in ROADMAP "Needs from Sampo"). The Judge0
 * language-id mapping lives in `infra/judge`; this list is the DOMAIN fact of
 * what players may write in.
 */
export const BATTLE_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp'] as const;
export type BattleLanguage = (typeof BATTLE_LANGUAGES)[number];

export function isBattleLanguage(value: string): value is BattleLanguage {
  return (BATTLE_LANGUAGES as readonly string[]).includes(value);
}

/** One hidden test: feed `input` on stdin, expect `expectedOutput` on stdout. */
export interface HiddenTest {
  input: string;
  expectedOutput: string;
}

/** A problem as drafted — what validation and verification run against. */
export interface ProblemSpec {
  /** Durable identifier — the bank dedupes on it (same role as pool slugs). */
  slug: string;
  title: string;
  /** The full problem statement, markdown. */
  statementMd: string;
  tier: ProblemTier;
  referenceLanguage: BattleLanguage;
  referenceSolution: string;
  hiddenTests: HiddenTest[];
}

/**
 * Fewer than this and the hidden suite can't meaningfully grade a timeout
 * (the "most tests passed" path in scoring needs granularity). Tunable.
 */
export const MIN_HIDDEN_TESTS = 3;

export type ProblemSpecRejection =
  | 'missing-slug'
  | 'malformed-slug'
  | 'missing-title'
  | 'missing-statement'
  | 'invalid-tier'
  | 'unsupported-language'
  | 'missing-reference-solution'
  | 'too-few-hidden-tests'
  | 'empty-expected-output'
  | 'duplicate-test-input';

export type ProblemSpecCheck = { ok: true } | { ok: false; reasons: ProblemSpecRejection[] };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Structural validity of a drafted problem — collects ALL failed reasons (the
 * `checkJoin` house style) so a drafter (AI or curated) gets one complete
 * report instead of fix-one-resubmit loops. Passing this does NOT make a
 * problem bankable: machine verification in Judge0 is the second, separate
 * gate the draft-problem slice enforces.
 */
export function checkProblemSpec(spec: ProblemSpec): ProblemSpecCheck {
  const reasons: ProblemSpecRejection[] = [];

  if (spec.slug.trim() === '') reasons.push('missing-slug');
  else if (!SLUG_PATTERN.test(spec.slug)) reasons.push('malformed-slug');
  if (spec.title.trim() === '') reasons.push('missing-title');
  if (spec.statementMd.trim() === '') reasons.push('missing-statement');
  if (!isProblemTier(spec.tier)) reasons.push('invalid-tier');
  if (!isBattleLanguage(spec.referenceLanguage)) reasons.push('unsupported-language');
  if (spec.referenceSolution.trim() === '') reasons.push('missing-reference-solution');

  if (spec.hiddenTests.length < MIN_HIDDEN_TESTS) reasons.push('too-few-hidden-tests');
  if (spec.hiddenTests.some((t) => t.expectedOutput.trim() === ''))
    reasons.push('empty-expected-output');
  // Empty INPUT is fine (constant-output problems exist); duplicates are not —
  // an identical input grades nothing new and inflates "tests passed" counts.
  if (new Set(spec.hiddenTests.map((t) => t.input)).size !== spec.hiddenTests.length)
    reasons.push('duplicate-test-input');

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export type ApproveProblemResult =
  | { ok: true; status: 'approved' }
  | { ok: false; error: 'not-a-draft' };

/** The one human transition into the bank — mirrors the pool `approvePool` gate. */
export function approveProblem(status: ProblemStatus): ApproveProblemResult {
  if (status !== 'draft') return { ok: false, error: 'not-a-draft' };
  return { ok: true, status: 'approved' };
}

export type RetireProblemResult =
  | { ok: true; status: 'retired' }
  | { ok: false; error: 'not-approved' };

/**
 * Rotation: only a problem currently IN the bank can be rotated out. Drafts
 * are rejected via archival metadata instead (the pools `rejectedAt` pattern —
 * they never entered the bank, so there is nothing to retire).
 */
export function retireProblem(status: ProblemStatus): RetireProblemResult {
  if (status !== 'approved') return { ok: false, error: 'not-approved' };
  return { ok: true, status: 'retired' };
}

/** What M15's matchmaking may serve into a battle. */
export function isPlayable(status: ProblemStatus): boolean {
  return status === 'approved';
}
