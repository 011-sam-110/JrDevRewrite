import { notFound, redirect } from 'next/navigation';
import { Arena } from '@/features/battles/arena/Arena';
import { getIdentity } from '@/infra/auth';

/**
 * The battle arena route — thin wiring only. M14 ships the arena against two
 * dev-only data sources; the real entry path (a battle row + a minted WS
 * ticket from the accept-challenge / enter-queue slices) lands at M15, so in
 * production this route is a 404 until then.
 *
 *   ?mock=1       → the in-browser mocked room (real BattleRoom + kernel, no
 *                   sockets) — the M14 acceptance flow and e2e run here.
 *   (no mock)     → real WebSocket to the local `npm run dev:ws` service with
 *                   a dev token; `?as=dev-a` / `?as=dev-b` picks a demo-room
 *                   seat so two tabs can fight the seeded 'demo' battle.
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
  if (!isDev) notFound(); // real battles arrive with M15

  if (sp.mock === '1') {
    return <Arena mode="mock" battleId={battleId} />;
  }

  const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'ws://localhost:3001';
  const as = typeof sp.as === 'string' ? sp.as : identity.userId;
  return <Arena mode="ws" battleId={battleId} url={url} token={`dev:${as}`} />;
}
