'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button } from './Button';

type ModalVariant = 'default' | 'destructive';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: ModalVariant;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmLoading?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  variant = 'default',
  title,
  description,
  children,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
  confirmLoading = false,
}: ModalProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[301] w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl shadow-black/40 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <Dialog.Title className="text-base font-semibold text-[var(--text)]">
            {title}
          </Dialog.Title>

          {description && (
            <Dialog.Description className="mt-2 text-sm text-[var(--text-muted)]">
              {description}
            </Dialog.Description>
          )}

          {children && <div className="mt-4">{children}</div>}

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleCancel} autoFocus>
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'primary'}
              size="sm"
              onClick={onConfirm}
              loading={confirmLoading}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
