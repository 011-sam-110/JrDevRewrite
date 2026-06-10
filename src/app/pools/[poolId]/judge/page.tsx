import { notFound, redirect } from 'next/navigation';
import {
  AppShell,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
} from '@/components';
import { isJobRole } from '@/domain/identity';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { getJudgingTask } from '@/features/prize-pools/cast-vote/judge-task';
import { JudgePanel } from '@/features/prize-pools/cast-vote/JudgePanel';
import { getIdentity } from '@/infra/auth';
import { MAIN_NAV } from '@/lib/nav';

/**
 * The judging surface for one pool. Composition lives in the app layer: it loads
 * the judging read model (which lazily ensures assignments exist) and branches on
 * the round's state, handing the actual ranking interaction to the JudgePanel
 * slice component.
 */
export default async function JudgePoolPage({ params }: { params: Promise<{ poolId: string }> }) {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (identity.status !== 'complete' || !identity.jobRole || !isJobRole(identity.jobRole)) {
    redirect('/onboarding');
  }

  const { poolId } = await params;
  const task = await getJudgingTask(identity.userId, poolId);
  if (!task) notFound();

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
          title={`Judge: ${task.poolTitle}`}
          description="Watch each anonymous demo, then drag them into order — best at the top. You must rank every assigned submission to be eligible to win this pool."
          actions={
            <a
              href={`/pools/${poolId}`}
              className="text-sm text-fg-muted underline-offset-4 hover:text-volt hover:underline"
            >
              Back to pool
            </a>
          }
        />

        <JudgeBody task={task} />
      </PageShell>
    </AppShell>
  );
}

/** The state machine of the judging page, isolated for readability. */
function JudgeBody({ task }: { task: NonNullable<Awaited<ReturnType<typeof getJudgingTask>>> }) {
  if (!task.isEntrant) {
    return (
      <Notice title="Not your pool">
        Only entrants judge this pool, and you didn&apos;t enter it.
      </Notice>
    );
  }
  if (task.status !== 'judging') {
    return (
      <Notice title="Judging isn't open">
        {task.status === 'closed'
          ? 'Judging for this pool has already closed.'
          : 'Judging opens once the build window closes.'}
      </Notice>
    );
  }
  if (task.alreadyVoted) {
    return (
      <Notice title="Judging complete" accent>
        You&apos;ve submitted your ranking for this pool. Results are revealed when judging closes.
      </Notice>
    );
  }
  if (task.submissions.length === 0) {
    return (
      <Notice title="Nothing to judge yet">
        You have no submissions assigned in this pool — either it was too small to judge or your
        entry was excluded.
      </Notice>
    );
  }
  return (
    <Card accent>
      <CardHeader>
        <CardTitle>Your assigned submissions</CardTitle>
        <CardDescription>
          {task.submissions.length} demos to rank. Order is your verdict — top is best.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <JudgePanel poolId={task.poolId} submissions={task.submissions} />
      </CardContent>
    </Card>
  );
}

function Notice({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card accent={accent}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-fg-muted">{children}</p>
      </CardContent>
    </Card>
  );
}
