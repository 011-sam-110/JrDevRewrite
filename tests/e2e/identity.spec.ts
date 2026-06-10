import { expect, test } from '@playwright/test';
import { magicLinkFor } from './outbox';

/**
 * The full M2 identity journey: sign-up → magic link → onboarding (role +
 * GitHub) → dashboard. Requires the local Postgres (docker compose up -d db).
 *
 * The magic link is read from the dev email adapter's file outbox
 * (.dev/outbox.jsonl) — that file IS the mocked email inbox.
 */

test('sign-up → onboarding → dashboard journey', async ({ page }) => {
  // Unique address per run (no plus-tags — the gate strips them by design).
  const email = `e2e-${Date.now()}@sussex.ac.uk`;

  // 1. Request a magic link from the landing page.
  await page.goto('/');
  await page.screenshot({ path: '.claude/debug-shots/m2-landing.png', fullPage: true });
  await page.getByLabel(/sussex email/i).fill(email);
  await page.getByRole('button', { name: /send sign-in link/i }).click();
  await expect(page.getByRole('heading', { name: /check your inbox/i })).toBeVisible();

  // 2. "Open the email" and follow the link → fresh account lands on onboarding.
  await page.goto(await magicLinkFor(email));
  await page.waitForURL('**/onboarding');
  await expect(page.getByRole('heading', { name: /pick your battlefield/i })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m2-onboarding-role.png', fullPage: true });

  // 3. Step 1 — choose a job role.
  await page.getByText('Backend', { exact: true }).click();
  await page.getByRole('button', { name: /lock in role/i }).click();

  // 4. Step 2 — mandatory GitHub connect (mock connector in dev).
  await expect(page.getByRole('heading', { name: /connect github/i })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m2-onboarding-github.png', fullPage: true });
  await page.getByRole('button', { name: /connect github/i }).click();

  // 5. Onboarding complete → dashboard with role + mock GitHub username.
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Backend', { exact: true })).toBeVisible();
  await expect(page.getByText(/gh:e2e-\d+-dev/)).toBeVisible();

  await page.screenshot({
    path: '.claude/debug-shots/m2-dashboard.png',
    fullPage: true,
  });
});

test('non-sussex emails are rejected at the form', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/sussex email/i).fill('intruder@gmail.com');
  await page.getByRole('button', { name: /send sign-in link/i }).click();
  await expect(page.getByText(/sussex-only/i)).toBeVisible();
  // Still on the landing page — no check-email redirect happened.
  await expect(page.getByRole('heading', { name: /prove you can/i })).toBeVisible();
});

test('signed-out users cannot reach the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL('**/');
  await expect(page.getByRole('heading', { name: /prove you can/i })).toBeVisible();
});
