'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

type IconButtonSize = 'sm' | 'md';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: IconButtonSize;
  children: ReactNode;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'h-6 w-6 rounded',
  md: 'h-8 w-8 rounded-md',
};

export function IconButton({
  label,
  size = 'md',
  tooltipSide = 'top',
  children,
  className = '',
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className={[
          'inline-flex items-center justify-center text-[var(--text-muted)] transition-colors duration-100',
          'hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          SIZE_CLASSES[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
}
