import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { seedApprovedProblem } from './seed';

/**
 * The M15 acceptance journey: two REAL browser contexts fight a full battle —
 * challenge by handle → accept → both ready → synchronized countdown →
 * reveal → a typed (paste is blocked!) JavaScript solution judged against the
 * seeded problem's hidden tests → decisive Victory/Defeat over the live
 * socket → Elo movement on the match record.
 *
 * Determinism: fresh users per run (timestamped emails → fresh 1200 Elo
 * profiles), the problem pinned via E2E_FORCE_PROBLEM_SLUG (playwright
 * config), and the judge on the local process runner (no Judge0 needed).
 */

// Typed character-by-character into CodeMirror (close-brackets type-over makes
// literal typing reproduce this exactly). Solves "print a+b" for stdin "a b".
// Event-based stdin on purpose: a sync fd-0 read (readFileSync(0)) races the
// parent's pipe write on Windows under some process trees and reads empty.
const SOLUTION =
  "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const [a,b]=s.trim().split(/\\s+/).map(Number);console.log(a+b)})";

const STAMP = Date.now();
const EMAIL_A = `battler-a-${STAMP}@sussex.ac.uk`;
const EMAIL_B = `battler-b-${STAMP}@sussex.ac.uk`;
// /dev/login derives the public handle as `<local-part>-dev`.
const HANDLE_B = `battler-b-${STAMP}-dev`;

async function signInToBattles(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(
    `/dev/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent('/battles')}`,
  );
  await expect(page.getByRole('heading', { name: /code battles/i })).toBeVisible();
  return page;
}

test('two players fight a full battle: challenge → countdown → solve → resolved → Elo movement', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  await seedApprovedProblem();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await signInToBattles(ctxA, EMAIL_A);
  const b = await signInToBattles(ctxB, EMAIL_B);

  // ---- A challenges B by handle --------------------------------------------
  await a.getByLabel('Opponent handle').fill(HANDLE_B);
  await a.getByTestId('send-challenge').click();
  await expect(a.getByText(/challenge sent/i)).toBeVisible();
  await expect(a.getByTestId('outgoing-challenges')).toContainText(HANDLE_B);

  // ---- B's lobby poller surfaces it; B accepts → straight into the arena ---
  await expect(b.getByTestId('incoming-challenges')).toBeVisible({ timeout: 15_000 });
  await b.screenshot({ path: '.claude/debug-shots/m15-lobby-incoming.png', fullPage: true });
  await b.getByTestId('accept-challenge').click();
  await expect(b.getByRole('heading', { name: /battle lobby/i })).toBeVisible({ timeout: 15_000 });

  // ---- A's poller bounces them into the same battle -------------------------
  // Generous timeout: the first hit on /battles/[id] cold-compiles the route
  // in dev, and a compile stall past the poller's push renders late.
  await expect(a.getByRole('heading', { name: /battle lobby/i })).toBeVisible({ timeout: 45_000 });
  expect(new URL(a.url()).pathname).toBe(new URL(b.url()).pathname);

  // ---- both ready → synchronized countdown → simultaneous reveal -----------
  await a.getByRole('button', { name: /i'm ready/i }).click();
  await b.getByRole('button', { name: /i'm ready/i }).click();
  await expect(a.getByTestId('countdown')).toBeVisible({ timeout: 10_000 });
  await expect(b.getByTestId('countdown')).toBeVisible();
  await a.screenshot({ path: '.claude/debug-shots/m15-countdown.png', fullPage: true });

  const problemHeading = /e2e sum of two integers/i;
  await expect(a.getByRole('heading', { name: problemHeading })).toBeVisible({ timeout: 15_000 });
  await expect(b.getByRole('heading', { name: problemHeading })).toBeVisible();

  // ---- B types the solution (paste is blocked — this is the honest path) ---
  await b.locator('.cm-content').click();
  await b.keyboard.type(SOLUTION);
  await expect(b.locator('.cm-content')).toContainText('console.log(a+b)');
  await b.locator('select').selectOption('javascript');
  await b.screenshot({ path: '.claude/debug-shots/m15-live.png', fullPage: true });

  // ---- submit: the Judge0-path verdict resolves the battle ------------------
  // The winning action settles the row, and Next's post-action route refresh
  // re-renders /battles/[id] server-side — so the WINNER lands directly on
  // the match record card. The loser hears it over the socket broadcast.
  await b.getByTestId('submit-solution').click();
  // Wide timeout: the action response carries the route's server re-render,
  // which can stall under full-suite dev-server compile contention.
  await expect(b.getByTestId('settled-headline')).toHaveText(/victory/i, { timeout: 60_000 });
  await b.screenshot({ path: '.claude/debug-shots/m15-victory.png', fullPage: true });

  await expect(a.getByRole('heading', { name: /defeat/i })).toBeVisible({ timeout: 15_000 });
  await a.screenshot({ path: '.claude/debug-shots/m15-defeat.png', fullPage: true });

  // ---- Elo movement: provisional K=40, even expectation → ±20 ---------------
  await expect(b.getByTestId('elo-movement')).toContainText('1200 → 1220 (+20)');
  await expect(b.getByText('+30 XP')).toBeVisible(); // win 25 + streak 5
  await b.screenshot({ path: '.claude/debug-shots/m15-record-winner.png', fullPage: true });

  await a.reload();
  await expect(a.getByTestId('settled-headline')).toHaveText(/defeat/i);
  await expect(a.getByTestId('elo-movement')).toContainText('1200 → 1180 (-20)');

  // ---- the lobby reflects the rated result ----------------------------------
  await b.goto('/battles');
  await expect(b.getByText('Battle Elo').locator('..')).toContainText('1220');
  await expect(b.getByTestId('recent-battles')).toContainText('+20 Elo');
  await b.screenshot({ path: '.claude/debug-shots/m15-lobby-after.png', fullPage: true });

  await ctxA.close();
  await ctxB.close();
});

test('declining a challenge voids it — nothing rated, nothing left pending', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(90_000);
  const stamp = `${STAMP}-d`;
  const emailA = `decliner-a-${stamp}@sussex.ac.uk`;
  const emailB = `decliner-b-${stamp}@sussex.ac.uk`;

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await signInToBattles(ctxA, emailA);
  const b = await signInToBattles(ctxB, emailB);

  await a.getByLabel('Opponent handle').fill(`decliner-b-${stamp}-dev`);
  await a.getByTestId('send-challenge').click();
  await expect(a.getByTestId('outgoing-challenges')).toBeVisible();

  await expect(b.getByTestId('incoming-challenges')).toBeVisible({ timeout: 15_000 });
  await b.getByRole('button', { name: /decline/i }).click();
  await expect(b.getByText(/no one has challenged you yet/i)).toBeVisible({ timeout: 15_000 });

  // The challenger's lobby converges on the void — no battle ever existed.
  await expect(a.getByText(/no open challenges from you/i)).toBeVisible({ timeout: 15_000 });
  await expect(a.getByText('Battle Elo').locator('..')).toContainText('1200'); // untouched

  await ctxA.close();
  await ctxB.close();
});
