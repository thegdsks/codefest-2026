import { Inter, JetBrains_Mono } from 'next/font/google';
import AdminProviders from './providers';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const interDisplay = Inter({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${interDisplay.variable} ${jetbrains.variable} font-sans`}>
      <AdminProviders>{children}</AdminProviders>
    </div>
  );
}
