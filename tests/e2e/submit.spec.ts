import { expect, test, type Page } from '@playwright/test';
import { magicLinkFor } from './outbox';
import { addEntrant, seedBuildingPool } from './seed';

/**
 * The M6 journey: an entrant in a `building` pool links a fresh repo + uploads
 * a demo video, the submission is verified (mock GitHub returns fresh signals)
 * and recorded, and the page flips into the submitted state. Requires the local
 * Postgres (docker compose up -d db).
 */

async function signUpAndOnboard(page: Page, email: string, roleLabel: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/sussex email/i).fill(email);
  await page.getByRole('button', { name: /send sign-in link/i }).click();
  await page.goto(await magicLinkFor(email));
  await page.waitForURL('**/onboarding');
  await page.getByText(roleLabel, { exact: true }).click();
  await page.getByRole('button', { name: /lock in role/i }).click();
  // Wait for step 2 to render before clicking — proves the role save committed,
  // so the GitHub connect can't run first and bounce back to onboarding.
  await expect(page.getByRole('heading', { name: /connect github/i })).toBeVisible();
  await page.getByRole('button', { name: /connect github/i }).click();
  await page.waitForURL('**/dashboard');
}

test('entrant submits a fresh repo + demo video in the build window', async ({ page }) => {
  const email = `e2e-submit-${Date.now()}@sussex.ac.uk`;
  await signUpAndOnboard(page, email, 'Backend');

  // Seed a building pool and enroll the freshly-created user in it.
  const pool = await seedBuildingPool({ role: 'backend' });
  await addEntrant(pool.id, email);

  await page.goto(`/pools/${pool.id}`);
  await expect(page.getByText("You're in")).toBeVisible();

  // The submission form is shown because the build window is open.
  const repoUrl = 'https://github.com/e2e-builder/fresh-build';
  await page.getByLabel(/competition repo/i).fill(repoUrl);
  await page.getByLabel(/demo video/i).setInputFiles({
    name: 'demo.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), // tiny EBML/WebM header, enough to be a file
  });
  await page.screenshot({ path: '.claude/debug-shots/m6-submit-form.png', fullPage: true });

  await page.getByRole('button', { name: /submit entry/i }).click();

  // The page re-renders into the submitted state with the verified repo link.
  await expect(page.getByText('Entry submitted.')).toBeVisible();
  await expect(page.getByRole('link', { name: repoUrl })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m6-submitted.png', fullPage: true });
});

test('submitting a non-GitHub URL is rejected with feedback', async ({ page }) => {
  const email = `e2e-submit-bad-${Date.now()}@sussex.ac.uk`;
  await signUpAndOnboard(page, email, 'Backend');

  const pool = await seedBuildingPool({ role: 'backend' });
  await addEntrant(pool.id, email);

  await page.goto(`/pools/${pool.id}`);
  await page.getByLabel(/competition repo/i).fill('https://gitlab.com/someone/not-github');
  await page.getByLabel(/demo video/i).setInputFiles({
    name: 'demo.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  });
  await page.getByRole('button', { name: /submit entry/i }).click();

  await expect(page.getByText(/github repository url/i)).toBeVisible();
});
