import { expect, test } from '@playwright/test';
import { addSubmittedEntry, runPoolsTick, seedJudgingPool, seedUser } from './seed';

/**
 * The M9 full-loop tail: judge → close → results. A pool sits in `judging` with
 * its deadline already passed and three submitted entries. Each entrant judges
 * their anonymized set through the UI (the M8 surface), then the REAL lifecycle
 * cron (`pools:tick`) closes the pool — driving judging → closed and the
 * finalize-results award. We then assert the reveal page shows the podium + the
 * "you earned" XP, and that the close actually moved the winner's profile.
 *
 * Earlier stages (join → build → submit) are covered by pools.spec / submit.spec
 * and seeded here, because a single pool can't show join, submit, judge AND close
 * through real time windows in one run. Requires the local Postgres + that
 * `npm run pools:tick` can reach the same DB the dev server uses.
 */
test('a judged pool closes and reveals results with XP awarded', async ({ page }) => {
  const stamp = Date.now();
  const pool = await seedJudgingPool({ role: 'backend', expired: true });

  const entrants = [
    { email: `e2e-close-a-${stamp}@sussex.ac.uk`, repo: `https://github.com/e2e-close/a-${stamp}` },
    { email: `e2e-close-b-${stamp}@sussex.ac.uk`, repo: `https://github.com/e2e-close/b-${stamp}` },
    { email: `e2e-close-c-${stamp}@sussex.ac.uk`, repo: `https://github.com/e2e-close/c-${stamp}` },
  ];
  for (const e of entrants) {
    const userId = await seedUser(e.email);
    await addSubmittedEntry(pool.id, userId, e.repo);
  }

  const judgeUrl = `/pools/${pool.id}/judge`;

  // 1. Every entrant discharges their judging duty (creates the ballots).
  for (const e of entrants) {
    await page.goto(`/dev/login?email=${e.email}&next=${encodeURIComponent(judgeUrl)}`);
    await expect(page.getByText(/your assigned submissions/i)).toBeVisible();
    await page.getByRole('button', { name: /submit ranking/i }).click();
    await expect(page.getByRole('heading', { name: /judging complete/i })).toBeVisible();
  }

  // 2. The scheduled job closes the pool and finalizes results (the real path).
  const tickOut = runPoolsTick();
  expect(tickOut).toMatch(/judging → closed/);

  // 3. The reveal page shows the podium and the standings.
  const resultsUrl = `/pools/${pool.id}/results`;
  await page.goto(`/dev/login?email=${entrants[0]!.email}&next=${encodeURIComponent(resultsUrl)}`);

  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByText('Final standings')).toBeVisible();
  // The gold podium card (a <p>, not the "You finished 1st" heading span).
  await expect(page.getByRole('paragraph').filter({ hasText: '1st' })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m9-results.png', fullPage: true });

  // 4. The "you earned" panel proves XP was actually granted to this entrant.
  const earned = page.getByText('XP earned');
  await expect(earned).toBeVisible();
  await expect(page.getByText(/\+\d+/).first()).toBeVisible();

  // 5. The pool detail now routes to results, and the dashboard reflects the XP.
  await page.goto(`/pools/${pool.id}`);
  await expect(page.getByRole('link', { name: /view results/i })).toBeVisible();

  await page.goto('/dashboard');
  // The Level card sub reads "<xp> XP · <n> to next" — a non-zero XP confirms the
  // close moved real gamification state end to end.
  await expect(page.getByText(/\bXP ·/)).toBeVisible();
  await expect(page.getByText(/^0 XP/)).toHaveCount(0);
  await page.screenshot({ path: '.claude/debug-shots/m9-dashboard.png', fullPage: true });
});
