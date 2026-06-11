'use server';

import { and, gte, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { battles } from '@/infra/db/schema';
import { runPostMatchScan } from './scan-deps';

/**
 * Operator-triggered re-scan of recently settled battles — the manual /
 * recovery path beside the automatic scan-at-settlement (a scan that crashed,
 * or thresholds tightened after the fact). Safe to mash: scanning is
 * idempotent — already-flagged battles aren't scannable and honest battles
 * write nothing. Bounded to a recent window so the button never crawls the
 * whole history.
 */
const RESCAN_WINDOW_DAYS = 7;

export async function scanBattlesAction(): Promise<void> {
  const identity = await getIdentity();
  if (!identity || !isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))) {
    redirect('/');
  }

  const since = new Date(Date.now() - RESCAN_WINDOW_DAYS * 86_400_000);
  const rows = await getDb()
    .select({ id: battles.id })
    .from(battles)
    .where(and(inArray(battles.status, ['resolved', 'forfeited']), gte(battles.resolvedAt, since)));

  for (const row of rows) await runPostMatchScan(row.id);
  revalidatePath('/operator/flags');
}
