'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { ensureProfile } from '@/infra/db/profiles';
import { battles, profiles } from '@/infra/db/schema';
import { clearBattleFlag, upholdBattleFlag, type ReviewBattleFlagDeps } from './review-battle-flag';

/**
 * Server actions are public endpoints — the operator check runs HERE on every
 * call, not just on the page that renders the buttons (the M7 posture).
 */
async function callerIsOperator(): Promise<boolean> {
  const identity = await getIdentity();
  return (
    identity !== null &&
    isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))
  );
}

const deps: ReviewBattleFlagDeps = {
  loadBattle: async (battleId) => {
    const row = await getDb().query.battles.findFirst({ where: eq(battles.id, battleId) });
    return row
      ? {
          status: row.status,
          reviewOutcome: row.reviewOutcome,
          winnerSide: row.winnerSide,
          players: { a: row.playerAId, b: row.playerBId },
        }
      : null;
  },

  loadProfile: async (userId) => {
    await ensureProfile(userId); // seeded users may not have a row yet
    const row = await getDb().query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    return row ? { elo: row.elo, strikes: row.battleStrikes } : null;
  },

  // One transaction: the review record + result flip on the battle, and the
  // sanction on the cheater's profile — no half-sanctioned state can survive.
  applyUphold: async (record) => {
    await getDb().transaction(async (tx) => {
      await tx
        .update(battles)
        .set({
          reviewOutcome: 'upheld',
          reviewedAt: record.reviewedAt,
          winnerSide: record.newWinnerSide,
          forfeitReason: 'cheating-confirmed',
        })
        .where(eq(battles.id, record.battleId));
      await tx
        .update(profiles)
        .set({
          elo: record.sanction.elo,
          battleStrikes: record.sanction.strikes,
          battleBannedUntil: record.sanction.bannedUntil,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, record.cheaterId));
    });
  },

  applyClear: async (battleId, reviewedAt) => {
    await getDb()
      .update(battles)
      .set({ reviewOutcome: 'cleared', reviewedAt })
      .where(eq(battles.id, battleId));
  },
};

export async function upholdBattleFlagAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await upholdBattleFlag(deps, String(formData.get('battleId') ?? ''), new Date());
  revalidatePath('/operator/flags');
}

export async function clearBattleFlagAction(formData: FormData): Promise<void> {
  if (!(await callerIsOperator())) redirect('/');
  await clearBattleFlag(deps, String(formData.get('battleId') ?? ''), new Date());
  revalidatePath('/operator/flags');
}
