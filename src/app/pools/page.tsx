import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
} from '@/components';
import { isJobRole } from '@/domain/identity';
import { isPoolDifficulty, POOL_DIFFICULTIES } from '@/domain/prize-pools';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import { PoolCard, roleLabel } from '@/features/prize-pools/browse-pools/PoolCard';
import { getPoolDirectory } from '@/features/prize-pools/browse-pools/directory';
import { getIdentity } from '@/infra/auth';
import { cn } from '@/lib/cn';
import { MAIN_NAV } from '@/lib/nav';

export default async function PoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string }>;
}) {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  const role = identity.jobRole;
  if (identity.status !== 'complete' || !role || !isJobRole(role)) redirect('/onboarding');

  const { difficulty } = await searchParams;
  const filter = difficulty && isPoolDifficulty(difficulty) ? difficulty : undefined;
  const now = new Date();
  const directory = await getPoolDirectory(identity.userId, role, filter, now);

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
          title="Prize pools"
          description={`Time-boxed ${roleLabel(role)} competitions. Join, ship a real project, get judged by your peers.`}
          actions={
            <>
              <Badge variant="volt">{directory.credits} credits</Badge>
              <Badge variant="neutral">rank {directory.globalRank}</Badge>
            </>
          }
        />

        <nav aria-label="Difficulty filter" className="mb-6 flex flex-wrap gap-2">
          <FilterChip href="/pools" active={filter === undefined} label="All" />
          {POOL_DIFFICULTIES.map((d) => (
            <FilterChip
              key={d.id}
              href={`/pools?difficulty=${d.id}`}
              active={filter === d.id}
              label={d.label}
            />
          ))}
        </nav>

        {directory.myPools.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-display text-xl tracking-wide">My pools</h2>
            <div className="flex flex-col gap-4">
              {directory.myPools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} now={now} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 font-display text-xl tracking-wide">Open to join</h2>
          {directory.openPools.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No open pools right now</CardTitle>
                <CardDescription>
                  {filter
                    ? 'Nothing at this difficulty — try another filter.'
                    : `New ${roleLabel(role)} pools open regularly. Check back soon.`}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {directory.openPools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} now={now} />
              ))}
            </div>
          )}
        </section>
      </PageShell>
    </AppShell>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-widest uppercase transition-colors',
        active
          ? 'border-volt-dim/60 bg-volt/10 text-volt'
          : 'border-edge bg-transparent text-fg-muted hover:bg-raised hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
}
