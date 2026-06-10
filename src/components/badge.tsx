import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'volt' | 'gold' | 'elo' | 'info' | 'danger' | 'outline';

const variants: Record<BadgeVariant, string> = {
  neutral: 'border-edge bg-raised text-fg-muted',
  volt: 'border-volt-dim/60 bg-volt/10 text-volt',
  gold: 'border-gold/40 bg-gold/10 text-gold',
  elo: 'border-elo/40 bg-elo/10 text-elo',
  info: 'border-info/40 bg-info/10 text-info',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  outline: 'border-edge bg-transparent text-fg-muted',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
