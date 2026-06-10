import { expect, test, type Page } from '@playwright/test';
import { magicLinkFor } from './outbox';
import { seedPublishedPool } from './seed';

/**
 * The M5 journey: browse pools (role-filtered, difficulty filter) → join →
 * joined state, with the starter-credit grant and the 1-credit debit visible
 * in the header. Requires the local Postgres (docker compose up -d db).
 */

/** Sign up a fresh account and complete onboarding with the given role. */
async function signUpAndOnboard(page: Page, email: string, roleLabel: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/sussex email/i).fill(email);
  await page.getByRole('button', { name: /send sign-in link/i }).click();
  await page.goto(await magicLinkFor(email));
  await page.waitForURL('**/onboarding');
  await page.getByText(roleLabel, { exact: true }).click();
  await page.getByRole('button', { name: /lock in role/i }).click();
  await page.getByRole('button', { name: /connect github/i }).click();
  await page.waitForURL('**/dashboard');
}

test('browse → join → joined state, credits debited', async ({ page }) => {
  // Seed one joinable pool for the user's role and one for another role —
  // the listing must show the first and never the second.
  const backendPool = await seedPublishedPool({ role: 'backend' });
  const frontendPool = await seedPublishedPool({ role: 'frontend' });
  const email = `e2e-join-${Date.now()}@sussex.ac.uk`;

  await signUpAndOnboard(page, email, 'Backend');

  // Dashboard links into the pool directory.
  await page.getByRole('button', { name: /browse pools/i }).click();
  await page.waitForURL('**/pools');

  // Starter credits granted on first touch; listing is role-filtered.
  await expect(page.getByText('5 credits')).toBeVisible();
  await expect(page.getByRole('heading', { name: backendPool.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: frontendPool.title })).not.toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m5-pools-list.png', fullPage: true });

  // Difficulty filter narrows the listing (seeded pool is beginner).
  await page.getByRole('link', { name: 'Advanced', exact: true }).click();
  await page.waitForURL('**/pools?difficulty=advanced');
  await expect(page.getByText(/nothing at this difficulty/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: backendPool.title })).not.toBeVisible();
  await page.getByRole('link', { name: 'All', exact: true }).click();
  await page.waitForURL('**/pools');

  // Detail page: spec, windows, entrants/cap, join CTA.
  await page.getByRole('heading', { name: backendPool.title }).click();
  await page.waitForURL(`**/pools/${backendPool.id}`);
  await expect(page.getByText('0/30')).toBeVisible();
  await expect(page.getByText(/ship something real/i)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m5-pool-detail.png', fullPage: true });

  // Join — the page re-renders into the joined state.
  await page.getByRole('button', { name: /join pool/i }).click();
  await expect(page.getByText("You're in")).toBeVisible();
  await expect(page.getByText('Joined', { exact: true })).toBeVisible();
  await expect(page.getByText('1/30')).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m5-pool-joined.png', fullPage: true });

  // Back on the listing: credit debited, pool now under "My pools".
  await page.goto('/pools');
  await expect(page.getByText('4 credits')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My pools' })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m5-pools-joined-list.png', fullPage: true });
});

test('signed-out users cannot browse pools', async ({ page }) => {
  await page.goto('/pools');
  await page.waitForURL('**/');
  await expect(page.getByRole('heading', { name: /prove you can/i })).toBeVisible();
});
