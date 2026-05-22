'use client';

import { X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { EngagementRule, RuleAction, SurfaceType } from '@/lib/rules-api';
import ProfileWireframe from './wireframes/ProfileWireframe';
import PropertyWireframe from './wireframes/PropertyWireframe';
import ResultsWireframe from './wireframes/ResultsWireframe';
import SearchWireframe from './wireframes/SearchWireframe';
import TransferWireframe from './wireframes/TransferWireframe';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CustomerPage = '/property' | '/results' | '/profile' | '/transfer' | '/search';
type WireframeSlot = 'banner' | 'modal' | 'tooltip' | 'inline_card';

// The surface types from the AI suggestion schema. The RuleAction.surface field
// uses a simplified set ('banner' | 'modal' | 'tooltip') - we map both here.
type EngagementSurface =
  | 'nudge_banner'
  | 'offer_modal'
  | 'help_tooltip'
  | 'inline_help_tooltip'
  | 'none'
  | SurfaceType;

interface RuleExperienceViewerProps {
  rule: EngagementRule | null;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Surface metadata
// ---------------------------------------------------------------------------

const PAGE_LABELS: Record<CustomerPage, string> = {
  '/property': 'Property',
  '/results': 'Results',
  '/profile': 'Profile',
  '/transfer': 'Transfer',
  '/search': 'Search',
};

const ALL_PAGES: CustomerPage[] = ['/property', '/results', '/profile', '/transfer', '/search'];

function surfaceToSlot(surface: EngagementSurface): WireframeSlot {
  if (surface === 'nudge_banner' || surface === 'banner') return 'banner';
  if (surface === 'offer_modal' || surface === 'modal') return 'modal';
  if (surface === 'help_tooltip' || surface === 'inline_help_tooltip' || surface === 'tooltip')
    return 'tooltip';
  return 'banner';
}

function defaultPageForSurface(surface: EngagementSurface): CustomerPage {
  if (surface === 'nudge_banner' || surface === 'banner') return '/property';
  if (surface === 'offer_modal' || surface === 'modal') return '/results';
  if (surface === 'help_tooltip' || surface === 'inline_help_tooltip' || surface === 'tooltip')
    return '/search';
  return '/property';
}

function surfaceLabel(surface: EngagementSurface): string {
  if (surface === 'nudge_banner' || surface === 'banner') return 'nudge_banner';
  if (surface === 'offer_modal' || surface === 'modal') return 'offer_modal';
  if (surface === 'help_tooltip') return 'help_tooltip';
  if (surface === 'inline_help_tooltip' || surface === 'tooltip') return 'inline_help_tooltip';
  return 'none';
}

function surfaceColorClass(surface: EngagementSurface): string {
  const label = surfaceLabel(surface);
  if (label === 'nudge_banner')
    return 'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]';
  if (label === 'offer_modal')
    return 'bg-[color:var(--accent-purple-bg)] text-[color:var(--accent-purple-fg)] border-[color:var(--accent-purple-border)]';
  if (label === 'help_tooltip' || label === 'inline_help_tooltip')
    return 'bg-[color:var(--info-bg)] text-[color:var(--info-fg)] border-[color:var(--info-border)]';
  return 'bg-[color:var(--bg-elevated)] text-[color:var(--text-muted)] border-[color:var(--border-strong)]';
}

function ruleToSurface(action: RuleAction | undefined): EngagementSurface {
  // Defensive: seeded rules use event.params.surface, the visual-editor shape
  // uses action.surface. Either path may be missing on partial drafts.
  return ((action?.surface as EngagementSurface | undefined) ?? 'none') as EngagementSurface;
}

// ---------------------------------------------------------------------------
// Trigger description builder
// ---------------------------------------------------------------------------

function buildTriggerDescription(rule: EngagementRule): string {
  // Two rule shapes coexist: the visual-editor shape with
  // whenConditions/whoConditions, and the seeded json-rules-engine shape
  // with conditions.all. Guard both so the viewer does not crash on either.
  const conditions = rule.whenConditions?.rules ?? [];
  const whoConditions = rule.whoConditions?.rules ?? [];

  const parts: string[] = [];

  // Who conditions
  const whoDescs: string[] = [];
  for (const c of whoConditions) {
    if ('field' in c) {
      if (c.field === 'tier') whoDescs.push(`${String(c.value)}-tier users`);
      else if (c.field === 'loyaltyScore')
        whoDescs.push(`users with ${String(c.value)}+ loyalty points`);
    }
  }
  if (whoDescs.length > 0) {
    parts.push(whoDescs.join(' and '));
  } else {
    parts.push('all users');
  }

  // When conditions
  const whenDescs: string[] = [];
  for (const c of conditions) {
    if ('field' in c) {
      if (c.field === 'dwellMs')
        whenDescs.push(`dwell on the page for >= ${Number(c.value) / 1000}s`);
      else if (c.field === 'signal') whenDescs.push(`trigger signal "${String(c.value)}"`);
      else if (c.field === 'eventType') whenDescs.push(`event type "${String(c.value)}"`);
      else whenDescs.push(`${c.field} ${c.operator} ${String(c.value)}`);
    }
  }

  const surface = surfaceLabel(ruleToSurface(rule.action));
  const slotText =
    surface === 'nudge_banner'
      ? 'a banner nudge'
      : surface === 'offer_modal'
        ? 'an offer modal'
        : surface === 'help_tooltip' || surface === 'inline_help_tooltip'
          ? 'a help tooltip'
          : 'a surface';

  if (whenDescs.length > 0) {
    return `This surface shows ${slotText} for ${parts[0]} when they ${whenDescs.join(' and ')}.`;
  }

  return `This surface shows ${slotText} for ${parts[0]}.`;
}

// ---------------------------------------------------------------------------
// Surface mock render
// ---------------------------------------------------------------------------

interface MockSurfaceProps {
  surface: EngagementSurface;
  copy: string;
}

function MockBanner({ copy }: { copy: string }) {
  return (
    <div className="w-full rounded border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-[color:var(--warning-fg)]" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[color:var(--warning-fg)] leading-snug">
            {copy || 'Nudge copy will appear here when the rule fires.'}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[color:var(--warning-fg)] opacity-70 hover:opacity-100 text-xs"
          aria-label="Dismiss"
        >
          x
        </button>
      </div>
    </div>
  );
}

function MockModal({ copy }: { copy: string }) {
  return (
    <div className="w-full rounded-lg border border-purple-500/30 bg-[color:var(--bg-elevated)] shadow-lg p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
          Exclusive Offer
        </span>
        <button
          type="button"
          className="text-[color:var(--text-dim)] hover:text-[color:var(--text)] text-xs"
          aria-label="Close"
        >
          x
        </button>
      </div>
      <p className="text-xs text-[color:var(--text-muted)] leading-relaxed">
        {copy || 'Offer copy will appear here when the rule fires.'}
      </p>
      <button
        type="button"
        className="mt-3 w-full rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
      >
        Claim offer
      </button>
    </div>
  );
}

function MockTooltip({ copy }: { copy: string }) {
  return (
    <div className="inline-block rounded-md border border-blue-500/30 bg-[color:var(--bg-elevated)] px-3 py-2 shadow-md max-w-[240px]">
      <p className="text-[11px] text-[color:var(--text-muted)] leading-snug">
        {copy || 'Tooltip hint will appear here when the rule fires.'}
      </p>
      <div className="mt-1.5 flex justify-end">
        <button type="button" className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">
          Got it
        </button>
      </div>
    </div>
  );
}

function MockSurface({ surface, copy }: MockSurfaceProps) {
  const slot = surfaceToSlot(surface);
  if (slot === 'banner') return <MockBanner copy={copy} />;
  if (slot === 'modal') return <MockModal copy={copy} />;
  return <MockTooltip copy={copy} />;
}

// ---------------------------------------------------------------------------
// Page wireframe selector
// ---------------------------------------------------------------------------

interface WireframeContainerProps {
  page: CustomerPage;
  slot: WireframeSlot;
  children: React.ReactNode;
}

function WireframeContainer({ page, slot, children }: WireframeContainerProps) {
  if (page === '/property') return <PropertyWireframe slot={slot}>{children}</PropertyWireframe>;
  if (page === '/profile') return <ProfileWireframe slot={slot}>{children}</ProfileWireframe>;
  if (page === '/results') return <ResultsWireframe slot={slot}>{children}</ResultsWireframe>;
  if (page === '/transfer') return <TransferWireframe slot={slot}>{children}</TransferWireframe>;
  return <SearchWireframe slot={slot}>{children}</SearchWireframe>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RuleExperienceViewer({ rule, open, onClose }: RuleExperienceViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const surface: EngagementSurface = rule ? ruleToSurface(rule.action) : 'none';
  const [activePage, setActivePage] = useState<CustomerPage>(defaultPageForSurface(surface));

  // Reset page when the rule (and thus surface) changes.
  useEffect(() => {
    if (rule) {
      setActivePage(defaultPageForSurface(ruleToSurface(rule.action)));
    }
  }, [rule]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Guard: action may be undefined on partially drafted rules saved before the
  // action field was required by the schema.
  const copy = rule?.action?.fallbackCopy ?? '';
  const slot: WireframeSlot = surface !== 'none' ? surfaceToSlot(surface) : 'banner';
  const triggerDescription = rule ? buildTriggerDescription(rule) : '';
  const colorClass = surfaceColorClass(surface);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Rule experience preview"
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[color:var(--border)] bg-[color:var(--bg)] transition-transform duration-300 ease-in-out sm:w-[600px] md:w-[680px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[color:var(--text)]">Experience preview</h2>
            {rule && (
              <p className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
                {rule.name}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="ml-4 shrink-0 rounded-md p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!rule ? (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-sm text-[color:var(--text-dim)]">No rule selected.</p>
            </div>
          ) : surface === 'none' ? (
            /* No-surface state */
            <div className="p-6">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-6 text-center">
                <p className="text-sm font-medium text-[color:var(--text)]">No visible surface</p>
                <p className="mt-1.5 text-xs text-[color:var(--text-dim)]">
                  This rule has no visual surface configured. It may fire a backend action (score
                  adjustment, MFA trigger, etc.) without showing anything to the customer.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Surface label + page tabs */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${colorClass}`}
                >
                  {surfaceLabel(surface)}
                </span>
                <div className="flex items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-1">
                  {ALL_PAGES.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setActivePage(page)}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                        activePage === page
                          ? 'bg-[color:var(--text)] text-[color:var(--bg)]'
                          : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
                      }`}
                    >
                      {PAGE_LABELS[page]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wireframe at ~60% scale */}
              <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
                <div className="origin-top-left scale-[0.62] w-[161%]">
                  <WireframeContainer page={activePage} slot={slot}>
                    <MockSurface surface={surface} copy={copy} />
                  </WireframeContainer>
                </div>
              </div>

              {/* Trigger description */}
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
                  When it fires
                </p>
                <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
                  {triggerDescription}
                </p>
              </div>

              {/* Copy preview */}
              {copy && (
                <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
                    Copy text
                  </p>
                  <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">{copy}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
