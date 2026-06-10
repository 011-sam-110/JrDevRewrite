import { cn } from '@/lib/cn';

/* Leaderboards are the heart of the product — these rows are a first-class
   primitive, not table styling improvised per page. */

const rankPlate: Record<number, string> = {
  1: 'bg-gold/15 text-gold border-gold/40',
  2: 'bg-silver/10 text-silver border-silver/30',
  3: 'bg-bronze/15 text-bronze border-bronze/40',
};

export function LeaderboardRow({
  rank,
  name,
  role,
  value,
  valueLabel,
  delta,
  you = false,
}: {
  rank: number;
  name: string;
  role?: string;
  value: string;
  valueLabel?: string;
  delta?: number;
  you?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 border-b border-edge-subtle px-4 py-3 transition-colors hover:bg-raised/60',
        you && 'border-l-2 border-l-volt bg-volt/5',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-10 shrink-0 items-center justify-center rounded-sm border font-mono text-sm font-bold',
          rankPlate[rank] ?? 'border-edge-subtle bg-surface text-fg-subtle',
        )}
      >
        {rank}
      </span>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-raised font-display text-xs text-fg-muted"
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {name}
          {you && <span className="ml-2 text-xs font-bold tracking-wide text-volt">YOU</span>}
        </p>
        {role && <p className="text-xs tracking-wide text-fg-subtle uppercase">{role}</p>}
      </div>
      {delta !== undefined && delta !== 0 && <Delta value={delta} />}
      <div className="text-right">
        <p className="font-mono text-sm font-bold tabular-nums">{value}</p>
        {valueLabel && (
          <p className="text-[10px] tracking-widest text-fg-subtle uppercase">{valueLabel}</p>
        )}
      </div>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const up = value > 0;
  return (
    <span
      className={cn(
        'flex items-center gap-1 font-mono text-xs font-bold tabular-nums',
        up ? 'text-volt' : 'text-danger',
      )}
    >
      <svg viewBox="0 0 8 8" className={cn('size-2', !up && 'rotate-180')} aria-hidden="true">
        <path d="M4 0l4 8H0z" fill="currentColor" />
      </svg>
      {Math.abs(value)}
      <span className="sr-only">{up ? 'up' : 'down'}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-surface px-5 py-4 shadow-card',
        accent ? 'clip-corner-sm rounded-tr-none border-volt-dim/50' : 'border-edge-subtle',
      )}
    >
      <p className="text-xs font-semibold tracking-widest text-fg-subtle uppercase">{label}</p>
      <p
        className={cn('mt-1 font-display text-3xl tracking-wide', accent && 'text-volt text-glow')}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-fg-muted">{sub}</p>}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
