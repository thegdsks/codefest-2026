'use client';

import { useEffect, useState } from 'react';
import CommandPalette from '@/components/admin/CommandPalette';
import FloatingSidebar from '@/components/admin/FloatingSidebar';
import MobileDrawer from '@/components/admin/MobileDrawer';
import MobileNavBar from '@/components/admin/MobileNavBar';
import TopBarV2 from '@/components/admin/TopBarV2';

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
    <>
      <div className="app-canvas fixed inset-0 z-30 flex text-[var(--text)] md:p-3">
        <FloatingSidebar />
        <div className="flex min-w-0 flex-1 flex-col md:ml-3 md:rounded-xl md:border md:border-[var(--border)] md:bg-[var(--bg-surface)] md:shadow-[var(--shadow-float)] overflow-hidden">
          <TopBarV2 onCmdK={() => setPaletteOpen(true)} onMenuOpen={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <MobileNavBar onMoreOpen={() => setDrawerOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
