'use client';

import type { Icon } from '@phosphor-icons/react';
import { Circle, Gear, House, Pulse, Scroll, ShieldCheck, Users, X } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminApiConfig, getHealth } from '@/lib/admin-api';

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
}

const ALL_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: House },
  { href: '/admin/decisions', label: 'Decision feed', icon: Pulse },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/sessions', label: 'Auth sessions', icon: ShieldCheck },
  { href: '/admin/rules', label: 'Rules', icon: Scroll },
  { href: '/admin/settings', label: 'Configuration', icon: Gear },
];

type HealthState = 'unknown' | 'ok' | 'down';

function useHealthPoll(): HealthState {
  const [state, setState] = useState<HealthState>('unknown');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const res = await getHealth();
      if (cancelled) return;
      setState(res.error === null ? 'ok' : 'down');
    };
    check();
    timerRef.current = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return state;
}

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const health = useHealthPoll();
  const host = adminApiConfig.baseUrl.replace(/^https?:\/\//, '').split('/')[0];

  const dotClass =
    health === 'ok'
      ? 'text-emerald-400 fill-emerald-400'
      : health === 'down'
        ? 'text-rose-400 fill-rose-400'
        : 'text-[color:var(--text-dim)] fill-zinc-500';

  const dotLabel =
    health === 'ok' ? 'API healthy' : health === 'down' ? 'API down' : 'Checking API';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="md:hidden fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--bg)]/70 backdrop-blur-sm cursor-default"
      />

      {/* Slide-in panel */}
      <div className="relative flex w-64 max-w-[80vw] flex-col border-r border-[color:var(--border)] bg-[color:var(--bg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-4">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white"
              aria-hidden="true"
            >
              SF
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-[color:var(--text)]">Signal Force</div>
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-dim)]">
                Admin
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
          {ALL_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  isActive
                    ? 'bg-[color:var(--bg-elevated)] text-[color:var(--text)]'
                    : 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text)]'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-indigo-500" />
                ) : null}
                <Icon size={15} className="shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-[color:var(--border)] px-3 py-3 space-y-1">
          <Link
            href="/"
            onClick={onClose}
            className="relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            <House size={15} className="shrink-0" aria-hidden="true" />
            Back to site
          </Link>
          <div className="flex items-center gap-2 px-3 py-1" title={dotLabel} aria-live="polite">
            <Circle size={8} strokeWidth={0} className={`shrink-0 ${dotClass}`} />
            <span className="text-[11px] text-[color:var(--text-dim)] truncate">{host}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
