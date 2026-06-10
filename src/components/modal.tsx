'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Controlled modal: scrim click + Escape both close (always give an escape
 * route), focus moves into the panel on open, and the title labels the
 * dialog for screen readers.
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-ink/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'clip-corner relative w-full max-w-md rounded-lg rounded-tr-none border border-edge bg-raised shadow-card',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <h2 id={titleId} className="font-display text-lg tracking-wide">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-sm p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-fg-muted">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-edge-subtle px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
