'use client';

import {
  BookOpen,
  CaretUp,
  Command,
  Desktop,
  Keyboard,
  Lifebuoy,
  Moon,
  SignOut,
  Sparkle,
  Sun,
  UserGear,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { adminApiConfig, setAdminBearerToken } from '@/lib/admin-api';
import { useClickOutside } from '@/lib/use-click-outside';

const APP_VERSION = '0.4.2';

type Health = 'unknown' | 'ok' | 'down';

interface UserMenuProps {
  health: Health;
  onOpenShortcuts?: () => void;
}

function ThemeSegment() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? 'system') : 'system';

  const options: { value: 'light' | 'dark' | 'system'; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Desktop, label: 'System' },
  ];

  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <span className="text-[12.5px] text-zinc-300">Theme</span>
      <div className="inline-flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5 ring-1 ring-inset ring-white/[0.06]">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={active}
              aria-label={opt.label}
              title={opt.label}
              className={`inline-grid h-6 w-6 place-items-center rounded transition-colors ${
                active
                  ? 'bg-white/[0.08] text-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={12} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  shortcut,
  onClick,
  danger,
}: {
  icon: typeof Sun;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-white/[0.05]"
    >
      <Icon
        size={13}
        className={`shrink-0 ${danger ? 'text-rose-400' : 'text-zinc-500'}`}
        aria-hidden="true"
      />
      <span className={`flex-1 ${danger ? 'text-rose-300' : 'text-zinc-200'}`}>{label}</span>
      {shortcut && <span className="text-[10.5px] text-zinc-600 tabular-nums">{shortcut}</span>}
    </button>
  );
}

export default function UserMenu({ health, onOpenShortcuts }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useClickOutside(ref, () => setOpen(false), open);

  const host = adminApiConfig.baseUrl.replace(/^https?:\/\//, '').split('/')[0] || 'local';

  const healthLabel =
    health === 'ok'
      ? 'All systems normal'
      : health === 'down'
        ? 'API unreachable'
        : 'Checking systems';
  const healthDot =
    health === 'ok' ? 'bg-emerald-400' : health === 'down' ? 'bg-rose-400' : 'bg-zinc-600';

  const handleSignOut = () => {
    setAdminBearerToken(null);
    setOpen(false);
    router.push('/login');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
      >
        <span className="relative shrink-0">
          <span
            aria-hidden="true"
            className="inline-grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-[11px] font-semibold text-zinc-100 ring-1 ring-white/[0.08]"
          >
            A
          </span>
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[color:var(--bg-surface)] ${healthDot}`}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium leading-none text-zinc-100">Admin</span>
          <span className="truncate text-[11px] leading-none text-zinc-500">{host}</span>
        </span>
        <CaretUp size={12} className="shrink-0 text-zinc-500" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="surface-popover absolute bottom-[calc(100%+6px)] left-0 right-0 z-50 origin-bottom-left animate-[menu-in_120ms_ease-out] overflow-hidden rounded-xl"
        >
          {/* Identity */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3 py-2.5">
            <span
              aria-hidden="true"
              className="inline-grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-[13px] font-semibold text-zinc-100 ring-1 ring-white/[0.08]"
            >
              A
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-zinc-100">Admin</span>
              <span className="truncate text-[11px] text-zinc-500">admin@signal-force.dev</span>
            </span>
          </div>

          <div className="px-1.5 py-1.5">
            <Row icon={UserGear} label="Account settings" shortcut="⌘ ," />
            <Row icon={Sparkle} label="Preferences" />
            <ThemeSegment />
          </div>

          <div className="border-t border-white/[0.06] px-1.5 py-1.5">
            <Row icon={Command} label="Command menu" shortcut="⌘ K" />
            <Row
              icon={Keyboard}
              label="Keyboard shortcuts"
              shortcut="⌘ /"
              onClick={onOpenShortcuts}
            />
            <Row icon={Sparkle} label="What's new" />
          </div>

          <div className="border-t border-white/[0.06] px-1.5 py-1.5">
            <Row icon={BookOpen} label="Documentation" />
            <Row icon={Lifebuoy} label="Contact support" />
          </div>

          <div className="border-t border-white/[0.06] px-1.5 py-1.5">
            <Row icon={SignOut} label="Sign out" onClick={handleSignOut} danger />
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2 text-[10.5px] text-zinc-500">
            <span className="tabular-nums">v{APP_VERSION}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${healthDot}`} aria-hidden="true" />
              {healthLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
