'use client';

import { useEffect, useState } from 'react';
import CommandPalette from '@/components/admin/CommandPalette';
import MobileDrawer from '@/components/admin/MobileDrawer';
import MobileNavBar from '@/components/admin/MobileNavBar';
import SidebarV3 from '@/components/admin/SidebarV3';
import TopBarV2 from '@/components/admin/TopBarV2';
import { QueryProvider } from '@/lib/query-client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <QueryProvider>
      {/* Desktop layout: sidebar visible at md+ */}
      <div className="fixed inset-0 z-30 flex bg-zinc-950 text-zinc-100">
        {/* SidebarV3 is self-contained and renders hidden under md */}
        <SidebarV3 />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBarV2 onCmdK={() => setPaletteOpen(true)} onMenuOpen={() => setDrawerOpen(true)} />
          {/* Extra bottom padding on mobile to clear the sticky nav bar */}
          <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile: slide-in drawer (hamburger from TopBarV2) */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Mobile: sticky bottom nav bar */}
      <MobileNavBar onMoreOpen={() => setDrawerOpen(true)} />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </QueryProvider>
  );
}
