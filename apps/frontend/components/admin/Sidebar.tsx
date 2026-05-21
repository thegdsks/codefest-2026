'use client';

import {
  Activity,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/decisions', label: 'Decisions', icon: Activity },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/sessions', label: 'Sessions', icon: ShieldCheck },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-zinc-800">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
          SF
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-zinc-100">Signal Force</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Admin</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-zinc-800 text-[11px] text-zinc-500">
        Codefest 2026
      </div>
    </aside>
  );
}
