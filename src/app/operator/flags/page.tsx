import { notFound, redirect } from 'next/navigation';
import { AppShell, Badge, Button, PageHeader, PageShell } from '@/components';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { listFlaggedEntries } from '@/features/prize-pools/review-flag/flag-queue';
import { FlagQueue } from '@/features/prize-pools/review-flag/FlagQueue';
import { getIdentity } from '@/infra/auth';
import { OPERATOR_NAV } from '@/lib/nav';

/**
 * Operator console: the anti-cheat flag-review queue. Like the draft queue,
 * non-operators get a 404 (the route's existence is nobody else's business) and
 * the real enforcement lives in the server actions, which re-check on each call.
 */
export default async function OperatorFlagsPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (!isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))) notFound();

  const items = await listFlaggedEntries();

  return (
    <AppShell
      items={OPERATOR_NAV}
      currentPath="/operator/flags"
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
          title="Anti-cheat review"
          description="Submissions flagged for duplicate or reused work. Upholding a flag keeps the entry out of judging; clearing it puts the entry back in the running."
          actions={<Badge variant="gold">{items.length} flagged</Badge>}
        />
        <FlagQueue items={items} />
      </PageShell>
    </AppShell>
  );
}
