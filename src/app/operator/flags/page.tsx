import { notFound, redirect } from 'next/navigation';
import { AppShell, Badge, Button, PageHeader, PageShell } from '@/components';
import { isOperator, parseOperatorEmails } from '@/domain/identity';
import { listFlaggedBattles } from '@/features/battles/review-battle-flag/battle-flag-queue';
import { BattleFlagQueue } from '@/features/battles/review-battle-flag/BattleFlagQueue';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { listFlaggedEntries } from '@/features/prize-pools/review-flag/flag-queue';
import { FlagQueue } from '@/features/prize-pools/review-flag/FlagQueue';
import { getIdentity } from '@/infra/auth';
import { OPERATOR_NAV } from '@/lib/nav';

/**
 * Operator console: BOTH anti-cheat review queues — pool submissions (M7) and
 * battles (M16) — on one surface, because review is one operator duty. Like
 * the draft queue, non-operators get a 404 (the route's existence is nobody
 * else's business) and the real enforcement lives in the server actions,
 * which re-check on each call.
 */
export default async function OperatorFlagsPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  if (!isOperator(identity.email, parseOperatorEmails(process.env.OPERATOR_EMAILS))) notFound();

  const [items, battleItems] = await Promise.all([listFlaggedEntries(), listFlaggedBattles()]);

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
          description="Pool submissions flagged for duplicate or reused work, and battles flagged by the post-match scan. Upholding confirms the cheat; clearing puts the result back as it was."
          actions={<Badge variant="gold">{items.length + battleItems.length} flagged</Badge>}
        />
        <section className="space-y-4">
          <h2 className="font-display text-lg tracking-wide text-fg-muted uppercase">
            Pool submissions
          </h2>
          <FlagQueue items={items} />
        </section>
        <section className="mt-8 space-y-4">
          <h2 className="font-display text-lg tracking-wide text-fg-muted uppercase">Battles</h2>
          <BattleFlagQueue items={battleItems} />
        </section>
      </PageShell>
    </AppShell>
  );
}
