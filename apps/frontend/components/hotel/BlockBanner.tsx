'use client';

import { ShieldAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface BlockBannerAction {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'secondary';
}

interface BlockBannerProps {
  title: string;
  description: string;
  referenceId?: string;
  actions: BlockBannerAction[];
}

export default function BlockBanner({
  title,
  description,
  referenceId,
  actions,
}: BlockBannerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-l-4 border-l-rose-700 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <ShieldAlert size={24} className="text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-2xl text-black font-light leading-tight mb-2 focus:outline-none"
          >
            {title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-1">{description}</p>
          {referenceId && (
            <p className="text-xs text-gray-400 font-mono mt-1">
              Reference: <span className="select-all">{referenceId}</span>
            </p>
          )}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-5">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={
                    action.variant === 'primary'
                      ? 'bg-rose-700 hover:bg-rose-800 text-white px-5 py-2.5 text-xs font-bold uppercase tracking-widest font-sans transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2'
                      : 'border border-gray-300 hover:border-gray-500 text-gray-700 px-5 py-2.5 text-xs font-bold uppercase tracking-widest font-sans transition-colors bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2'
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
