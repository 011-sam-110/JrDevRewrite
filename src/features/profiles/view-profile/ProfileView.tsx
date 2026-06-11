import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from '@/components';
import { BADGES, type BadgeTier } from '@/domain/gamification';
import { JOB_ROLES } from '@/domain/identity';
import { cn } from '@/lib/cn';
import { PrivacyToggle } from '@/features/profiles/toggle-privacy/PrivacyToggle';
import type { ProfileHistoryEntry, ProfileView as ProfileViewModel } from './profile';

/**
 * The developer profile — the recruiter-facing portfolio. Server-rendered: the
 * whole surface is present for crawlers and JS-off (the thesis is a shareable,
 * indexable identity page). The privacy toggle is the only interactive bit, and
 * it's a plain server-action form, so even that needs no client JS.
 */

const TIER_MEDAL: Record<BadgeTier, string> = {
  gold: 'border-gold/50 bg-gold/10 text-gold',
  silver: 'border-silver/40 bg-silver/10 text-silver',
  bronze: 'border-bronze/50 bg-bronze/10 text-bronze',
};

export function ProfileView({ profile }: { profile: ProfileViewModel }) {
  const roleLabel = JOB_ROLES.find((r) => r.id === profile.jobRole)?.label ?? profile.jobRole;
  const xpToNext = profile.progress.xpForNextLevel - profile.progress.xpIntoLevel;
  const earnedIds = new Set(profile.badges.map((b) => b.id));

  return (
    <div className="space-y-6">
      {/* Identity header */}
      <Card accent>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-3xl tracking-wide text-glow">{profile.handle}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {roleLabel && <Badge variant="volt">{roleLabel}</Badge>}
                <Badge variant={profile.visibility === 'public' ? 'neutral' : 'danger'}>
                  {profile.visibility === 'public' ? 'Public' : 'Private'}
                </Badge>
                {profile.githubUsername && (
                  <a
                    href={`https://github.com/${profile.githubUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-fg-muted underline-offset-4 hover:text-volt hover:underline"
                  >
                    gh:{profile.githubUsername}
                  </a>
                )}
              </div>
            </div>
            {profile.isOwner && <PrivacyToggle visibility={profile.visibility} />}
          </div>
        </CardContent>
      </Card>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Level"
          value={String(profile.level)}
          sub={`${profile.xp.toLocaleString()} XP · ${xpToNext} to next`}
          accent
        />
        <StatCard
          label="Pool rank"
          value={profile.globalRank > 0 ? String(profile.globalRank) : '—'}
          sub={profile.globalRank > 0 ? 'global ladder' : 'unranked'}
        />
        <StatCard
          label="Battle Elo"
          value={profile.stats.battlesPlayed > 0 ? profile.elo.toLocaleString() : '—'}
          sub={
            profile.stats.battlesPlayed > 0
              ? `${profile.stats.battleWins}W / ${profile.stats.battlesPlayed} battles`
              : 'no rated battles'
          }
        />
        <StatCard
          label="Wins"
          value={String(profile.stats.wins)}
          sub={`${profile.stats.podiums} podium${profile.stats.podiums === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Streak"
          value={String(profile.poolStreak)}
          sub={`${profile.stats.poolsSubmitted}/${profile.stats.poolsEntered} shipped`}
        />
      </div>

      {/* Badges */}
      <Card>
        <CardHeader>
          <CardTitle>
            Badges{' '}
            <span className="text-sm font-normal text-fg-subtle">
              {earnedIds.size}/{BADGES.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BADGES.map((b) => {
              const earned = earnedIds.has(b.id);
              return (
                <div
                  key={b.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-4 py-3',
                    earned
                      ? 'border-edge bg-surface'
                      : 'border-edge-subtle bg-surface/40 opacity-50',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-sm border font-display text-xs',
                      earned ? TIER_MEDAL[b.tier] : 'border-edge-subtle text-fg-subtle',
                    )}
                  >
                    {earned ? '★' : '🔒'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{b.name}</p>
                    <p className="text-xs text-fg-muted">{b.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Competition history — wins/podiums shown; losses stay aggregate (the stats above). */}
      <Card>
        <CardHeader>
          <CardTitle>Competition history</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.history.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No finished pools yet. Closed competitions show up here.
            </p>
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {profile.history.map((h) => (
                <HistoryRow key={h.poolId} entry={h} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryRow({ entry }: { entry: ProfileHistoryEntry }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <ResultTag entry={entry} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/pools/${entry.poolId}/results`}
          className="truncate text-sm font-semibold underline-offset-4 hover:text-volt hover:underline"
        >
          {entry.poolTitle}
        </Link>
        <p className="text-xs tracking-wide text-fg-subtle uppercase">
          {entry.difficulty} · {formatDate(entry.date)}
        </p>
      </div>
      <span className="font-mono text-sm font-bold text-volt tabular-nums">+{entry.xpAwarded}</span>
    </li>
  );
}

/** Wins/podiums are celebrated; non-podium results read as "Shipped"/"Competed" — never a losing rank. */
function ResultTag({ entry }: { entry: ProfileHistoryEntry }) {
  if (entry.won) return <Badge variant="gold">🏆 1st</Badge>;
  if (entry.podiumPlacement != null)
    return <Badge variant="neutral">Podium · {ordinal(entry.podiumPlacement)}</Badge>;
  if (entry.submitted) return <Badge variant="outline">Shipped</Badge>;
  return <Badge variant="outline">Competed</Badge>;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
