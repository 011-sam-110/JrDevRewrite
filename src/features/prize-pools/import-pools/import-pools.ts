import { parsePoolSpecFile, type PoolSpecDraft, type SpecError } from './spec-format';

/**
 * Use-case: ingest manual pool specs from content/pools/*.md into `draft`
 * pools. All I/O is injected so the behaviour (validate → dedupe → insert)
 * is testable without a filesystem or database; the CLI wires the real deps.
 */
export interface ImportDeps {
  /** Read every spec file (the CLI globs content/pools, skipping docs). */
  loadSpecFiles(): Promise<Array<{ file: string; content: string }>>;
  /** Which of these slugs already have a pool row? (import is idempotent) */
  existingSlugs(candidates: string[]): Promise<Set<string>>;
  /** Insert the validated specs as `draft` pools with source 'manual'. */
  insertDrafts(drafts: PoolSpecDraft[]): Promise<void>;
}

export interface ImportReport {
  created: string[];
  skipped: Array<{ slug: string; reason: 'already-exists' }>;
  errors: SpecError[];
}

export async function importPools(deps: ImportDeps): Promise<ImportReport> {
  const files = await deps.loadSpecFiles();

  const errors: SpecError[] = [];
  const candidates: PoolSpecDraft[] = [];
  const seen = new Map<string, string>(); // slug → file that claimed it first

  for (const { file, content } of files) {
    const parsed = parsePoolSpecFile(file, content);
    errors.push(...parsed.errors);

    for (const spec of parsed.specs) {
      const claimedBy = seen.get(spec.slug);
      if (claimedBy !== undefined) {
        errors.push({
          file,
          entry: spec.slug,
          problems: [`duplicate slug "${spec.slug}" — already defined in ${claimedBy}`],
        });
        continue;
      }
      seen.set(spec.slug, file);
      candidates.push(spec);
    }
  }

  const existing = await deps.existingSlugs(candidates.map((s) => s.slug));
  const skipped = candidates
    .filter((s) => existing.has(s.slug))
    .map((s) => ({ slug: s.slug, reason: 'already-exists' as const }));
  const toInsert = candidates.filter((s) => !existing.has(s.slug));

  if (toInsert.length > 0) await deps.insertDrafts(toInsert);

  return { created: toInsert.map((s) => s.slug), skipped, errors };
}
