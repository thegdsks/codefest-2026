import { JetBrains_Mono, Montserrat, Playfair_Display } from 'next/font/google';
import EngagementWrapper from '@/components/engagement-wrapper';
import { CustomerProvider } from '@/components/hotel/CustomerProvider';
import DemoPanel from '@/components/hotel/DemoPanel';
import Footer from '@/components/hotel/Footer';
import Header from '@/components/hotel/Header';
import SurfaceBubbleHost from '@/components/hotel/SurfaceBubbleHost';
import CustomerErrorBoundary from '@/components/ui/CustomerErrorBoundary';
import { QueryProvider } from '@/lib/query-client';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const playfairSerif = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${playfair.variable} ${playfairSerif.variable} ${jetbrains.variable} font-sans bg-[#fbf9f8] text-black selection:bg-[#ffdea5] selection:text-[#261900]`}
    >
      <QueryProvider>
        <CustomerProvider>
          <EngagementWrapper>
            <div className="flex flex-col min-h-screen">
              <Header />
              <div className="flex-grow transition-all duration-300">
                <CustomerErrorBoundary>{children}</CustomerErrorBoundary>
              </div>
              <Footer />
            </div>
          </EngagementWrapper>
          <DemoPanel />
          <SurfaceBubbleHost />
        </CustomerProvider>
      </QueryProvider>
    </div>
  );
}
