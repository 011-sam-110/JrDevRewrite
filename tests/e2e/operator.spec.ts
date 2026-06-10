import { expect, test } from '@playwright/test';
import { signInAs } from './outbox';

/**
 * Operator gate on the M4 approval queue. The operator allowlist comes from
 * OPERATOR_EMAILS in .env (operator@sussex.ac.uk in dev).
 */

test('signed-out users are bounced from the operator console', async ({ page }) => {
  await page.goto('/operator/pools');
  await page.waitForURL('**/');
  await expect(page.getByRole('heading', { name: /prove you can/i })).toBeVisible();
});

test('signed-in non-operators get a 404, not the queue', async ({ page }) => {
  await signInAs(page, `e2e-civilian-${Date.now()}@sussex.ac.uk`);
  await page.goto('/operator/pools');
  await expect(page.getByText(/404/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /draft approval queue/i })).not.toBeVisible();
});

test('the operator sees the approval queue', async ({ page }) => {
  await signInAs(page, 'operator@sussex.ac.uk');
  await page.goto('/operator/pools');
  await expect(page.getByRole('heading', { name: /draft approval queue/i })).toBeVisible();
  await expect(page.getByText(/waiting/i)).toBeVisible();
});
