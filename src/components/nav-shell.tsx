import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface NavItem {
  label: string;
  href: string;
}

/**
 * App chrome: sticky top nav + content container. Presentational — the
 * caller supplies items and the current path (server layouts know it),
 * so this stays a server component with zero client JS.
 */
export function AppShell({
  items,
  currentPath,
  right,
  children,
}: {
  items: NavItem[];
  currentPath: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-edge-subtle bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
          <Logo />
          {/* The nav stretches to the full header height and the active
              underline sits at ITS bottom edge (= the header border). Hanging
              the underline below the box (the old -bottom-[13px]) made the
              overflow-x-auto container vertically scrollable, which rendered
              a phantom scrollbar nub on Windows. */}
          <nav
            aria-label="Primary"
            className="flex h-14 items-stretch gap-1 self-stretch overflow-x-auto overflow-y-hidden"
          >
            {items.map((item) => {
              const active = currentPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center rounded-sm px-3 text-xs font-semibold tracking-widest whitespace-nowrap uppercase transition-colors',
                    active ? 'text-volt' : 'text-fg-muted hover:bg-raised hover:text-fg',
                  )}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 bottom-0 h-0.5 bg-volt shadow-glow"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">{right}</div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex shrink-0 items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="clip-corner-sm flex size-7 items-center justify-center bg-volt font-display text-sm text-ink"
      >
        JD
      </span>
      <span className="font-display text-base tracking-wide">
        JUNIOR<span className="text-volt">DEV</span>
      </span>
    </Link>
  );
}

/** Standard page container — consistent max width and gutters everywhere. */
export function PageShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={cn('mx-auto w-full max-w-6xl px-4 py-8 md:px-6', className)}>{children}</main>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl tracking-wide">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
