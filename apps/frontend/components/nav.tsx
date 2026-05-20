'use client';

import { LayoutDashboard, LogIn } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/login', label: 'Login', icon: LogIn },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4">
      {links.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ${
              isActive
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
