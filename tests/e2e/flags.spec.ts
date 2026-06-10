import { expect, test } from '@playwright/test';
import { addSubmittedEntry, seedBuildingPool, seedUser } from './seed';

/**
 * The M7 flagged-path journey: two entrants submit the IDENTICAL repo (the
 * blatant duplicate the anti-cheat scan exists to catch). The operator runs the
 * scan from the console, both entries land in the review queue, and the operator
 * clears one (false positive) — which removes it from the queue while the other
 * stays flagged. Requires the local Postgres (docker compose up -d db) and the
 * operator allowlist (OPERATOR_EMAILS includes operator@sussex.ac.uk).
 */
test('operator scans submissions, sees duplicates flagged, and clears one', async ({ page }) => {
  const stamp = Date.now();
  const pool = await seedBuildingPool({ role: 'backend' });

  // Two distinct entrants submit the SAME repo — a duplicate by construction.
  const emailA = `e2e-cheat-a-${stamp}@sussex.ac.uk`;
  const emailB = `e2e-cheat-b-${stamp}@sussex.ac.uk`;
  const userA = await seedUser(emailA);
  const userB = await seedUser(emailB);
  const sharedRepo = `https://github.com/e2e-cheat/dup-${stamp}`;
  await addSubmittedEntry(pool.id, userA, sharedRepo);
  await addSubmittedEntry(pool.id, userB, sharedRepo);

  // The operator opens the (initially clean-of-these) review queue. /dev/login
  // sets the session cookie directly — no flaky magic-link round trip.
  await page.goto('/dev/login?email=operator@sussex.ac.uk&next=/operator/flags');
  await expect(page.getByRole('heading', { name: /anti-cheat review/i })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: emailA })).toHaveCount(0);

  // Run the scan. Both duplicate entries should be flagged for review.
  await page.getByRole('button', { name: /run anti-cheat scan/i }).click();

  const rowA = page.getByRole('listitem').filter({ hasText: emailA });
  const rowB = page.getByRole('listitem').filter({ hasText: emailB });
  await expect(rowA).toBeVisible();
  await expect(rowB).toBeVisible();
  await expect(rowA.getByText(/duplicate of another entrant/i)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m7-flagged-queue.png', fullPage: true });

  // Clear A (false positive) — it leaves the queue; B stays flagged.
  await rowA.getByRole('button', { name: /clear/i }).click();
  await expect(page.getByRole('listitem').filter({ hasText: emailA })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: emailB })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m7-after-clear.png', fullPage: true });
});
