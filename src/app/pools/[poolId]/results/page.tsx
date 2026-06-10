import { notFound, redirect } from 'next/navigation';
import {
  AppShell,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
} from '@/components';
import { isJobRole } from '@/domain/identity';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { PoolResultsBoard } from '@/features/prize-pools/close-pool/PoolResultsBoard';
import { getPoolResults } from '@/features/prize-pools/close-pool/results';
import { getIdentity } from '@/infra/auth';
import { MAIN_NAV } from '@/lib/nav';

/**
 * The results-reveal page for a closed pool. Composition lives in the app layer:
 * load the read model, branch on whether results exist yet, and hand the reveal
 * to the slice's board. Closing itself is the cron's job — this page never
 * triggers a transition, it only renders what the close already wrote.
 */
export default async function PoolResultsPage({ params }: { params: Promise<{ poolId: string }> }) {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete' || !identity.jobRole || !isJobRole(identity.jobRole)) {
    redirect('/onboarding');
  }

  const { poolId } = await params;
  const view = await getPoolResults(identity.userId, poolId);
  if (!view) notFound();

  const ready = view.status === 'closed' && view.standings.length > 0;

  return (
    <AppShell
      items={MAIN_NAV}
      currentPath="/pools"
      right={
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      }
    >
      <PageShell>
        <PageHeader
          title="Results"
          description={view.poolTitle}
          actions={
            <a
              href={`/pools/${poolId}`}
              className="text-sm text-fg-muted underline-offset-4 hover:text-volt hover:underline"
            >
              Back to pool
            </a>
          }
        />

        {ready ? (
          <PoolResultsBoard view={view} />
        ) : (
          <Card accent>
            <CardHeader>
              <CardTitle>Results aren&apos;t in yet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-fg-muted">
                {view.status === 'judging'
                  ? 'Judging is still open. Final standings, XP and rank are revealed the moment the judging window closes.'
                  : 'This pool has no finalized results to show.'}
              </p>
            </CardContent>
          </Card>
        )}
      </PageShell>
    </AppShell>
  );
}
