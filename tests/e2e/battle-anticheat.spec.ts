import { expect, test } from '@playwright/test';
import {
  addBattleWin,
  getBattleRow,
  getBattleSanction,
  seedApprovedProblem,
  seedPlagiarisedBattle,
  seedRankedUser,
  setBattleNumbers,
  userIdByEmail,
} from './seed';

/**
 * The M16 journeys:
 *   1. The Battle Elo ladder (a /leaderboard tab) ranks rated battlers by the
 *      authoritative profile Elo, and battle badges (First Blood, Rampage,
 *      Giant-Killer) land on the public profile from seeded battle_results.
 *   2. The operator anti-cheat path: a settled battle whose winning submission
 *      is a verbatim copy of the bank reference solution → "Scan recent
 *      battles" flags it → Uphold forfeits the cheater (result flipped), docks
 *      the Elo penalty, adds a strike + the ladder ban — and the banned player
 *      is refused at the challenge entry path.
 */

test('battle Elo ladder ranks rated battlers; battle badges land on the profile', async ({
  page,
}) => {
  const stamp = Date.now();

  // Three rated battlers with distinct Elo (globalRank 0 so the ONLY earned
  // badges on champ's profile come from battles — makes the ★ count exact).
  const champ = { email: `e2e-elo-champ-${stamp}@sussex.ac.uk`, handle: `elo-champ-${stamp}` };
  const mid = { email: `e2e-elo-mid-${stamp}@sussex.ac.uk`, handle: `elo-mid-${stamp}` };
  const low = { email: `e2e-elo-low-${stamp}@sussex.ac.uk`, handle: `elo-low-${stamp}` };
  const champId = await seedRankedUser({ ...champ, xp: 0, level: 1, globalRank: 0 });
  const midId = await seedRankedUser({ ...mid, xp: 0, level: 1, globalRank: 0 });
  const lowId = await seedRankedUser({ ...low, xp: 0, level: 1, globalRank: 0 });
  await setBattleNumbers(champId, { elo: 1400, battleGames: 3 });
  await setBattleNumbers(midId, { elo: 1250, battleGames: 5 });
  await setBattleNumbers(lowId, { elo: 1100, battleGames: 3 });

  // Champ's history: a 3-win streak whose middle win is a 150+ Elo upset →
  // First Blood + Rampage + Giant-Killer (and nothing else).
  const t0 = Date.now() - 3_600_000;
  await addBattleWin({
    winnerId: champId,
    loserId: lowId,
    winnerEloBefore: 1200,
    loserEloBefore: 1210,
    at: new Date(t0),
  });
  await addBattleWin({
    winnerId: champId,
    loserId: midId,
    winnerEloBefore: 1220,
    loserEloBefore: 1380, // the giant: 160 above
    at: new Date(t0 + 60_000),
  });
  await addBattleWin({
    winnerId: champId,
    loserId: lowId,
    winnerEloBefore: 1360,
    loserEloBefore: 1150,
    at: new Date(t0 + 120_000),
  });

  // --- the ladder tab: ordered champ > mid > low, valued in Elo -------------
  await page.goto(`/dev/login?email=e2e-elo-viewer-${stamp}@sussex.ac.uk&next=/leaderboard`);
  await page.getByRole('link', { name: 'Battle Elo' }).click();
  await expect(page).toHaveURL(/board=battles/);
  const hrefs = await page
    .locator('a[href^="/u/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const iChamp = hrefs.indexOf(`/u/${champ.handle}`);
  const iMid = hrefs.indexOf(`/u/${mid.handle}`);
  const iLow = hrefs.indexOf(`/u/${low.handle}`);
  expect(iChamp).toBeGreaterThanOrEqual(0);
  expect(iMid).toBeGreaterThan(iChamp);
  expect(iLow).toBeGreaterThan(iMid);
  // Scoped to THIS run's champ row — earlier runs leave their own 1,400s behind.
  await expect(page.locator(`a[href="/u/${champ.handle}"]`).getByText('1,400')).toBeVisible();
  await expect(page.getByText('Elo').first()).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m16-ladder.png', fullPage: true });

  // --- champ's profile: Elo stat card + exactly the three battle badges -----
  await page.goto(`/u/${champ.handle}`);
  await expect(page.getByText('Battle Elo')).toBeVisible();
  await expect(page.getByText('3W / 3 battles')).toBeVisible();
  await expect(page.getByText('First Blood')).toBeVisible();
  await expect(page.getByText('Giant-Killer')).toBeVisible();
  await expect(page.getByText('Rampage')).toBeVisible();
  // Earned tiles render ★ (locked ones render a padlock) — exactly 3 earned.
  await expect(page.getByText('★')).toHaveCount(3);
  await page.screenshot({
    path: '.claude/debug-shots/m16-profile-battle-badges.png',
    fullPage: true,
  });
});

test('operator flags a plagiarised win, upholds it: forfeit flip + Elo penalty + ban enforced', async ({
  page,
}) => {
  const stamp = Date.now();
  const problem = await seedApprovedProblem();

  // Users created via /dev/login so their handles/sessions behave like real
  // accounts (the flags.spec recipe); battle rows seeded settled underneath.
  const cheaterEmail = `e2e-cheat-w-${stamp}@sussex.ac.uk`;
  const victimEmail = `e2e-cheat-l-${stamp}@sussex.ac.uk`;
  await page.goto(`/dev/login?email=${encodeURIComponent(cheaterEmail)}&next=/dashboard`);
  await page.goto(`/dev/login?email=${encodeURIComponent(victimEmail)}&next=/dashboard`);
  const cheaterId = await userIdByEmail(cheaterEmail);
  const victimId = await userIdByEmail(victimEmail);
  const battleId = await seedPlagiarisedBattle({ problemId: problem.id, cheaterId, victimId });

  // --- operator: scan → the battle lands in the review queue ----------------
  await page.goto('/dev/login?email=operator@sussex.ac.uk&next=/operator/flags');
  await expect(page.getByRole('heading', { name: /anti-cheat review/i })).toBeVisible();
  await page.getByRole('button', { name: /scan recent battles/i }).click();

  const row = page
    .getByTestId('battle-flag-queue')
    .getByRole('listitem')
    .filter({ hasText: `e2e-cheat-w-${stamp}` });
  await expect(row).toBeVisible();
  await expect(row.getByText(/matches a bank solution/i)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m16-battle-flags.png', fullPage: true });

  // --- uphold: the row leaves the queue; sanction + flip persisted ----------
  await row.getByRole('button', { name: /uphold/i }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `e2e-cheat-w-${stamp}` })).toHaveCount(
    0,
  );

  const sanction = await getBattleSanction(cheaterId);
  expect(sanction.elo).toBe(1200 - 100); // dev-login profile starts at ELO_START
  expect(sanction.strikes).toBe(1);
  expect(sanction.bannedUntil).not.toBeNull();
  expect(sanction.bannedUntil!.getTime()).toBeGreaterThan(Date.now());

  const battle = await getBattleRow(battleId);
  expect(battle.status).toBe('flagged'); // terminal in the kernel — the flag is history
  expect(battle.reviewOutcome).toBe('upheld');
  expect(battle.winnerSide).toBe('b'); // the wronged opponent is the recorded winner
  expect(battle.forfeitReason).toBe('cheating-confirmed');

  // --- ban enforcement: the cheater is refused at the challenge entry path --
  await page.goto(`/dev/login?email=${encodeURIComponent(cheaterEmail)}&next=/battles`);
  await expect(page.getByRole('heading', { name: /code battles/i })).toBeVisible();
  await page.getByLabel('Opponent handle').fill(`e2e-cheat-l-${stamp}-dev`);
  await page.getByTestId('send-challenge').click();
  await expect(page.getByText(/battle-banned/i)).toBeVisible();
  await page.screenshot({ path: '.claude/debug-shots/m16-banned-lobby.png', fullPage: true });
});
