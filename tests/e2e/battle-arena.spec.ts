import { expect, test, type Page } from '@playwright/test';

/**
 * The M14 arena journey, against the mocked room (the real BattleRoom +
 * kernel running in-browser; only sockets and the M15 judge path are
 * simulated). Walks every match phase: lobby → ready-up → synchronized
 * countdown → reveal/live → verdicts (rejected → cooldown → accepted) →
 * settled. Also proves the two in-match anti-cheat captures: paste-blocking
 * and focus-blur telemetry, both surfaced in the feed as "recorded".
 */

async function openMockArena(page: Page, battleId: string): Promise<void> {
  const next = encodeURIComponent(`/battles/${battleId}?mock=1`);
  await page.goto(`/dev/login?email=arena-e2e@sussex.ac.uk&next=${next}`);
  await expect(page.getByRole('heading', { name: /battle lobby/i })).toBeVisible();
}

test('full arena flow: lobby → countdown → live → verdicts → victory', async ({ page }) => {
  await openMockArena(page, 'e2e-arena');

  // ---- lobby: presence + ready-up -----------------------------------------
  await page.getByRole('button', { name: /opponent joins/i }).click();
  await expect(page.getByText('Connected', { exact: true })).toHaveCount(2);

  await page.getByRole('button', { name: /i'm ready/i }).click();
  await expect(page.getByRole('button', { name: /waiting for opponent/i })).toBeDisabled();
  await page.screenshot({ path: '.claude/debug-shots/m14-lobby.png', fullPage: true });

  // ---- the second ready starts the synchronized countdown ------------------
  await page.getByRole('button', { name: /opponent ready/i }).click();
  await expect(page.getByTestId('countdown')).toBeVisible();
  await expect(page.getByText(/get ready/i)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m14-countdown.png', fullPage: true });

  // ---- the go: problem revealed, editor + timer live ------------------------
  await expect(page.getByRole('heading', { name: /sum of two integers/i })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId('match-timer')).toBeVisible();
  await expect(page.getByTestId('anticheat-notice')).toBeVisible();

  // ---- paste is blocked and recorded ----------------------------------------
  await page.locator('.cm-content').click();
  await page.keyboard.type('print(sum(map(int, input().split())))');
  await page.evaluate(() => {
    const el = document.querySelector('.cm-content');
    if (!el) throw new Error('editor not found');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'PASTED_FROM_OUTSIDE');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByText(/paste blocked — recorded/i)).toBeVisible();
  await expect(page.locator('.cm-content')).not.toContainText('PASTED_FROM_OUTSIDE');

  // ---- focus loss is recorded ----------------------------------------------
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByText(/focus left the arena — recorded/i)).toBeVisible();

  // ---- opponent progress relays --------------------------------------------
  await page.getByRole('button', { name: /opponent \+1 test/i }).click();
  await page.getByRole('button', { name: /opponent \+1 test/i }).click();
  await expect(page.getByTestId('opponent-progress')).toContainText('2');

  // ---- submit: rejected → cooldown → accepted → victory ---------------------
  await page.getByTestId('submit-solution').click();
  await expect(page.getByText(/2\/5 hidden tests passed/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('submit-solution')).toBeDisabled(); // cooldown brake
  await page.screenshot({ path: '.claude/debug-shots/m14-live.png', fullPage: true });

  await expect(page.getByTestId('submit-solution')).toBeEnabled({ timeout: 6_000 });
  await page.getByTestId('submit-solution').click();
  await expect(page.getByText(/5\/5 hidden tests passed/i)).toBeVisible({ timeout: 5_000 });

  await expect(page.getByTestId('settled')).toBeVisible();
  await expect(page.getByRole('heading', { name: /victory/i })).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m14-victory.png', fullPage: true });
});

test('an opponent quitting before the reveal voids the match — nothing rated', async ({ page }) => {
  await openMockArena(page, 'e2e-void');

  await page.getByRole('button', { name: /opponent joins/i }).click();
  await page.getByRole('button', { name: /opponent quits/i }).click();

  await expect(page.getByTestId('settled')).toBeVisible();
  await expect(page.getByRole('heading', { name: /match voided/i })).toBeVisible();
  await expect(page.getByText(/no rating change/i)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m14-voided.png', fullPage: true });
});
