'use client';

import type { Icon } from '@phosphor-icons/react';
import {
  CaretDown,
  CaretUpDown,
  ChartLineUp,
  Circle,
  Gear,
  House,
  ShieldCheck,
  SignOut,
  Sparkle,
  SquaresFour,
  TextAlignLeft,
  Users,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminApiConfig, getHealth, getMetrics } from '@/lib/admin-api';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const SECTIONS: NavSection[] = [
  {
    label: 'Monitoring',
    items: [
      { href: '/admin', label: 'Dashboard', icon: SquaresFour },
      { href: '/admin/decisions', label: 'Decisions', icon: ChartLineUp, badgeKey: 'decisions' },
      { href: '/admin/sessions', label: 'Sessions', icon: ShieldCheck, badgeKey: 'sessions' },
    ],
  },
  {
    label: 'Members',
    items: [{ href: '/admin/users', label: 'Users', icon: Users, badgeKey: 'users' }],
  },
  {
    label: 'Config',
    items: [
      { href: '/admin/rules', label: 'Rules', icon: TextAlignLeft },
      { href: '/admin/settings', label: 'Settings', icon: Gear },
    ],
  },
];

const POLL_MS = 30_000;

// ─── Hooks ────────────────────────────────────────────────────────────────────

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
        sessions: totals.by_type?.['login'] ?? 0,
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  const label = count > 999 ? '999+' : String(count);
  return (
    <span
      aria-live="polite"
      aria-atomic="true"
      className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-zinc-800 px-1.5 py-px text-[10px] font-medium tabular-nums text-zinc-400 ring-1 ring-inset ring-zinc-700"
    >
      {label}
    </span>
  );
}

function WorkspaceSwitcher() {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-900 cursor-pointer transition-colors group/ws">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-bold text-white select-none">
        SF
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-zinc-100 leading-none">
          Signal Force
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1">
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
            prod
          </span>
        </span>
      </span>
      <CaretUpDown
        size={12}
        className="shrink-0 text-zinc-500 group-hover/ws:text-zinc-400 transition-colors"
      />
    </div>
  );
}

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
  badge: number | null;
}

function NavLink({ item, isActive, badge }: NavLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={`relative flex items-center gap-2 rounded-md px-2 py-[7px] text-[13px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 ${
        isActive
          ? 'bg-zinc-800/70 text-zinc-100'
          : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
      }`}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-gradient-to-b from-indigo-500 to-fuchsia-500"
        />
      )}
      <Icon
        size={16}
        weight={isActive ? 'fill' : 'regular'}
        className="shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{item.label}</span>
      {badge !== null && badge > 0 && <Badge count={badge} />}
    </Link>
  );
}

interface UserBlockProps {
  health: HealthState;
}

function UserBlock({ health }: UserBlockProps) {
  const [hovered, setHovered] = useState(false);
  const host = adminApiConfig.baseUrl.replace(/^https?:\/\//, '').split('/')[0];

  const dotClass =
    health === 'ok'
      ? 'text-emerald-400 fill-emerald-400'
      : health === 'down'
        ? 'text-rose-400 fill-rose-400'
        : 'text-zinc-600 fill-zinc-600';

  const dotLabel =
    health === 'ok' ? 'API healthy' : health === 'down' ? 'API down' : 'Checking API';

  return (
    <div className="space-y-1">
      {/* API health */}
      <div
        className="flex items-center gap-2 px-2 py-1"
        aria-live="polite"
        aria-atomic="true"
        title={dotLabel}
      >
        <Circle size={7} weight="fill" className={`shrink-0 ${dotClass}`} aria-hidden="true" />
        <span className="truncate text-[11px] text-zinc-600">{host}</span>
      </div>

      {/* User row */}
      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950"
        aria-label="Admin user options"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-300 ring-1 ring-zinc-700 select-none">
          A
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[12px] font-medium text-zinc-300 leading-none">Admin</span>
          <span className="mt-0.5 truncate text-[10px] text-zinc-600 leading-none">
            signal-force
          </span>
        </span>
        {hovered ? (
          <SignOut size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />
        ) : (
          <CaretDown size={11} className="shrink-0 text-zinc-600" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SidebarV3() {
  const pathname = usePathname();
  const health = useHealthPoll();
  const badges = useBadgeCounts();

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-zinc-800/60 bg-zinc-950">
      {/* Workspace switcher */}
      <div className="px-2 py-3 border-b border-zinc-800/60">
        <WorkspaceSwitcher />
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Admin navigation">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 select-none">
              {section.label}
            </div>
            <div className="space-y-0.5">
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

      {/* User + health footer */}
      <div className="px-2 py-3 border-t border-zinc-800/60">
        <UserBlock health={health} />
      </div>
    </aside>
  );
}
