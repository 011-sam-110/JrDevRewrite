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

/**
 * A pool already in `building`: the join window opened (and closed) in the
 * past, the build window is open now. The submission journey needs this state
 * without waiting for the lifecycle cron to advance a published pool through
 * its (multi-day) join window.
 */
export async function seedBuildingPool(opts: {
  role: string;
  difficulty?: string;
  title?: string;
}): Promise<SeededPool> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const slug = `e2e-build-${opts.role}-${Date.now()}-${id.slice(0, 4)}`;
  const title = opts.title ?? `E2E ${opts.role} build pool ${id.slice(0, 4)}`;
  const now = Date.now();
  const HOUR = 3_600_000;

  try {
    await db.query(
      `insert into pools (
         id, slug, title, role, difficulty, status, source, brief, requirements,
         join_window_hours, build_window_hours, judging_window_hours,
         entrant_cap, min_entrants, extensions_used,
         join_deadline, build_deadline, judging_deadline, published_at
       ) values ($1, $2, $3, $4, $5, 'building', 'manual', $6, $7,
                 24, 72, 48, 30, 6, 0, $8, $9, $10, $11)`,
      [
        id,
        slug,
        title,
        opts.role,
        opts.difficulty ?? 'beginner',
        'Build a small real project against this brief. Seeded by the e2e suite.',
        JSON.stringify(['Ship something real', 'Commit as you go']),
        // join window opened 26h ago and closed 2h ago — the build window is open.
        new Date(now - 2 * HOUR), // join_deadline = build window opened
        new Date(now + 70 * HOUR), // build_deadline (submissions due)
        new Date(now + 118 * HOUR), // judging_deadline
        new Date(now - 26 * HOUR), // published_at
      ],
    );
  } finally {
    await db.end();
  }

  return { id, slug, title };
}

/**
 * A pool already in `judging`: join and build windows closed in the past, the
 * judging window is open now. The judging journey needs this state with several
 * submitted entries already in place, without driving the multi-day lifecycle.
 */
export async function seedJudgingPool(opts: {
  role: string;
  difficulty?: string;
  title?: string;
}): Promise<SeededPool> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const slug = `e2e-judge-${opts.role}-${Date.now()}-${id.slice(0, 4)}`;
  const title = opts.title ?? `E2E ${opts.role} judging pool ${id.slice(0, 4)}`;
  const now = Date.now();
  const HOUR = 3_600_000;

  try {
    await db.query(
      `insert into pools (
         id, slug, title, role, difficulty, status, source, brief, requirements,
         join_window_hours, build_window_hours, judging_window_hours,
         entrant_cap, min_entrants, extensions_used,
         join_deadline, build_deadline, judging_deadline, published_at
       ) values ($1, $2, $3, $4, $5, 'judging', 'manual', $6, $7,
                 24, 72, 48, 30, 6, 0, $8, $9, $10, $11)`,
      [
        id,
        slug,
        title,
        opts.role,
        opts.difficulty ?? 'beginner',
        'Build a small real project against this brief. Seeded by the e2e suite.',
        JSON.stringify(['Ship something real', 'Commit as you go']),
        new Date(now - 96 * HOUR), // join window closed long ago
        new Date(now - 2 * HOUR), // build window closed 2h ago
        new Date(now + 46 * HOUR), // judging window open
        new Date(now - 120 * HOUR), // published_at
      ],
    );
  } finally {
    await db.end();
  }

  return { id, slug, title };
}

/** Make the user (looked up by email) an entrant in a pool — without joining via the UI. */
export async function addEntrant(poolId: string, email: string): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(
      `insert into entries (id, pool_id, user_id)
         select $1, $2, id from users where email = $3`,
      [randomUUID(), poolId, email],
    );
  } finally {
    await db.end();
  }
}

/**
 * Create a verified user directly. The anti-cheat scan compares ENTRANTS, so a
 * flagged-path test needs several real users without driving each through the
 * (multi-step) magic-link + onboarding flow. Returns the new user id.
 */
export async function seedUser(email: string, jobRole = 'backend'): Promise<string> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  try {
    await db.query(
      `insert into users (id, email, email_verified, job_role)
         values ($1, $2, now(), $3)`,
      [id, email, jobRole],
    );
  } finally {
    await db.end();
  }
  return id;
}

/**
 * Seed a user's COMPLETE submission in a pool (entrant + repo + submittedAt),
 * moderation_status defaulting to 'none' so the scan can evaluate it. Two users
 * given the same repoUrl is the duplicate the anti-cheat scan must catch.
 */
export async function addSubmittedEntry(
  poolId: string,
  userId: string,
  repoUrl: string,
): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(
      `insert into entries (id, pool_id, user_id, repo_url, repo_created_at, submitted_at)
         values ($1, $2, $3, $4, now(), now())`,
      [randomUUID(), poolId, userId, repoUrl],
    );
  } finally {
    await db.end();
  }
}
