'use client';

import { X } from '@phosphor-icons/react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

type SheetSide = 'right' | 'left' | 'bottom';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: SheetSide;
  width?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const SIDE_CLASSES: Record<SheetSide, string> = {
  right:
    'fixed right-0 top-0 h-full data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
  left: 'fixed left-0 top-0 h-full data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
  bottom:
    'fixed bottom-0 left-0 right-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
};

export function Sheet({
  open,
  onOpenChange,
  side = 'right',
  width = 'w-[420px]',
  header,
  footer,
  children,
}: SheetProps) {
  const sideClass = SIDE_CLASSES[side];
  const sizeClass = side === 'bottom' ? 'max-h-[80vh]' : width;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={`z-[201] flex flex-col bg-[var(--bg-surface)] shadow-2xl shadow-black/50 outline-none duration-300 ${sideClass} ${sizeClass}`}
        >
          {header && (
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="text-sm font-semibold text-[var(--text)]">{header}</div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close sheet"
                  className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5">{children}</div>

          {footer && (
            <div className="shrink-0 border-t border-[var(--border)] px-5 py-4">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
