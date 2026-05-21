'use client';

import { CircleNotch } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent)]/90 border-transparent',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--border-strong)]/40 border-[var(--border)]',
  ghost:
    'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] border-transparent',
  destructive: 'bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90 border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-lg gap-2',
  lg: 'h-11 px-5 text-sm rounded-lg gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-medium border transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <>
          <CircleNotch size={14} className="animate-spin" />
          <span className="sr-only">Loading</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
