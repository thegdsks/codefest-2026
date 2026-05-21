'use client';

import type { ReactNode } from 'react';

type SlotType = 'banner' | 'modal' | 'tooltip' | 'inline_card';

interface ResultsWireframeProps {
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

function ResultCard() {
  return (
    <div className="rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-2.5 flex gap-2">
      <WireRect className="h-14 w-20 shrink-0 rounded-sm" label="Img" />
      <div className="flex-1 space-y-1.5">
        <WireRect className="h-3 w-32" />
        <WireRect className="h-2.5 w-20" />
        <div className="flex gap-1">
          <WireRect className="h-2.5 w-10" />
          <WireRect className="h-2.5 w-10" />
        </div>
      </div>
      <div className="shrink-0 space-y-1.5">
        <WireRect className="h-4 w-12" />
        <WireRect className="h-5 w-16 bg-indigo-500/20" label="View" />
      </div>
    </div>
  );
}

export default function ResultsWireframe({ slot, children }: ResultsWireframeProps) {
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

      {/* Search bar */}
      <div className="px-4 mt-3 flex gap-2">
        <WireRect className="h-8 flex-1" label="Search destination..." />
        <WireRect className="h-8 w-8" />
        <WireRect className="h-8 w-14 bg-indigo-500/20" label="Search" />
      </div>

      {/* Filter chips */}
      <div className="px-4 mt-2 flex gap-1.5 overflow-hidden">
        {['Dates', 'Guests', 'Price', 'Star rating', 'Amenities'].map((f) => (
          <WireRect key={f} className="h-6 w-16 shrink-0" label={f} />
        ))}
      </div>

      {/* Results count */}
      <div className="px-4 mt-3 mb-2">
        <WireRect className="h-3 w-24" />
      </div>

      {/* Modal slot - shown above results */}
      {slot === 'modal' && (
        <div className="px-4 mb-3">
          <div className="relative">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
              offer_modal
            </div>
            {children}
          </div>
        </div>
      )}

      {/* Result cards */}
      <div className="px-4 pb-4 space-y-2">
        <ResultCard />
        <ResultCard />
        <ResultCard />
      </div>

      {/* Tooltip slot */}
      {slot === 'tooltip' && (
        <div className="px-4 pb-3">
          <div className="relative inline-block">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
              help_tooltip
            </div>
            {children}
          </div>
        </div>
      )}

      {/* Inline card slot */}
      {slot === 'inline_card' && (
        <div className="px-4 pb-3">
          <div className="relative">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
              inline_card
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
