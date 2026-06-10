import { expect, test } from '@playwright/test';
import { addSubmittedEntry, seedJudgingPool, seedUser } from './seed';

/**
 * The M8 peer-judging journey. A pool sits in `judging` with three submitted
 * entries from three distinct entrants. Each entrant opens the judging page —
 * which lazily generates the randomized, anonymized assignment — sees their
 * assigned demos as "Submission A/B" (never an entrant identity), ranks them,
 * and submits. After voting, the round shows as complete. Requires the local
 * Postgres (docker compose up -d db).
 */
test('three entrants each judge their anonymized set and complete the round', async ({ page }) => {
  const stamp = Date.now();
  const pool = await seedJudgingPool({ role: 'backend' });

  const entrants = [
    { email: `e2e-judge-a-${stamp}@sussex.ac.uk`, repo: `https://github.com/e2e-judge/a-${stamp}` },
    { email: `e2e-judge-b-${stamp}@sussex.ac.uk`, repo: `https://github.com/e2e-judge/b-${stamp}` },
    { email: `e2e-judge-c-${stamp}@sussex.ac.uk`, repo: `https://github.com/e2e-judge/c-${stamp}` },
  ];
  for (const e of entrants) {
    const userId = await seedUser(e.email);
    await addSubmittedEntry(pool.id, userId, e.repo);
  }

  const judgeUrl = `/pools/${pool.id}/judge`;

  // First judge: full walk-through with assertions + screenshots.
  await page.goto(`/dev/login?email=${entrants[0]!.email}&next=${encodeURIComponent(judgeUrl)}`);

  await expect(page.getByRole('heading', { name: /Judge:/i })).toBeVisible();
  await expect(page.getByText(/your assigned submissions/i)).toBeVisible();
  // With 3 entries, each judge reviews the other 2 — anonymized A and B.
  await expect(page.getByText('Submission A')).toBeVisible();
  await expect(page.getByText('Submission B')).toBeVisible();
  // Anonymity: no entrant's identity leaks onto the judging surface.
  for (const e of entrants) await expect(page.getByText(e.email)).toHaveCount(0);

  await page.screenshot({ path: '.claude/debug-shots/m8-judging.png', fullPage: true });

  // Reorder, then submit the ranking. On success the server component
  // revalidates in place to the completed state (the panel is replaced).
  await page.getByRole('button', { name: /move submission a down/i }).click();
  await page.getByRole('button', { name: /submit ranking/i }).click();
  await expect(page.getByRole('heading', { name: /judging complete/i })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m8-after-submit.png', fullPage: true });

  // The other two entrants discharge their judging duty too.
  for (const e of [entrants[1]!, entrants[2]!]) {
    await page.goto(`/dev/login?email=${e.email}&next=${encodeURIComponent(judgeUrl)}`);
    await expect(page.getByText(/your assigned submissions/i)).toBeVisible();
    await page.getByRole('button', { name: /submit ranking/i }).click();
    await expect(page.getByRole('heading', { name: /judging complete/i })).toBeVisible();
  }

  // Re-entering as the first judge still shows the round complete (ballot persisted).
  await page.goto(`/dev/login?email=${entrants[0]!.email}&next=${encodeURIComponent(judgeUrl)}`);
  await expect(page.getByRole('heading', { name: /judging complete/i })).toBeVisible();
});
