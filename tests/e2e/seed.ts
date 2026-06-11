import 'dotenv/config';
import { execSync } from 'node:child_process';
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
  /** Put the judging deadline in the PAST so a `pools:tick` run closes the pool. */
  expired?: boolean;
}): Promise<SeededPool> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const slug = `e2e-judge-${opts.role}-${Date.now()}-${id.slice(0, 4)}`;
  const title = opts.title ?? `E2E ${opts.role} judging pool ${id.slice(0, 4)}`;
  const now = Date.now();
  const HOUR = 3_600_000;
  // Status stays `judging` either way (only the cron closes it); the deadline
  // controls whether a tick decides judging → closed. Judging via the UI is
  // gated on status, not the deadline, so an expired pool is still judgeable.
  const judgingDeadline = opts.expired ? new Date(now - 1 * HOUR) : new Date(now + 46 * HOUR);

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
        judgingDeadline,
        new Date(now - 120 * HOUR), // published_at
      ],
    );
  } finally {
    await db.end();
  }

  return { id, slug, title };
}

/**
 * Run the real lifecycle cron (`npm run pools:tick`) synchronously — the same
 * production code path the host scheduler runs. The full-loop e2e uses this to
 * close a pool whose judging deadline has passed (driving judging → closed and
 * the finalize-results award), instead of waiting out the multi-day window or
 * reimplementing the close in the test. Idempotent, so it's safe to call once.
 */
export function runPoolsTick(): string {
  return execSync('npm run pools:tick', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
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
 * A pool already `closed` — for the profile/leaderboard specs, which need
 * finalized pool_results without driving the whole lifecycle. Deadlines all sit
 * in the past.
 */
export async function seedClosedPool(opts: {
  role: string;
  difficulty?: string;
  title?: string;
}): Promise<SeededPool> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const slug = `e2e-closed-${opts.role}-${Date.now()}-${id.slice(0, 4)}`;
  const title = opts.title ?? `E2E ${opts.role} closed pool ${id.slice(0, 4)}`;
  const now = Date.now();
  const HOUR = 3_600_000;
  try {
    await db.query(
      `insert into pools (
         id, slug, title, role, difficulty, status, source, brief, requirements,
         join_window_hours, build_window_hours, judging_window_hours,
         entrant_cap, min_entrants, extensions_used,
         join_deadline, build_deadline, judging_deadline, published_at
       ) values ($1, $2, $3, $4, $5, 'closed', 'manual', $6, $7,
                 24, 72, 48, 30, 6, 0, $8, $9, $10, $11)`,
      [
        id,
        slug,
        title,
        opts.role,
        opts.difficulty ?? 'intermediate',
        'Build a small real project against this brief. Seeded by the e2e suite.',
        JSON.stringify(['Ship something real', 'Commit as you go']),
        new Date(now - 200 * HOUR),
        new Date(now - 100 * HOUR),
        new Date(now - 10 * HOUR),
        new Date(now - 220 * HOUR),
      ],
    );
  } finally {
    await db.end();
  }
  return { id, slug, title };
}

/**
 * Create a verified user WITH a public handle (github_username) and a profile row
 * carrying explicit gamification numbers. The profile/leaderboard specs need
 * several ranked players resolvable at `/u/<handle>` without driving each through
 * sign-up; these users are pure data (never logged in, so their handle is stable).
 * Returns the new user id.
 */
export async function seedRankedUser(opts: {
  email: string;
  handle: string;
  jobRole?: string;
  xp: number;
  level: number;
  globalRank: number;
  poolStreak?: number;
  visibility?: 'public' | 'private';
}): Promise<string> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  try {
    await db.query(
      `insert into users (id, email, email_verified, job_role, github_username)
         values ($1, $2, now(), $3, $4)`,
      [id, opts.email, opts.jobRole ?? 'backend', opts.handle],
    );
    await db.query(
      `insert into profiles (user_id, xp, level, global_rank, pool_streak, visibility, credits)
         values ($1, $2, $3, $4, $5, $6, 5)`,
      [id, opts.xp, opts.level, opts.globalRank, opts.poolStreak ?? 0, opts.visibility ?? 'public'],
    );
  } finally {
    await db.end();
  }
  return id;
}

/**
 * Record a finalized result for a user in a (closed) pool: an entry row + the
 * pool_results row the profile history and per-role leaderboard read from. Mirrors
 * what the real finalize-results effect writes, without running the close.
 */
export async function addPoolResult(
  poolId: string,
  userId: string,
  opts: {
    placement: number | null;
    xpAwarded: number;
    rankAwarded: number;
    submitted?: boolean;
    judged?: boolean;
    score?: number;
  },
): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const submitted = opts.submitted ?? true;
  try {
    const entry = await db.query(
      `insert into entries (id, pool_id, user_id, submitted_at)
         values ($1, $2, $3, ${submitted ? 'now()' : 'null'})
       returning id`,
      [randomUUID(), poolId, userId],
    );
    const entryId = entry.rows[0].id as string;
    await db.query(
      `insert into pool_results (
         id, pool_id, entry_id, user_id, placement, score,
         eligible_to_win, submitted, judged, xp_awarded, rank_awarded, streak_after
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)`,
      [
        randomUUID(),
        poolId,
        entryId,
        userId,
        opts.placement,
        opts.score ?? 0,
        opts.placement != null,
        submitted,
        opts.judged ?? true,
        opts.xpAwarded,
        opts.rankAwarded,
      ],
    );
  } finally {
    await db.end();
  }
}

/** Look up a user id by email (for assertions/seeding against a dev-login user). */
export async function userIdByEmail(email: string): Promise<string> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await db.query(`select id from users where email = $1`, [email]);
    return res.rows[0].id as string;
  } finally {
    await db.end();
  }
}

/** Set a user's profile gamification numbers (e.g. give a dev-login user a rank). */
export async function setProfileNumbers(
  userId: string,
  opts: { xp?: number; level?: number; globalRank?: number; poolStreak?: number },
): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await db.query(
      `update profiles
          set xp = coalesce($2, xp),
              level = coalesce($3, level),
              global_rank = coalesce($4, global_rank),
              pool_streak = coalesce($5, pool_streak)
        where user_id = $1`,
      [
        userId,
        opts.xp ?? null,
        opts.level ?? null,
        opts.globalRank ?? null,
        opts.poolStreak ?? null,
      ],
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

/**
 * The battle e2e's known problem: a fixed slug the dev server is told to pick
 * (E2E_FORCE_PROBLEM_SLUG in playwright.config), upserted as APPROVED so the
 * spec can type a known-correct solution. Idempotent across runs.
 */
export const E2E_PROBLEM_SLUG = 'e2e-sum-two-integers';

export async function seedApprovedProblem(): Promise<{ id: string; title: string }> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const title = 'E2E Sum of Two Integers';
  const tests = [
    { input: '1 2\n', expectedOutput: '3\n' },
    { input: '5 5\n', expectedOutput: '10\n' },
    { input: '0 0\n', expectedOutput: '0\n' },
  ];
  try {
    const result = await db.query(
      `insert into problems (
         id, slug, title, statement_md, tier, status, source,
         reference_language, reference_solution, hidden_tests,
         verified_at, approved_at
       ) values ($1, $2, $3, $4, 'easy', 'approved', 'curated',
                 'javascript', $5, $6, now(), now())
       on conflict (slug) do update
         set status = 'approved', retired_at = null, approved_at = now()
       returning id`,
      [
        id,
        E2E_PROBLEM_SLUG,
        title,
        'Read two space-separated integers `a` and `b` on one line. Print their sum.',
        "const [a,b]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log(a+b)",
        JSON.stringify(tests),
      ],
    );
    return { id: (result.rows[0] as { id: string }).id, title };
  } finally {
    await db.end();
  }
}
