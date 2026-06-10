import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

/**
 * Direct-DB seeding for e2e: the join journey needs a published pool with an
 * open join window, and driving the whole import → operator-approval flow in
 * every test run would make this spec hostage to unrelated slices. Raw SQL
 * via pg (not the app's drizzle client) keeps the test process decoupled
 * from Next's module graph.
 */

export interface SeededPool {
  id: string;
  slug: string;
  title: string;
}

export async function seedPublishedPool(opts: {
  role: string;
  difficulty?: string;
  title?: string;
}): Promise<SeededPool> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const slug = `e2e-${opts.role}-${Date.now()}-${id.slice(0, 4)}`;
  const title = opts.title ?? `E2E ${opts.role} pool ${id.slice(0, 4)}`;
  const now = Date.now();
  const HOUR = 3_600_000;

  try {
    await db.query(
      `insert into pools (
         id, slug, title, role, difficulty, status, source, brief, requirements,
         join_window_hours, build_window_hours, judging_window_hours,
         entrant_cap, min_entrants, extensions_used,
         join_deadline, build_deadline, judging_deadline, published_at
       ) values ($1, $2, $3, $4, $5, 'published', 'manual', $6, $7,
                 24, 72, 48, 30, 6, 0, $8, $9, $10, $11)`,
      [
        id,
        slug,
        title,
        opts.role,
        opts.difficulty ?? 'beginner',
        'Build a small real project against this brief. Seeded by the e2e suite.',
        JSON.stringify(['Ship something real', 'Commit as you go']),
        new Date(now + 24 * HOUR),
        new Date(now + 96 * HOUR),
        new Date(now + 144 * HOUR),
        new Date(now),
      ],
    );
  } finally {
    await db.end();
  }

  return { id, slug, title };
}
