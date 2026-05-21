import type { ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral:
    'bg-[color:var(--bg-elevated)] text-[color:var(--text-muted)] border-[color:var(--border-strong)]',
  success:
    'bg-[color:var(--success-bg)] text-[color:var(--success-fg)] border-[color:var(--success-border)]',
  warning:
    'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]',
  danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  info: 'bg-[color:var(--info-bg)] text-[color:var(--info-fg)] border-[color:var(--info-border)]',
  accent: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'text-[10px] h-5 px-1.5',
  md: 'text-xs h-6 px-2',
};

export function Badge({ variant = 'neutral', size = 'md', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border font-medium',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
