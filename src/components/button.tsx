import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold uppercase tracking-wider ' +
  'transition-[background-color,border-color,box-shadow,transform] ease-(--ease-snap) ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-volt text-ink shadow-glow hover:bg-volt-bright hover:shadow-glow-strong',
  secondary: 'border border-edge bg-raised text-fg hover:border-volt-dim hover:text-volt-bright',
  ghost: 'text-fg-muted hover:bg-raised hover:text-fg',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
