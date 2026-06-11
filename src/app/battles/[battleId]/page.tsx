import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Badge, Button } from '@/components';
import type { PlayerSide } from '@/domain/battles';
import { Arena } from '@/features/battles/arena/Arena';
import { getIdentity } from '@/infra/auth';
import { getDb } from '@/infra/db/client';
import { battleResults, battles, users } from '@/infra/db/schema';
import { MAIN_NAV } from '@/lib/nav';

export const dynamic = 'force-dynamic';

/**
 * The battle arena route — thin wiring only. The REAL path (M15): the battles
 * row written by accept-challenge / match-queue is the source of truth — a
 * player gate, then either the server-rendered result card (settled) or the
 * live Arena speaking to the realtime service with the viewer's own session
 * token (the WS service validates it against the sessions table).
 *
 * Dev extras survive for poking the transport without a DB battle:
 *   ?mock=1   → the in-browser mocked room (real BattleRoom + kernel).
 *   (unknown battleId in dev) → real WebSocket with a dev token;
 *               `?as=dev-a` / `?as=dev-b` picks a demo-room seat.
 */
export default async function BattlePage({
  params,
  searchParams,
}: {
  params: Promise<{ battleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  const { battleId } = await params;
  const sp = await searchParams;
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev && sp.mock === '1') {
    return <Arena mode="mock" battleId={battleId} />;
  }

  const battle = await getDb().query.battles.findFirst({ where: eq(battles.id, battleId) });

  if (!battle) {
    if (!isDev) notFound();
    // Dev fallback: the seeded demo room on the dev:ws service.
    const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'ws://localhost:3001';
    const as = typeof sp.as === 'string' ? sp.as : identity.userId;
    return <Arena mode="ws" battleId={battleId} url={url} token={`dev:${as}`} />;
  }

  // Spectating is not a v1 surface: only the two players may open a battle.
  const mySide: PlayerSide | null =
    battle.playerAId === identity.userId ? 'a' : battle.playerBId === identity.userId ? 'b' : null;
  if (!mySide) notFound();

  if (battle.status === 'challenged' || battle.status === 'queued') {
    redirect('/battles'); // pending battles live in the lobby, not the arena
  }

  if (
    battle.status === 'resolved' ||
    battle.status === 'forfeited' ||
    battle.status === 'voided' ||
    battle.status === 'flagged'
  ) {
    return <SettledBattle battleId={battleId} userId={identity.userId} mySide={mySide} />;
  }

  // Live path: the arena authenticates the WS with the viewer's own session
  // token — already their cookie, so nothing new is exposed to the client.
  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get('authjs.session-token')?.value ??
    cookieStore.get('__Secure-authjs.session-token')?.value;
  if (!sessionToken) redirect('/');

  const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'ws://localhost:3001';
  return <Arena mode="ws" battleId={battleId} url={url} token={sessionToken} serverSubmit />;
}

/* ----------------------------------------------------- settled result card */

async function SettledBattle({
  battleId,
  userId,
  mySide,
}: {
  battleId: string;
  userId: string;
  mySide: PlayerSide;
}) {
  const db = getDb();
  const battle = await db.query.battles.findFirst({ where: eq(battles.id, battleId) });
  if (!battle) notFound();

  const results = await db
    .select({
      userId: battleResults.userId,
      side: battleResults.side,
      result: battleResults.result,
      eloBefore: battleResults.eloBefore,
      eloAfter: battleResults.eloAfter,
      xpAwarded: battleResults.xpAwarded,
    })
    .from(battleResults)
    .where(eq(battleResults.battleId, battleId));
  const mine = results.find((r) => r.userId === userId) ?? null;

  const opponentId = mySide === 'a' ? battle.playerBId : battle.playerAId;
  const opponent = await db.query.users.findFirst({ where: eq(users.id, opponentId) });
  const opponentHandle = opponent?.githubUsername ?? opponent?.email ?? 'opponent';

  const voided = battle.status === 'voided';
  const won = battle.winnerSide !== null && battle.winnerSide === mySide;
  const draw = !voided && battle.winnerSide === null;
  const headline = voided ? 'Match voided' : won ? 'Victory' : draw ? 'Draw' : 'Defeat';
  const tone = voided || draw ? 'text-fg-muted' : won ? 'text-volt text-glow' : 'text-danger';
  const detail = voided
    ? 'Nothing was revealed — no rating change.'
    : battle.status === 'forfeited'
      ? won
        ? 'Your opponent forfeited.'
        : 'You forfeited.'
      : battle.outcome === 'timeout'
        ? 'Time ran out — scored on hidden tests passed.'
        : battle.outcome === 'draw'
          ? 'Dead even at the deadline.'
          : 'First fully-correct solution took it.';

  const delta = mine ? mine.eloAfter - mine.eloBefore : 0;

  return (
    <div className="bg-grid flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <p className="font-display text-sm tracking-[0.3em] text-fg-muted uppercase">
        Battle vs {opponentHandle}
      </p>
      <h1 className={`font-display text-6xl tracking-wide ${tone}`} data-testid="settled-headline">
        {headline}
      </h1>
      <p className="text-sm text-fg-muted">{detail}</p>
      {mine && (
        <div className="clip-corner-sm flex items-center gap-4 border border-edge bg-surface px-6 py-4 shadow-card">
          <Badge variant="elo">Elo</Badge>
          <span
            className={`font-mono text-lg tabular-nums ${delta > 0 ? 'text-volt' : delta < 0 ? 'text-danger' : 'text-fg-muted'}`}
            data-testid="elo-movement"
          >
            {mine.eloBefore} → {mine.eloAfter} ({delta > 0 ? '+' : ''}
            {delta})
          </span>
          <span className="font-mono text-sm text-fg-muted">+{mine.xpAwarded} XP</span>
        </div>
      )}
      <Link href={MAIN_NAV.find((i) => i.label === 'Battles')?.href ?? '/battles'}>
        <Button variant="secondary">Back to battles</Button>
      </Link>
    </div>
  );
}
