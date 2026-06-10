import { notFound, redirect } from 'next/navigation';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
  StatCard,
} from '@/components';
import { isJobRole } from '@/domain/identity';
import { signOutAction } from '@/features/identity/sign-in/sign-in.action';
import {
  DIFFICULTY_BADGE,
  formatDeadline,
  roleLabel,
  statusBadge,
} from '@/features/prize-pools/browse-pools/PoolCard';
import { timeLeftLabel } from '@/features/prize-pools/browse-pools/browse-pools';
import { getPoolDetail } from '@/features/prize-pools/browse-pools/directory';
import { JoinPoolButton } from '@/features/prize-pools/join-pool/JoinPoolButton';
import { JOIN_REJECTION_LABELS } from '@/features/prize-pools/join-pool/rejection-labels';
import { getIdentity } from '@/infra/auth';
import { MAIN_NAV } from '@/lib/nav';

/**
 * Pool detail. This page composes two slices — browse-pools (the view +
 * verdict) and join-pool (the CTA) — which is the app layer's job; the
 * slices themselves never import each other.
 */
export default async function PoolDetailPage({ params }: { params: Promise<{ poolId: string }> }) {
  const identity = await getIdentity();
  if (!identity) redirect('/');
  const role = identity.jobRole;
  if (identity.status !== 'complete' || !role || !isJobRole(role)) redirect('/onboarding');

  const { poolId } = await params;
  const now = new Date();
  const detail = await getPoolDetail(identity.userId, role, poolId, now);
  if (!detail) notFound();
  const { view } = detail;

  const isOpen = view.status === 'published' || view.status === 'extended';

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
          title={view.title}
          description={`${roleLabel(view.role)} · ${view.slug}`}
          actions={
            <>
              <Badge variant={DIFFICULTY_BADGE[view.difficulty]}>{view.difficulty}</Badge>
              {statusBadge(view.status)}
              {view.joined && <Badge variant="gold">Joined</Badge>}
            </>
          }
        />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Entrants"
            value={`${view.entrantCount}/${view.entrantCap}`}
            sub={`needs ${view.minEntrants} to run`}
          />
          <StatCard
            label="Join window"
            value={view.joinDeadline && isOpen ? timeLeftLabel(now, view.joinDeadline) : '—'}
            sub={view.joinDeadline ? `closes ${formatDeadline(view.joinDeadline)}` : undefined}
            accent={isOpen}
          />
          <StatCard
            label="Build window"
            value={
              view.buildDeadline && view.status === 'building'
                ? timeLeftLabel(now, view.buildDeadline)
                : '—'
            }
            sub={
              view.buildDeadline
                ? `submissions due ${formatDeadline(view.buildDeadline)}`
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>The brief</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line text-fg-muted">{view.brief}</p>
                <h3 className="mt-5 mb-2 text-xs font-semibold tracking-widest text-fg-subtle uppercase">
                  Requirements
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
                  {view.requirements.map((req) => (
                    <li key={req}>{req}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card accent={view.verdict.ok || view.joined}>
              <CardHeader>
                <CardTitle>{view.joined ? "You're in" : 'Entry'}</CardTitle>
              </CardHeader>
              <CardContent>
                {view.joined ? (
                  <p className="text-sm text-fg-muted">
                    Fresh repo + demo video submission opens with the build window (M6). Pushing
                    in-window work to GitHub is what anti-cheat verifies — start when the window
                    opens, not before.
                  </p>
                ) : view.verdict.ok ? (
                  <JoinPoolButton poolId={view.id} />
                ) : (
                  <ul className="space-y-2 text-sm text-fg-muted">
                    {view.verdict.reasons.map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <span aria-hidden="true" className="text-danger">
                          ✕
                        </span>
                        {JOIN_REJECTION_LABELS[reason]}
                      </li>
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
