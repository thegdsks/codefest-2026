'use client';

import type { ReactNode } from 'react';

type SlotType = 'banner' | 'modal' | 'tooltip' | 'inline_card';

interface TransferWireframeProps {
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

function FormField({ label }: { label: string }) {
  return (
    <div className="space-y-1">
      <WireRect className="h-2.5 w-20" label={label} />
      <WireRect className="h-8 w-full" />
    </div>
  );
}

export default function TransferWireframe({ slot, children }: TransferWireframeProps) {
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

      {/* Page title */}
      <div className="px-4 mt-3 space-y-1">
        <WireRect className="h-5 w-32" />
        <WireRect className="h-3 w-56" />
      </div>

      {/* Balance row */}
      <div className="px-4 mt-3 flex gap-2">
        <div className="flex-1 rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-2 text-center">
          <WireRect className="h-3 w-20 mx-auto mb-1" label="Your balance" />
          <WireRect className="h-5 w-24 mx-auto bg-amber-500/10" label="12,400 pts" />
        </div>
        <div className="flex items-center">
          <WireRect className="h-6 w-6" label=">" />
        </div>
        <div className="flex-1 rounded border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-2 text-center">
          <WireRect className="h-3 w-20 mx-auto mb-1" label="Recipient" />
          <WireRect className="h-5 w-24 mx-auto" />
        </div>
      </div>

      {/* Modal slot */}
      {slot === 'modal' && (
        <div className="px-4 mt-3">
          <div className="relative">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
              offer_modal
            </div>
            {children}
          </div>
        </div>
      )}

      {/* Transfer form */}
      <div className="px-4 mt-3 pb-4 space-y-3">
        <FormField label="Recipient email" />
        <FormField label="Amount (points)" />
        <FormField label="Reason (optional)" />

        {/* Inline card slot */}
        {slot === 'inline_card' && (
          <div className="relative">
            <div className="absolute -top-1.5 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
              inline_card
            </div>
            {children}
          </div>
        )}

        <WireRect className="h-9 w-full bg-indigo-500/20" label="Transfer Points" />
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
    </div>
  );
}
