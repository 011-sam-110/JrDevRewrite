import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
  StatCard,
} from '@/components';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { declineChallengeAction } from '@/features/battles/accept-challenge/accept-challenge.action';
import { cancelChallengeAction } from '@/features/battles/send-challenge/send-challenge.action';
import {
  getBattlesLobby,
  getLobbyStamp,
  type LobbyRecentBattle,
} from '@/features/battles/battles-lobby/lobby';
import {
  AcceptChallengeButton,
  ChallengeForm,
  QueueControls,
} from '@/features/battles/battles-lobby/LobbyControls';
import { LobbyPoller } from '@/features/battles/battles-lobby/LobbyPoller';
import { getIdentity } from '@/infra/auth';
import { MAIN_NAV } from '@/lib/nav';

export const dynamic = 'force-dynamic';

export default async function BattlesPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  const now = new Date();
  const [lobby, stamp] = await Promise.all([
    getBattlesLobby(identity.userId, now),
    getLobbyStamp(identity.userId, now),
  ]);

  // A battle already in motion? Straight into the arena — the lobby is for
  // players between matches.
  if (lobby.activeBattleId) redirect(`/battles/${lobby.activeBattleId}`);

  const { record } = lobby;

  return (
    <AppShell
      items={MAIN_NAV}
      currentPath="/battles"
      right={
        <>
          <span className="hidden font-mono text-xs text-fg-subtle sm:inline">
            {identity.email}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </>
      }
    >
      <PageShell>
        <LobbyPoller initialStamp={stamp} />
        <PageHeader
          title="Code battles"
          description="Live 1v1 — identical problem, same instant, first fully-correct solution wins."
          actions={<Badge variant="elo">Elo {lobby.elo}</Badge>}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Battle Elo"
            value={String(lobby.elo)}
            sub={`${lobby.battleGames} rated battles`}
            accent
          />
          <StatCard
            label="Record"
            value={`${record.wins}–${record.losses}${record.draws > 0 ? `–${record.draws}` : ''}`}
            sub="wins–losses"
          />
          <StatCard
            label="Battle streak"
            value={String(lobby.battleStreak)}
            sub="consecutive completed"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ------------------------------------------------ entry paths */}
          <div className="flex flex-col gap-4">
            <Card accent>
              <CardHeader>
                <CardTitle>Challenge a player</CardTitle>
                <CardDescription>
                  Name an opponent by handle or paste their profile link — they accept, you both
                  ready up, the problem reveals simultaneously.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChallengeForm />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick match</CardTitle>
                <CardDescription>Queue up and get paired by Elo proximity.</CardDescription>
              </CardHeader>
              <CardContent>
                <QueueControls inQueue={lobby.inQueue} queueSize={lobby.queueSize} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Online players</CardTitle>
                <CardDescription>Seen in the last two minutes.</CardDescription>
              </CardHeader>
              <CardContent>
                {lobby.online.length === 0 ? (
                  <p className="text-sm text-fg-subtle">
                    Nobody else is around right now — queue up or send a challenge anyway.
                  </p>
                ) : (
                  <ul className="divide-y divide-edge-subtle" data-testid="online-players">
                    {lobby.online.map((p) => (
                      <li key={p.handle} className="flex items-center justify-between gap-3 py-2">
                        <Link
                          href={`/u/${p.handle}`}
                          className="font-mono text-sm text-fg hover:text-volt"
                        >
                          {p.handle}
                        </Link>
                        <span className="font-mono text-xs text-elo tabular-nums">Elo {p.elo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ------------------------------------------- challenge traffic */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Incoming challenges</CardTitle>
                <CardDescription>Accepting drops you both straight into the arena.</CardDescription>
              </CardHeader>
              <CardContent>
                {lobby.incoming.length === 0 ? (
                  <p className="text-sm text-fg-subtle">No one has challenged you yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3" data-testid="incoming-challenges">
                    {lobby.incoming.map((c) => (
                      <li
                        key={c.battleId}
                        className="clip-corner-sm flex items-center justify-between gap-3 border border-edge bg-raised px-3 py-2"
                      >
                        <span className="font-mono text-sm">{c.opponentHandle}</span>
                        <span className="flex items-center gap-2">
                          <AcceptChallengeButton battleId={c.battleId} />
                          <form action={declineChallengeAction.bind(null, c.battleId)}>
                            <Button type="submit" variant="ghost" size="sm">
                              Decline
                            </Button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Outgoing challenges</CardTitle>
              </CardHeader>
              <CardContent>
                {lobby.outgoing.length === 0 ? (
                  <p className="text-sm text-fg-subtle">No open challenges from you.</p>
                ) : (
                  <ul className="flex flex-col gap-3" data-testid="outgoing-challenges">
                    {lobby.outgoing.map((c) => (
                      <li
                        key={c.battleId}
                        className="clip-corner-sm flex items-center justify-between gap-3 border border-edge bg-raised px-3 py-2"
                      >
                        <span className="font-mono text-sm">{c.opponentHandle}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">Waiting</Badge>
                          <form action={cancelChallengeAction.bind(null, c.battleId)}>
                            <Button type="submit" variant="ghost" size="sm">
                              Cancel
                            </Button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent battles</CardTitle>
              </CardHeader>
              <CardContent>
                {lobby.recent.length === 0 ? (
                  <p className="text-sm text-fg-subtle">
                    Your match history lands here after your first battle.
                  </p>
                ) : (
                  <ul className="divide-y divide-edge-subtle" data-testid="recent-battles">
                    {lobby.recent.map((b) => (
                      <RecentBattleRow key={b.battleId} battle={b} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageShell>
    </AppShell>
  );
}

function RecentBattleRow({ battle }: { battle: LobbyRecentBattle }) {
  const delta = battle.eloAfter - battle.eloBefore;
  const resultBadge =
    battle.myResult === 'win' ? (
      <Badge variant="volt">Won</Badge>
    ) : battle.myResult === 'draw' ? (
      <Badge variant="outline">Draw</Badge>
    ) : battle.myResult === 'forfeited' ? (
      <Badge variant="danger">Forfeited</Badge>
    ) : (
      <Badge variant="neutral">Lost</Badge>
    );

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2">
        {resultBadge}
        <span className="font-mono text-sm text-fg-muted">vs {battle.opponentHandle}</span>
      </span>
      <span
        className={`font-mono text-xs tabular-nums ${delta > 0 ? 'text-volt' : delta < 0 ? 'text-danger' : 'text-fg-subtle'}`}
      >
        {delta > 0 ? '+' : ''}
        {delta} Elo → {battle.eloAfter}
      </span>
    </li>
  );
}
