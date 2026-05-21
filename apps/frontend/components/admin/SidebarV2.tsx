'use client';

import {
  Activity,
  Circle,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminApiConfig, getHealth } from '@/lib/admin-api';

type HealthState = 'unknown' | 'ok' | 'down';

const POLL_MS = 30_000;

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/decisions', label: 'Decision feed', icon: Activity },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/sessions', label: 'Auth sessions', icon: ShieldCheck },
  { href: '/admin/rules', label: 'Rules', icon: ScrollText },
  { href: '/admin/settings', label: 'Configuration', icon: Settings },
];

function useHealthPoll(): { state: HealthState; checkedAt: number | null } {
  const [state, setState] = useState<HealthState>('unknown');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const res = await getHealth();
      if (cancelled) return;
      setState(res.error === null ? 'ok' : 'down');
      setCheckedAt(Date.now());
    };
    check();
    timerRef.current = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { state, checkedAt };
}

export default function SidebarV2() {
  const pathname = usePathname();
  const { state } = useHealthPoll();

  const dotClass =
    state === 'ok'
      ? 'text-emerald-400 fill-emerald-400'
      : state === 'down'
        ? 'text-rose-400 fill-rose-400'
        : 'text-zinc-500 fill-zinc-500';

  const dotLabel = state === 'ok' ? 'API healthy' : state === 'down' ? 'API down' : 'Checking API';

  const host = adminApiConfig.baseUrl.replace(/^https?:\/\//, '').split('/')[0];

  return (
    <aside className="group hidden md:flex w-16 hover:w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200 ease-in-out overflow-hidden">
      {/* Logo — gradient kept as brand mark, not chrome */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-zinc-800 min-h-[57px]">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white"
          aria-hidden="true"
        >
          SF
        </span>
        <div className="leading-tight opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap overflow-hidden">
          <div className="text-sm font-semibold text-zinc-100">Signal Force</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Admin</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
            >
              {/* Solid accent left stripe for active state */}
              {isActive ? (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-indigo-500" />
              ) : null}
              <Icon size={15} className="shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap overflow-hidden">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: health dot */}
      <div className="px-3 py-4 border-t border-zinc-800">
        <div
          className="flex items-center gap-2"
          aria-live="polite"
          aria-atomic="true"
          title={dotLabel}
        >
          <Circle size={8} strokeWidth={0} className={`shrink-0 ${dotClass}`} />
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap text-[11px] text-zinc-500 overflow-hidden">
            {host}
          </span>
        </div>
      </div>
    </aside>
  );
}
