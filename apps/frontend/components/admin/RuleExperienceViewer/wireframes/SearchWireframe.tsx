'use client';

import type { ReactNode } from 'react';

type SlotType = 'banner' | 'modal' | 'tooltip' | 'inline_card';

interface SearchWireframeProps {
  slot: SlotType;
  children: ReactNode;
}

function WireRect({ className, label }: { className: string; label?: string }) {
  return (
    <div
      className={`rounded bg-[color:var(--bg-elevated)] border border-[color:var(--border)] flex items-center justify-center ${className}`}
    >
      {label && (
        <span className="text-[9px] uppercase tracking-widest text-[color:var(--text-dim)] select-none font-medium">
          {label}
        </span>
      )}
    </div>
  );
}

export default function SearchWireframe({ slot, children }: SearchWireframeProps) {
  return (
    <div className="w-full rounded-lg overflow-hidden border border-[color:var(--border)] bg-[color:var(--bg-surface)]">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
        <WireRect className="h-4 w-20" label="Logo" />
        <div className="flex gap-2">
          <WireRect className="h-4 w-12" />
          <WireRect className="h-4 w-12" />
        </div>
        <WireRect className="h-6 w-6 rounded-full" />
      </div>

      {/* Banner slot */}
      {slot === 'banner' && (
        <div className="px-4 pt-3">
          <div className="relative">
            <div className="absolute -top-1.5 left-3 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
              nudge_banner
            </div>
            {children}
          </div>
        </div>
      )}

      {/* Hero search area */}
      <div className="px-4 mt-3 py-4 bg-[color:var(--bg-elevated)] border-b border-[color:var(--border)]">
        <WireRect className="h-3 w-36 mb-2" />
        <div className="flex gap-2">
          <WireRect className="h-10 flex-1" label="Where are you going?" />
          <WireRect className="h-10 w-24" label="Check-in" />
          <WireRect className="h-10 w-24" label="Check-out" />
          <WireRect className="h-10 w-8" label="1" />
          <WireRect className="h-10 w-16 bg-indigo-500/20" label="Search" />
        </div>
      </div>

      {/* Tooltip slot - near search bar */}
      {slot === 'tooltip' && (
        <div className="px-4 pt-3">
          <div className="relative inline-block">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
              help_tooltip
            </div>
            {children}
          </div>
        </div>
      )}

      {/* Filters sidebar + suggestions */}
      <div className="px-4 mt-3 pb-4 flex gap-3">
        {/* Filters */}
        <div className="w-28 shrink-0 space-y-2">
          <WireRect className="h-3 w-16 mb-1" label="Filters" />
          {['Price', 'Stars', 'Amenities', 'Brand', 'Distance'].map((f) => (
            <div key={f} className="space-y-1">
              <WireRect className="h-2.5 w-14" label={f} />
              <WireRect className="h-5 w-full" />
            </div>
          ))}
        </div>

        {/* Suggestions */}
        <div className="flex-1 space-y-2">
          <WireRect className="h-3 w-28 mb-1" label="Popular destinations" />
          <div className="grid grid-cols-2 gap-2">
            {['Paris', 'Tokyo', 'Dubai', 'NYC'].map((d) => (
              <WireRect key={d} className="h-14" label={d} />
            ))}
          </div>

          {slot === 'modal' && (
            <div className="relative mt-2">
              <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                offer_modal
              </div>
              {children}
            </div>
          )}

          {slot === 'inline_card' && (
            <div className="relative mt-2">
              <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                inline_card
              </div>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
