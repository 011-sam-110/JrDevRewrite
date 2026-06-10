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
import { JOB_ROLES } from '@/domain/identity';
import { levelProgress } from '@/domain/gamification';
import { getIdentity } from '@/infra/auth';
import { ensureProfile } from '@/infra/db/profiles';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { MAIN_NAV } from '@/lib/nav';

export default async function DashboardPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  const roleLabel = JOB_ROLES.find((r) => r.id === identity.jobRole)?.label ?? identity.jobRole;

  // Real gamification numbers — XP/rank move when a pool closes (M9).
  const profile = await ensureProfile(identity.userId);
  const progress = levelProgress(profile.xp);
  const xpToNext = progress.xpForNextLevel - progress.xpIntoLevel;

  return (
    <AppShell
      items={MAIN_NAV}
      currentPath="/dashboard"
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
        <PageHeader
          title="Dashboard"
          description="Your arena. Pools and battles light up as they ship."
          actions={
            <>
              <Badge variant="volt">{roleLabel}</Badge>
              {identity.githubUsername && (
                <>
                  <Badge variant="neutral">gh:{identity.githubUsername}</Badge>
                  <Link href={`/u/${identity.githubUsername}`}>
                    <Button variant="ghost" size="sm">
                      View profile
                    </Button>
                  </Link>
                </>
              )}
            </>
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Level"
            value={String(progress.level)}
            sub={`${profile.xp.toLocaleString()} XP · ${xpToNext} to next`}
            accent
          />
          <StatCard
            label="Pool rank"
            value={profile.globalRank > 0 ? String(profile.globalRank) : '—'}
            sub={
              profile.globalRank > 0
                ? `streak ${profile.poolStreak}`
                : 'Unranked until your first pool'
            }
          />
          <StatCard label="Battle Elo" value="—" sub="Battles arrive in Phase C" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card accent>
            <CardHeader>
              <CardTitle>Prize pools</CardTitle>
              <CardDescription>
                Time-boxed project competitions for {roleLabel} — join one, ship a real project, get
                judged by your peers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/pools">
                <Button size="sm">Browse pools</Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Code battles</CardTitle>
              <CardDescription>
                Live 1v1, same problem, first correct solution wins — arrives in Phase C.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">Coming soon</Badge>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </AppShell>
  );
}
