'use client';

import type { ReactNode } from 'react';

type SlotType = 'banner' | 'modal' | 'tooltip' | 'inline_card';

interface ProfileWireframeProps {
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

export default function ProfileWireframe({ slot, children }: ProfileWireframeProps) {
  return (
    <div className="w-full rounded-lg overflow-hidden border border-[color:var(--border)] bg-[color:var(--bg-surface)]">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--border)] bg-[color:var(--bg-elevated)]">
        <WireRect className="h-4 w-20" label="Logo" />
        <div className="flex gap-2">
          <WireRect className="h-4 w-12" />
          <WireRect className="h-4 w-16" />
        </div>
        <WireRect className="h-6 w-6 rounded-full" />
      </div>

      {/* Banner slot below nav */}
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

      {/* Profile header */}
      <div className="px-4 mt-3 flex gap-3 items-center">
        <WireRect className="h-12 w-12 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1">
          <WireRect className="h-4 w-32" />
          <WireRect className="h-3 w-20" />
        </div>
        <WireRect className="h-6 w-20 bg-amber-500/10" label="Gold" />
      </div>

      {/* Points balance section */}
      <div className="px-4 mt-4">
        <div className="relative rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3">
          <div className="mb-2">
            <WireRect className="h-3 w-24 mb-1" />
            <div className="flex items-baseline gap-1">
              <WireRect className="h-6 w-20" />
              <WireRect className="h-3 w-12" />
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-[color:var(--border)] rounded-full overflow-hidden">
            <div className="h-full w-3/5 bg-amber-500/60 rounded-full" />
          </div>
          <div className="flex justify-between mt-1">
            <WireRect className="h-2.5 w-16" />
            <WireRect className="h-2.5 w-20" />
          </div>
        </div>
      </div>

      {/* Inline card slot (Catalyst Elevate) */}
      {slot === 'inline_card' && (
        <div className="px-4 mt-3">
          <div className="relative">
            <div className="absolute -top-1.5 left-3 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
              inline_card
            </div>
            {children}
          </div>
        </div>
      )}

      {/* Profile completion bar */}
      <div className="px-4 mt-3">
        <div className="rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3">
          <div className="flex justify-between mb-1.5">
            <WireRect className="h-3 w-28" />
            <WireRect className="h-3 w-8" />
          </div>
          <div className="h-1.5 bg-[color:var(--border)] rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-indigo-500/50 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            {['Name', 'Phone', 'Pref.'].map((f) => (
              <WireRect key={f} className="h-5" label={f} />
            ))}
          </div>
        </div>
      </div>

      {/* Security section */}
      <div className="px-4 mt-3 pb-4">
        <WireRect className="h-3 w-24 mb-2" />
        <div className="rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3 space-y-1.5">
          {slot === 'banner' && null}
          <WireRect className="h-4 w-full" />
          <WireRect className="h-4 w-5/6" />
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
