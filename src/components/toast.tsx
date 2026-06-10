'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'neutral' | 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastApi {
  toast: (t: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const variantClasses: Record<ToastVariant, string> = {
  neutral: 'border-edge',
  success: 'border-volt-dim/60 [&_[data-bar]]:bg-volt',
  danger: 'border-danger/50 [&_[data-bar]]:bg-danger',
  info: 'border-info/50 [&_[data-bar]]:bg-info',
};

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    ({ title, description, variant = 'neutral' }) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* aria-live region: announced politely, never steals focus */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-md border bg-raised py-3 pr-3 pl-4 shadow-card',
              variantClasses[t.variant],
            )}
          >
            <span data-bar className="absolute inset-y-0 left-0 w-1 bg-edge" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="cursor-pointer rounded-sm p-1 text-fg-subtle transition-colors hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
