import { JetBrains_Mono, Montserrat, Playfair_Display } from 'next/font/google';
import EngagementWrapper from '@/components/engagement-wrapper';
import { CustomerProvider } from '@/components/hotel/CustomerProvider';
import Footer from '@/components/hotel/Footer';
import Header from '@/components/hotel/Header';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${playfair.variable} ${jetbrains.variable} font-sans bg-[#fbf9f8] text-black selection:bg-[#ffdea5] selection:text-[#261900]`}
    >
      <CustomerProvider>
        <EngagementWrapper>
          <div className="flex flex-col min-h-screen">
            <Header />
            <div className="flex-grow transition-all duration-300">{children}</div>
            <Footer />
          </div>
        </EngagementWrapper>
      </CustomerProvider>
    </div>
  );
}
