import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Signal Force',
    template: '%s | Signal Force',
  },
  description:
    'Fraud-aware loyalty platform. Real-time decisions with explainable AI fallback.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
  ),
  openGraph: {
    title: 'Signal Force',
    description:
      'Fraud-aware loyalty platform. Real-time decisions with explainable AI fallback.',
    images: ['/og-image.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Signal Force',
    description:
      'Fraud-aware loyalty platform. Real-time decisions with explainable AI fallback.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">{children}</body>
    </html>
  );
}
