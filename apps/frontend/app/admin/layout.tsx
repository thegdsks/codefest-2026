'use client';

import { useEffect, useState } from 'react';
import CommandPalette from '@/components/admin/CommandPalette';
import SidebarV2 from '@/components/admin/SidebarV2';
import TopBarV2 from '@/components/admin/TopBarV2';
import { QueryProvider } from '@/lib/query-client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

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
      <div className="fixed inset-0 z-30 flex bg-zinc-950 text-zinc-100">
        <SidebarV2 />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBarV2 onCmdK={() => setPaletteOpen(true)} />
          <main className="flex-1 overflow-auto px-6 py-6">{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </QueryProvider>
  );
}
