import type { Metadata } from 'next';
import Nav from '@/components/nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Signal Force',
  description: 'Real-time decision intelligence platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-lg">Signal Force</span>
            <Nav />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
