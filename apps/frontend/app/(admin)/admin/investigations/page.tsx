'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowsClockwise, ShieldCheck, Warning } from '@phosphor-icons/react';
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import BulkActionBar from '@/components/admin/investigations/BulkActionBar';
import Column from '@/components/admin/investigations/Column';
import InvestigationsFilters from '@/components/admin/investigations/InvestigationsFilters';
import {
  type Case,
  type CaseStatus,
  deriveStatus,
  type FilterState,
  ME,
  pickAssignee,
  STATUS_ORDER,
  scoreBand,
  slaMinutes,
} from '@/components/admin/investigations/types';
import Skeleton from '@/components/admin/Skeleton';
import { type DecisionRow, getDecisions } from '@/lib/admin-api';
import type { ApiErrorDetail } from '@/lib/types';

function KpiPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Warning;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2">
      <Icon size={16} className={tone} aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-[18px] font-semibold leading-none tabular-nums text-[color:var(--text)]">
          {value}
        </span>
        <span className="mt-1 text-[10.5px] uppercase tracking-wider text-[color:var(--text-dim)]">
          {label}
        </span>
      </div>
    </div>
  );
}

function emptyFilters(): FilterState {
  return {
    decisionTypes: new Set<string>(),
    scoreBands: new Set(),
    assignees: new Set<string>(),
    quick: null,
  };
}

export default function InvestigationsPage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<ApiErrorDetail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const lastSelectedRef = useRef<{ id: string; status: CaseStatus } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void refreshKey;
    (async () => {
      const res = await getDecisions({ window: '24h', limit: 60 });
      if (cancelled) return;
      if (res.error !== null) {
        setError(res.error);
        return;
      }
      if (res.data === null) return;
      const items: Case[] = res.data.decisions.map((d: DecisionRow) => ({
        ...d,
        status: deriveStatus(d),
        assignee: pickAssignee(d.userId),
        slaMinutes: slaMinutes(d.timestamp),
      }));
      setCases(items);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const decisionTypes = useMemo(() => {
    if (!cases) return [];
    const s = new Set<string>();
    for (const c of cases) s.add(c.decisionType);
    return [...s].sort();
  }, [cases]);

  const assignees = useMemo(() => {
    if (!cases) return [];
    const s = new Set<string>();
    for (const c of cases) if (c.assignee) s.add(c.assignee);
    return [...s].sort();
  }, [cases]);

  const filtered = useMemo(() => {
    if (!cases) return null;
    return cases.filter((c) => {
      if (filters.decisionTypes.size > 0 && !filters.decisionTypes.has(c.decisionType)) {
        return false;
      }
      if (filters.scoreBands.size > 0 && !filters.scoreBands.has(scoreBand(c.score))) {
        return false;
      }
      if (filters.assignees.size > 0) {
        if (!c.assignee || !filters.assignees.has(c.assignee)) return false;
      }
      if (filters.quick === 'my-open') {
        if (c.assignee !== ME || c.status !== 'open') return false;
      } else if (filters.quick === 'stale') {
        if (c.slaMinutes >= 10 || c.status === 'closed') return false;
      } else if (filters.quick === 'block-only') {
        if ((c.action || '').toUpperCase() !== 'BLOCK') return false;
      }
      return true;
    });
  }, [cases, filters]);

  const grouped = useMemo(() => {
    const buckets: Record<CaseStatus, Case[]> = {
      open: [],
      reviewing: [],
      action: [],
      closed: [],
    };
    if (filtered) for (const c of filtered) buckets[c.status].push(c);
    return buckets;
  }, [filtered]);

  const onAdvance = (id: string) => {
    setCases((prev) => {
      if (!prev) return prev;
      return prev.map((c) => {
        if (c.decisionId !== id) return c;
        const idx = STATUS_ORDER.indexOf(c.status);
        const next = STATUS_ORDER[Math.min(idx + 1, STATUS_ORDER.length - 1)];
        return { ...c, status: next };
      });
    });
  };

  const onSelect = (id: string, e: ReactMouseEvent) => {
    const target = cases?.find((c) => c.decisionId === id);
    if (!target) return;
    const status = target.status;

    setSelected((prev) => {
      const next = new Set(prev);

      // Shift-click: range select within the same column
      if (e.shiftKey && lastSelectedRef.current && lastSelectedRef.current.status === status) {
        const list = (filtered ?? cases ?? []).filter((c) => c.status === status);
        const a = list.findIndex((c) => c.decisionId === lastSelectedRef.current?.id);
        const b = list.findIndex((c) => c.decisionId === id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) {
            const item = list[i];
            if (item) next.add(item.decisionId);
          }
          return next;
        }
      }

      // Cmd/Ctrl-click: toggle this one
      if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastSelectedRef.current = { id, status };
        return next;
      }

      // Plain click: toggle (single-card workflow)
      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastSelectedRef.current = { id, status };
      return next;
    });
  };

  const onToggleType = (t: string) =>
    setFilters((f) => {
      const ds = new Set(f.decisionTypes);
      if (ds.has(t)) ds.delete(t);
      else ds.add(t);
      return { ...f, decisionTypes: ds };
    });
  const onToggleScore = (b: FilterState['scoreBands'] extends Set<infer T> ? T : never) =>
    setFilters((f) => {
      const s = new Set(f.scoreBands);
      if (s.has(b)) s.delete(b);
      else s.add(b);
      return { ...f, scoreBands: s };
    });
  const onToggleAssignee = (a: string) =>
    setFilters((f) => {
      const s = new Set(f.assignees);
      if (s.has(a)) s.delete(a);
      else s.add(a);
      return { ...f, assignees: s };
    });
  const onSetQuick = (q: FilterState['quick']) => setFilters((f) => ({ ...f, quick: q }));
  const onClearFilters = () => setFilters(emptyFilters());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function moveCases(ids: string[], to: CaseStatus) {
    setCases((prev) => {
      if (!prev) return prev;
      return prev.map((c) => (ids.includes(c.decisionId) ? { ...c, status: to } : c));
    });
  }

  const onDragStart = (e: DragStartEvent) => {
    // If user drags a non-selected card, treat that single card as the operation target.
    const id = String(e.active.id);
    if (!selected.has(id)) {
      setSelected(new Set([id]));
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overData = over.data.current as { type?: string; status?: CaseStatus } | undefined;
    const activeData = active.data.current as { status?: CaseStatus } | undefined;

    let target: CaseStatus | null = null;
    if (overData?.type === 'column' && overData.status) {
      target = overData.status;
    } else if (overData?.type === 'case') {
      target = (overData as { status?: CaseStatus }).status ?? null;
    }
    if (!target) return;
    if (target === activeData?.status) return;

    const ids = selected.size > 0 ? [...selected] : [String(active.id)];
    moveCases(ids, target);
    console.log('[investigations] drag move', { ids, to: target });
    setSelected(new Set());
  };

  if (error) return <AuthGate error={error} onRetry={() => setRefreshKey((k) => k + 1)} />;

  const totalOpen = grouped.open.length + grouped.reviewing.length + grouped.action.length;
  const highRisk = (filtered ?? []).filter((c) => c.score >= 70 && c.status !== 'closed').length;
  const slaBreach = (filtered ?? []).filter(
    (c) => c.slaMinutes <= 15 && c.status !== 'closed'
  ).length;

  const ids = [...selected];
  const onAssignToMe = () => {
    setCases((prev) =>
      prev ? prev.map((c) => (selected.has(c.decisionId) ? { ...c, assignee: ME } : c)) : prev
    );
    console.log('[investigations] bulk assign to me', { ids });
    setSelected(new Set());
  };
  const onMarkReviewing = () => {
    moveCases(ids, 'reviewing');
    console.log('[investigations] bulk mark reviewing', { ids });
    setSelected(new Set());
  };
  const onMarkClosed = () => {
    moveCases(ids, 'closed');
    console.log('[investigations] bulk mark closed', { ids });
    setSelected(new Set());
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[color:var(--text)]">
            Investigations
          </h1>
          <p className="mt-1 text-[12.5px] text-[color:var(--text-dim)]">
            Active fraud cases from the last 24h. Drag cards between columns, or select multiple
            with shift / cmd-click for bulk actions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-2.5 py-1.5 text-[12px] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/70"
        >
          <ArrowsClockwise size={12} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <KpiPill
          icon={Warning}
          label="Active cases"
          value={String(totalOpen)}
          tone="text-amber-300"
        />
        <KpiPill
          icon={Warning}
          label="High risk (>=70)"
          value={String(highRisk)}
          tone="text-rose-300"
        />
        <KpiPill
          icon={ShieldCheck}
          label="SLA at risk"
          value={String(slaBreach)}
          tone="text-indigo-300"
        />
      </div>

      <InvestigationsFilters
        decisionTypes={decisionTypes}
        assignees={assignees}
        filters={filters}
        onToggleType={onToggleType}
        onToggleScore={onToggleScore}
        onToggleAssignee={onToggleAssignee}
        onSetQuick={onSetQuick}
        onClearAll={onClearFilters}
      />

      {cases === null ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_ORDER.map((s) => (
            <div
              key={s}
              className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-3"
            >
              <Skeleton className="mb-3 h-4 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STATUS_ORDER.map((s) => (
              <Column
                key={s}
                status={s}
                cases={grouped[s]}
                selected={selected}
                onSelect={onSelect}
                onAdvance={onAdvance}
              />
            ))}
          </div>
        </DndContext>
      )}

      <BulkActionBar
        count={selected.size}
        onAssignToMe={onAssignToMe}
        onMarkReviewing={onMarkReviewing}
        onMarkClosed={onMarkClosed}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}
