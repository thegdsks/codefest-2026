'use client';

import type { Icon } from '@phosphor-icons/react';
import {
  ChartLineUp,
  Gear,
  House,
  MagnifyingGlass,
  ShieldCheck,
  SquaresFour,
  TextAlignLeft,
  Users,
  WaveSawtooth,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getHealth, getMetrics } from '@/lib/admin-api';
import Logo from '../Logo';
import UserMenu from './UserMenu';
import WorkspaceMenu from './WorkspaceMenu';

type HealthState = 'unknown' | 'ok' | 'down';

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  badgeKey?: keyof BadgeCounts;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface BadgeCounts {
  decisions: number;
  users: number;
  sessions: number;
  cases: number;
}

const SECTIONS: NavSection[] = [
  {
    label: 'Monitor',
    items: [
      { href: '/admin', label: 'Overview', icon: SquaresFour },
      {
        href: '/admin/decisions',
        label: 'Decision feed',
        icon: ChartLineUp,
        badgeKey: 'decisions',
      },
      { href: '/admin/signals', label: 'Signal history', icon: WaveSawtooth },
      { href: '/admin/sessions', label: 'Auth sessions', icon: ShieldCheck, badgeKey: 'sessions' },
    ],
  },
  {
    label: 'Investigate',
    items: [
      { href: '/admin/investigations', label: 'Cases', icon: MagnifyingGlass, badgeKey: 'cases' },
      { href: '/admin/users', label: 'Users', icon: Users, badgeKey: 'users' },
    ],
  },
  {
    label: 'Configure',
    items: [
      { href: '/admin/rules', label: 'Rules', icon: TextAlignLeft },
      { href: '/admin/settings', label: 'Configuration', icon: Gear },
    ],
  },
];

const POLL_MS = 30_000;

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
    timerRef.current = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return state;
}

function useBadgeCounts(): BadgeCounts | null {
  const [counts, setCounts] = useState<BadgeCounts | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      const res = await getMetrics('1h');
      if (cancelled || res.error !== null || res.data === null) return;
      const { totals } = res.data;
      setCounts({
        decisions: totals.total,
        users: totals.by_action ? Object.values(totals.by_action).reduce((a, b) => a + b, 0) : 0,
        sessions: totals.by_type?.login ?? 0,
        cases: totals.by_action?.review ?? 0,
      });
    };
    fetch();
    timerRef.current = setInterval(fetch, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return counts;
}

function Badge({ count, tone }: { count: number; tone: 'default' | 'accent' }) {
  if (count === 0) return null;
  const label = count > 999 ? '999+' : String(count);
  const cls =
    tone === 'accent'
      ? 'bg-[color:var(--accent)] text-[color:var(--accent-fg)] ring-transparent'
      : 'bg-[color:var(--hover)] text-[color:var(--text-muted)] ring-[color:var(--border)]';
  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      className={`ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
  badge: number | null;
}

function NavLink({ item, isActive, badge }: NavLinkProps) {
  const I = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative flex h-8 items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-[13px] font-medium leading-none tracking-[-0.005em] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 ${
        isActive
          ? 'bg-[color:var(--bg-elevated)] text-[color:var(--text)] font-semibold'
          : 'text-[color:var(--text-muted)] hover:bg-[color:var(--hover)] hover:text-[color:var(--text)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[color:var(--accent)] transition-all duration-200 ease-out ${
          isActive ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
        }`}
      />
      <I
        size={15}
        weight={isActive ? 'fill' : 'regular'}
        className={`shrink-0 transition-colors duration-200 ${
          isActive
            ? 'text-[color:var(--text)]'
            : 'text-[color:var(--text-dim)] group-hover:text-[color:var(--text)]'
        }`}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{item.label}</span>
      {badge !== null && badge > 0 && (
        <Badge count={badge} tone={isActive ? 'accent' : 'default'} />
      )}
    </Link>
  );
}

interface FloatingSidebarProps {
  onOpenCommandPalette?: () => void;
  onOpenShortcuts?: () => void;
}

export default function FloatingSidebar({
  onOpenCommandPalette,
  onOpenShortcuts,
}: FloatingSidebarProps = {}) {
  const pathname = usePathname();
  const health = useHealthPoll();
  const badges = useBadgeCounts();

  return (
    <aside
      aria-label="Primary navigation"
      className="surface-float hidden md:flex w-[244px] shrink-0 flex-col rounded-xl"
    >
      <div className="px-3 pt-3 pb-2 border-b border-white/[0.04]">
        <WorkspaceMenu />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5" aria-label="Admin navigation">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-dim)] select-none">
              {section.label}
            </div>
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive =
                  item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : null;
                return (
                  <NavLink key={item.href} item={item} isActive={isActive} badge={badgeCount} />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-2 pt-2 pb-2 border-t border-white/[0.04] space-y-1">
        <Link
          href="/"
          className="group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium leading-none tracking-[-0.005em] text-[color:var(--text-muted)] transition-all duration-200 ease-out hover:bg-[color:var(--hover)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40"
        >
          <House
            size={15}
            weight="regular"
            className="shrink-0 text-[color:var(--text-dim)] transition-colors duration-200 group-hover:text-[color:var(--text)]"
            aria-hidden="true"
          />
          <span className="flex-1 truncate">Back to site</span>
        </Link>
        <UserMenu
          health={health}
          onOpenCommandPalette={onOpenCommandPalette}
          onOpenShortcuts={onOpenShortcuts}
        />
      </div>
    </aside>
  );
}
