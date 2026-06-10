import Link from 'next/link';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components';
import { JOB_ROLES, type JobRole } from '@/domain/identity';
import type { PoolStatus } from '@/domain/prize-pools';
import { timeLeftLabel, type PoolView } from './browse-pools';

export function roleLabel(role: JobRole): string {
  return JOB_ROLES.find((r) => r.id === role)?.label ?? role;
}

export const DIFFICULTY_BADGE = {
  beginner: 'volt',
  intermediate: 'info',
  advanced: 'gold',
} as const;

const STATUS_LABEL: Record<PoolStatus, string> = {
  draft: 'Draft',
  published: 'Joining open',
  extended: 'Extended +48h',
  building: 'Build window',
  judging: 'Judging',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function statusBadge(status: PoolStatus): React.ReactNode {
  const variant =
    status === 'published' || status === 'extended'
      ? 'volt'
      : status === 'cancelled'
        ? 'danger'
        : status === 'building' || status === 'judging'
          ? 'info'
          : 'outline';
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export function formatDeadline(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** One pool in the listing — the whole card links to the detail page. */
export function PoolCard({ pool, now }: { pool: PoolView; now: Date }) {
  const isOpen = pool.status === 'published' || pool.status === 'extended';
  return (
    <Link href={`/pools/${pool.id}`} className="group block">
      <Card className="transition-colors group-hover:border-volt-dim/60">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="group-hover:text-volt">{pool.title}</CardTitle>
            <Badge variant={DIFFICULTY_BADGE[pool.difficulty]}>{pool.difficulty}</Badge>
            {statusBadge(pool.status)}
            {pool.joined && <Badge variant="gold">Joined</Badge>}
          </div>
          <CardDescription>
            <span className="font-mono text-xs">
              {roleLabel(pool.role)} · {pool.entrantCount}/{pool.entrantCap} entrants
              {isOpen && pool.joinDeadline && (
                <> · join window {timeLeftLabel(now, pool.joinDeadline)}</>
              )}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-fg-muted">{pool.brief}</p>
          {!pool.joined &&
            !pool.verdict.ok &&
            pool.verdict.reasons.includes('difficulty-locked') && (
              <p className="mt-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                🔒 Unlocks at higher pool rank
              </p>
            )}
        </CardContent>
      </Card>
    </Link>
  );
}
