import { Card, CardContent, CardHeader, CardTitle, LeaderboardRow, StatCard } from '@/components';
import { cn } from '@/lib/cn';
import type { PoolResultsView, ResultRow } from './results';

/**
 * The results reveal. Server-rendered — the staggered entrance is a pure CSS
 * animation (reveal-up + an inline animation-delay), so there's no client JS and
 * the standings are fully present for crawlers, screen readers, and JS-off.
 *
 * The podium dramatizes the top three eligible finishers; the "you earned" panel
 * turns the abstract close into the dopamine the product runs on (XP/rank/level
 * gained); the full table is the honest record everyone can read.
 */

const PLATE: Record<number, { ring: string; label: string; medal: string }> = {
  1: {
    ring: 'border-gold/50 shadow-[0_0_24px_-6px_var(--color-gold)]',
    label: 'text-gold',
    medal: '1st',
  },
  2: { ring: 'border-silver/40', label: 'text-silver', medal: '2nd' },
  3: { ring: 'border-bronze/50', label: 'text-bronze', medal: '3rd' },
};

export function PoolResultsBoard({ view }: { view: PoolResultsView }) {
  const podium = view.standings.filter((s) => s.placement != null && s.placement <= 3);

  return (
    <div className="space-y-6">
      {view.me && <YouEarned me={view.me} profile={view.myProfile} />}

      {podium.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Visual order silver · gold · bronze on wide screens (gold centred). */}
          {orderForDisplay(podium).map((row) => (
            <PodiumCard key={row.userId} row={row} delayIndex={row.placement! - 1} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Final standings</CardTitle>
        </CardHeader>
        {/* Rows go edge-to-edge (they carry their own padding + dividers), so
            this sits OUTSIDE CardContent rather than fighting its padding. */}
        <div className="mt-3">
          {view.standings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-fg-muted">No entrants finished this pool.</p>
          ) : (
            view.standings.map((row, i) => (
              <div key={row.userId} className="reveal-up" style={{ animationDelay: `${i * 60}ms` }}>
                <LeaderboardRow
                  rank={row.placement ?? view.standings.length}
                  name={row.handle}
                  role={standingTag(row)}
                  value={`+${row.xpAwarded}`}
                  valueLabel="xp"
                  delta={row.rankAwarded > 0 ? row.rankAwarded : undefined}
                  you={row.isMe}
                />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function PodiumCard({ row, delayIndex }: { row: ResultRow; delayIndex: number }) {
  const plate = PLATE[row.placement!] ?? PLATE[3]!;
  return (
    <div
      className={cn(
        'reveal-up clip-corner rounded-lg border bg-surface px-5 py-6 text-center shadow-card',
        plate.ring,
        row.isMe && 'ring-1 ring-volt',
      )}
      style={{ animationDelay: `${delayIndex * 140}ms` }}
    >
      <p className={cn('font-display text-2xl tracking-widest', plate.label)}>{plate.medal}</p>
      <p className="mt-2 truncate text-sm font-semibold">
        {row.handle}
        {row.isMe && <span className="ml-2 text-xs font-bold text-volt">YOU</span>}
      </p>
      <p className="mt-3 font-mono text-lg font-bold text-volt tabular-nums">+{row.xpAwarded} XP</p>
      {row.rankAwarded > 0 && (
        <p className="mt-1 text-xs text-fg-subtle">+{row.rankAwarded} rank</p>
      )}
    </div>
  );
}

function YouEarned({ me, profile }: { me: ResultRow; profile: PoolResultsView['myProfile'] }) {
  return (
    <Card accent>
      <CardHeader>
        <CardTitle>
          {me.placement != null ? (
            <>
              You finished <span className="text-volt">{ordinal(me.placement)}</span>
            </>
          ) : me.submitted ? (
            'Your entry is in the books'
          ) : (
            'Pool complete'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!me.judged && me.submitted && (
          <p className="mb-4 text-sm text-gold">
            You shipped but didn&apos;t finish judging, so you weren&apos;t eligible to place. Judge
            your assigned demos next time to compete for the podium.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="XP earned" value={`+${me.xpAwarded}`} accent />
          <StatCard label="Rank earned" value={me.rankAwarded > 0 ? `+${me.rankAwarded}` : '—'} />
          <StatCard label="Level" value={profile ? String(profile.level) : '—'} />
          <StatCard
            label="Total XP"
            value={profile ? profile.xp.toLocaleString() : '—'}
            sub={profile ? `rank ${profile.globalRank} · streak ${profile.poolStreak}` : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** Put gold in the middle column on wide layouts: 2nd · 1st · 3rd. */
function orderForDisplay(podium: ResultRow[]): ResultRow[] {
  const by = (p: number) => podium.find((r) => r.placement === p);
  return [by(2), by(1), by(3)].filter((r): r is ResultRow => r !== undefined);
}

function standingTag(row: ResultRow): string {
  if (!row.submitted) return 'did not submit';
  if (!row.judged) return 'ineligible · skipped judging';
  if (row.placement == null) return 'unplaced';
  return `score ${row.score.toFixed(2)}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
