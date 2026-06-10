/**
 * `npm run pools:import` — the operator command that ingests manual pool
 * specs. Thin entry point (VSA): reads files, wires the real DB deps into
 * importPools, prints the report. Run with the docker db up.
 *
 * Relative imports (no `@/`) so tsx needs no path-alias config.
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import { getDb } from '../../../infra/db/client';
import { pools } from '../../../infra/db/schema';
import { importPools } from './import-pools';

const POOLS_DIR = path.join(process.cwd(), 'content', 'pools');

/** Spec files are lowercase role names; capitalised .md files are docs. */
function isSpecFile(name: string): boolean {
  return name.endsWith('.md') && /^[a-z]/.test(name);
}

async function main(): Promise<number> {
  const report = await importPools({
    loadSpecFiles: async () => {
      const names = (await readdir(POOLS_DIR)).filter(isSpecFile).sort();
      return Promise.all(
        names.map(async (name) => ({
          file: name,
          content: await readFile(path.join(POOLS_DIR, name), 'utf8'),
        })),
      );
    },
    existingSlugs: async (candidates) => {
      if (candidates.length === 0) return new Set();
      const rows = await getDb()
        .select({ slug: pools.slug })
        .from(pools)
        .where(inArray(pools.slug, candidates));
      return new Set(rows.map((r) => r.slug));
    },
    insertDrafts: async (drafts) => {
      await getDb()
        .insert(pools)
        .values(
          drafts.map((d) => ({
            slug: d.slug,
            title: d.title,
            role: d.role,
            difficulty: d.difficulty,
            source: 'manual' as const,
            brief: d.brief,
            requirements: d.requirements,
            joinWindowHours: d.windows.joinHours,
            buildWindowHours: d.windows.buildHours,
            judgingWindowHours: d.windows.judgingHours,
            entrantCap: d.entrantCap,
          })),
        );
    },
  });

  for (const slug of report.created) console.log(`created  draft pool "${slug}"`);
  for (const skip of report.skipped) console.log(`skipped  "${skip.slug}" (${skip.reason})`);
  for (const error of report.errors) {
    console.error(`MALFORMED  ${error.file} → ${error.entry}`);
    for (const problem of error.problems) console.error(`           - ${problem}`);
  }

  console.log(
    `\n${report.created.length} created, ${report.skipped.length} skipped, ${report.errors.length} malformed`,
  );
  return report.errors.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
