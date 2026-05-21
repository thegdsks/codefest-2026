'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query-client';

export default function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="sf-admin-theme"
    >
      <QueryProvider>{children}</QueryProvider>
    </NextThemesProvider>
  );
}
