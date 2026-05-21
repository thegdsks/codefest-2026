import Sidebar from '@/components/admin/Sidebar';
import TopBar from '@/components/admin/TopBar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex bg-zinc-950 text-zinc-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
