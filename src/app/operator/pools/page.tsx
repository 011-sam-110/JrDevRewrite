import { notFound, redirect } from 'next/navigation';
import { AppShell, Badge, Button, PageHeader, PageShell } from '@/components';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { DraftQueue } from '@/features/prize-pools/approve-pool/DraftQueue';
import { listDraftQueue } from '@/features/prize-pools/approve-pool/draft-queue';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { getIdentity } from '@/infra/auth';

/**
 * Operator console: the pool-draft approval queue. Non-operators get a 404
 * (the route's existence is nobody else's business); the real enforcement
 * lives in the server actions, which re-check on every call.
 */
export default async function OperatorPoolsPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (!isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))) notFound();

  const drafts = await listDraftQueue();

  return (
    <AppShell
      items={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Operator', href: '/operator/pools' },
      ]}
      currentPath="/operator/pools"
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
          title="Draft approval queue"
          description="Approving publishes the pool and starts its join window on the spot. Rejecting archives the draft for good — its slug stays retired."
          actions={<Badge variant="volt">{drafts.length} waiting</Badge>}
        />
        <DraftQueue drafts={drafts} />
      </PageShell>
    </AppShell>
  );
}
