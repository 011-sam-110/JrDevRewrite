import { cn } from '@/lib/cn';

/* Composable card family — the standard compound-component pattern:
   consumers assemble Header/Content/Footer instead of prop-drilling slots.
   `accent` switches on the signature cut-corner plate + volt edge. */

export function Card({
  accent = false,
  className,
  children,
}: {
  accent?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-surface shadow-card',
        accent ? 'clip-corner rounded-tr-none border-volt-dim/50' : 'border-edge-subtle',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5', className)}>{children}</div>;
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h3 className={cn('font-display text-lg tracking-wide', className)}>{children}</h3>;
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn('text-sm text-fg-muted', className)}>{children}</p>;
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-3 border-t border-edge-subtle px-5 py-4', className)}>
      {children}
    </div>
  );
}
