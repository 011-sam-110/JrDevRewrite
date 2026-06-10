import { expect, test } from '@playwright/test';
import {
  addPoolResult,
  seedClosedPool,
  seedRankedUser,
  setProfileNumbers,
  userIdByEmail,
} from './seed';

/**
 * M10 — profiles & leaderboards. Two journeys:
 *   1. A public profile renders the portfolio (level/XP, wins, badges, history),
 *      and the leaderboard ranks players globally + per-role. "Losses appear in
 *      aggregate stats only" — a non-podium result shows as "Shipped", never a
 *      losing rank.
 *   2. The privacy toggle: switching to private removes the account from the
 *      leaderboard and hides the profile from other viewers (owner still sees it).
 *
 * Data is seeded directly (closed pool + finalized results) rather than driven
 * through the multi-day lifecycle — the close path itself is covered by close.spec.
 */

test('a public profile shows the portfolio and the leaderboard ranks players', async ({ page }) => {
  const stamp = Date.now();
  const pool = await seedClosedPool({ role: 'backend', difficulty: 'intermediate' });

  const champ = {
    email: `champ-${stamp}@sussex.ac.uk`,
    handle: `champ-${stamp}`,
  };
  const runner = {
    email: `runner-${stamp}@sussex.ac.uk`,
    handle: `runner-${stamp}`,
  };
  const tail = {
    email: `tail-${stamp}@sussex.ac.uk`,
    handle: `tail-${stamp}`,
  };

  const champId = await seedRankedUser({
    ...champ,
    xp: 290,
    level: 2,
    globalRank: 5000,
    poolStreak: 1,
  });
  const runnerId = await seedRankedUser({ ...runner, xp: 200, level: 2, globalRank: 4000 });
  const tailId = await seedRankedUser({ ...tail, xp: 90, level: 1, globalRank: 3000 });

  // Finalized results in the backend pool: a win, a 2nd, and a ship-no-podium.
  await addPoolResult(pool.id, champId, {
    placement: 1,
    xpAwarded: 290,
    rankAwarded: 90,
    score: 1,
  });
  await addPoolResult(pool.id, runnerId, {
    placement: 2,
    xpAwarded: 200,
    rankAwarded: 60,
    score: 0.6,
  });
  await addPoolResult(pool.id, tailId, {
    placement: null,
    xpAwarded: 90,
    rankAwarded: 0,
    score: 0.2,
  });

  // A signed-in viewer (separate account) — leaderboard is auth-gated.
  await page.goto(`/dev/login?email=viewer-${stamp}@sussex.ac.uk&next=/dashboard`);

  // --- Champion's profile: the win is celebrated. ---
  await page.goto(`/u/${champ.handle}`);
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByText('Champion').first()).toBeVisible(); // earned gold badge
  await expect(page.getByText('🏆 1st')).toBeVisible(); // won history row
  await expect(page.getByRole('link', { name: pool.title })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m10-profile-champion.png', fullPage: true });

  // --- Tail's profile: shipped, no podium — the loss is aggregate-only. ---
  await page.goto(`/u/${tail.handle}`);
  await expect(page.getByText('Shipped', { exact: true })).toBeVisible(); // the history result tag
  // The loss stays aggregate-only: no trophy and no losing rank in the timeline.
  // (The "Podium"/"Champion" badge NAMES still render in the catalogue, greyed —
  // so we check the history-only trophy glyph, which a non-podium result lacks.)
  await expect(page.getByText('🏆')).toHaveCount(0);

  // --- Global leaderboard: ordered by rank points, champ above runner above tail. ---
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  const hrefs = await page
    .locator('a[href^="/u/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const iChamp = hrefs.indexOf(`/u/${champ.handle}`);
  const iRunner = hrefs.indexOf(`/u/${runner.handle}`);
  const iTail = hrefs.indexOf(`/u/${tail.handle}`);
  expect(iChamp).toBeGreaterThanOrEqual(0);
  expect(iRunner).toBeGreaterThan(iChamp);
  expect(iTail).toBeGreaterThan(iRunner);
  await page.screenshot({ path: '.claude/debug-shots/m10-leaderboard-global.png', fullPage: true });

  // --- Per-role view (computed from pool results): the backend tab lists champ. ---
  await page.getByRole('link', { name: 'Backend', exact: true }).click();
  await expect(page).toHaveURL(/role=backend/);
  await expect(page.locator(`a[href="/u/${champ.handle}"]`)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m10-leaderboard-role.png', fullPage: true });
});

test('the privacy toggle hides a profile from the leaderboard and other viewers', async ({
  page,
}) => {
  const stamp = Date.now();
  const meEmail = `priv-${stamp}@sussex.ac.uk`;
  const meHandle = `priv-${stamp}-dev`; // dev/login appends -dev to the local part

  // Sign in as me (creates the user + profile), then give me a high rank so I'm
  // findable near the top of the global board.
  await page.goto(`/dev/login?email=${meEmail}&next=/dashboard`);
  const meId = await userIdByEmail(meEmail);
  await setProfileNumbers(meId, { xp: 300, level: 2, globalRank: 9000 });

  // I appear on the global board while public.
  await page.goto('/leaderboard');
  await expect(page.locator(`a[href="/u/${meHandle}"]`)).toBeVisible();

  // On my own profile I get the privacy control; switch to private.
  await page.goto(`/u/${meHandle}`);
  await expect(page.getByRole('button', { name: 'Make private' })).toBeVisible();
  await page.getByRole('button', { name: 'Make private' }).click();
  await expect(page.getByRole('button', { name: 'Make public' })).toBeVisible();
  await expect(page.getByText('Private', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m10-profile-private.png', fullPage: true });

  // Now I'm gone from the public leaderboard.
  await page.goto('/leaderboard');
  await expect(page.locator(`a[href="/u/${meHandle}"]`)).toHaveCount(0);

  // And a different viewer sees only the private notice.
  await page.goto(`/dev/login?email=viewer2-${stamp}@sussex.ac.uk&next=/dashboard`);
  await page.goto(`/u/${meHandle}`);
  await expect(page.getByText('This profile is private')).toBeVisible();
});
