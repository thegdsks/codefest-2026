import EngagementWrapper from '@/components/engagement-wrapper';
import Nav from '@/components/nav';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-lg">Signal Force</span>
          <Nav />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <EngagementWrapper>{children}</EngagementWrapper>
      </main>
    </div>
  );
}
