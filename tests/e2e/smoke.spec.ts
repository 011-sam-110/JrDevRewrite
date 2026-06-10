import { expect, test } from '@playwright/test';

test('landing page renders the sign-in surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /prove you can/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /send sign-in link/i })).toBeVisible();
});
