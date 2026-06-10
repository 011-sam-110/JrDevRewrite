import Link from 'next/link';
import { Card, LeaderboardRow } from '@/components';
import { JOB_ROLES } from '@/domain/identity';
import { cn } from '@/lib/cn';
import type { LeaderboardView } from './leaderboard';

/**
 * The ladder surface: a scope switcher (Global + one tab per launch role) over a
 * list of `LeaderboardRow` primitives. The tabs are plain links carrying
 * `?role=…`, so the board is server-rendered, deep-linkable and shareable with
 * no client JS. Each row links to that player's public profile.
 */

const TABS = [{ id: 'global', label: 'Global' }, ...JOB_ROLES] as const;

export function LeaderboardTable({ view }: { view: LeaderboardView }) {
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2" aria-label="Leaderboard scope">
        {TABS.map((tab) => {
          const active = view.scope === tab.id;
          const href = tab.id === 'global' ? '/leaderboard' : `/leaderboard?role=${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors',
                active
                  ? 'border-volt-dim/60 bg-volt/10 text-volt'
                  : 'border-edge bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Card>
        {view.entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-muted">
            No ranked players yet. Finish a pool to claim a spot.
          </p>
        ) : (
          <div>
            {view.entries.map((e) => (
              <Link key={e.userId} href={`/u/${e.handle}`} className="block">
                <LeaderboardRow
                  rank={e.rank}
                  name={e.handle}
                  role={`Lvl ${e.level}${e.wins > 0 ? ` · ${e.wins} win${e.wins === 1 ? '' : 's'}` : ''}`}
                  value={e.points.toLocaleString()}
                  valueLabel={view.scope === 'global' ? 'rank pts' : 'role pts'}
                  you={e.isMe}
                />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
