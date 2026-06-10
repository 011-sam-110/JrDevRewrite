import { redirect } from 'next/navigation';
import { AppShell, Button, PageHeader, PageShell } from '@/components';
import { isJobRole } from '@/domain/identity';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { LeaderboardTable } from '@/features/profiles/view-leaderboard/LeaderboardTable';
import {
  getGlobalLeaderboard,
  getRoleLeaderboard,
} from '@/features/profiles/view-leaderboard/leaderboard';
import { getIdentity } from '@/infra/auth';
import { MAIN_NAV } from '@/lib/nav';

/**
 * The ladder. `?role=<role>` selects a per-role filtered view (computed from
 * pool results); no/invalid param falls back to the global board. Composition
 * lives in the app layer: pick the read model from the query, hand the view to
 * the slice's table.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete') redirect('/onboarding');

  const { role } = await searchParams;
  const view =
    role && isJobRole(role)
      ? await getRoleLeaderboard(role, identity.userId)
      : await getGlobalLeaderboard(identity.userId);

  return (
    <AppShell
      items={MAIN_NAV}
      currentPath="/leaderboard"
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
          title="Leaderboard"
          description="The global pool ladder, and a filtered view per job role. Win pools to climb."
        />
        <LeaderboardTable view={view} />
      </PageShell>
    </AppShell>
  );
}
