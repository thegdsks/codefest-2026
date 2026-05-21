'use client';

import type { Icon } from '@phosphor-icons/react';
import { Gear, House, List, Pulse, Users } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
}

const PRIMARY_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: House },
  { href: '/admin/decisions', label: 'Decisions', icon: Pulse },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Config', icon: Gear },
];

interface MobileNavBarProps {
  onMoreOpen: () => void;
}

export default function MobileNavBar({ onMoreOpen }: MobileNavBarProps) {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t border-zinc-800 bg-zinc-950"
      aria-label="Mobile navigation"
    >
      {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70 ${
              isActive ? 'text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onMoreOpen}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
        aria-label="More navigation options"
      >
        <List size={20} aria-hidden="true" />
        More
      </button>
    </nav>
  );
}
