'use client';

import type { ReactNode } from 'react';

type SlotType = 'banner' | 'modal' | 'tooltip' | 'inline_card';

interface PropertyWireframeProps {
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

export default function PropertyWireframe({ slot, children }: PropertyWireframeProps) {
  return (
    <div className="w-full rounded-lg overflow-hidden border border-[color:var(--border)] bg-[color:var(--bg-surface)] text-[color:var(--text)]">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
        <WireRect className="h-4 w-20" label="Logo" />
        <div className="flex gap-2">
          <WireRect className="h-4 w-12" />
          <WireRect className="h-4 w-12" />
          <WireRect className="h-4 w-12" />
        </div>
        <WireRect className="h-6 w-6 rounded-full" />
      </div>

      {/* Nudge banner slot - appears below nav */}
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

      {/* Hero image */}
      <WireRect className="mx-4 mt-3 h-28 rounded-md" label="Hero Image" />

      {/* Property info */}
      <div className="px-4 mt-3 space-y-1.5">
        <WireRect className="h-4 w-48" />
        <WireRect className="h-3 w-64" />
        <div className="flex gap-2 mt-1">
          <WireRect className="h-3 w-16" />
          <WireRect className="h-3 w-16" />
          <WireRect className="h-3 w-16" />
        </div>
      </div>

      {/* Two-column: content + booking card */}
      <div className="px-4 mt-4 pb-4 flex gap-3">
        {/* Left: description + amenities */}
        <div className="flex-1 space-y-2">
          <WireRect className="h-3 w-full" />
          <WireRect className="h-3 w-5/6" />
          <WireRect className="h-3 w-4/5" />
          <WireRect className="h-3 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {['Spa', 'Pool', 'Dining', 'Gym'].map((a) => (
              <WireRect key={a} className="h-7" label={a} />
            ))}
          </div>
        </div>

        {/* Right: booking card */}
        <div className="w-36 shrink-0">
          {slot === 'inline_card' && (
            <div className="relative mb-2">
              <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                inline_card
              </div>
              {children}
            </div>
          )}
          {slot !== 'inline_card' && (
            <div className="rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-2 space-y-2">
              <WireRect className="h-6 w-full" label="Price" />
              <WireRect className="h-5 w-full" />
              <WireRect className="h-5 w-full" />
              <WireRect className="h-7 w-full bg-indigo-500/20" label="Book" />
            </div>
          )}
          {slot === 'inline_card' && (
            <div className="rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-2 space-y-2">
              <WireRect className="h-6 w-full" label="Price" />
              <WireRect className="h-5 w-full" />
              <WireRect className="h-7 w-full bg-indigo-500/20" label="Book" />
            </div>
          )}
        </div>
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

      {/* Modal overlay */}
      {slot === 'modal' && (
        <div className="px-4 pb-3">
          <div className="relative">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
              offer_modal
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
