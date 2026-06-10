import { useId } from 'react';
import { cn } from '@/lib/cn';

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-xs font-semibold uppercase tracking-widest text-fg-muted', className)}
      {...props}
    >
      {children}
    </label>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid = false, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle',
        'transition-[border-color,box-shadow] ease-(--ease-snap)',
        'focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:pointer-events-none disabled:opacity-45',
        invalid
          ? 'border-danger focus-visible:outline-danger'
          : 'border-edge hover:border-edge focus-visible:border-volt-dim',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Field = label + control + hint/error wiring. It owns the ids so the
 * control, hint, and error are linked for screen readers automatically.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    invalid: boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, invalid: Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
