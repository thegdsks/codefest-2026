'use client';

import { CaretUpDown, Check, Gear, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useClickOutside } from '@/lib/use-click-outside';

interface Workspace {
  id: string;
  name: string;
  env: 'prod' | 'staging' | 'dev';
  initials: string;
}

const WORKSPACES: Workspace[] = [
  { id: 'sf-prod', name: 'Signal Force', env: 'prod', initials: 'SF' },
  { id: 'sf-staging', name: 'Signal Force', env: 'staging', initials: 'SF' },
  { id: 'sf-dev', name: 'Signal Force', env: 'dev', initials: 'SF' },
];

const ENV_STYLE: Record<Workspace['env'], string> = {
  prod: 'text-amber-300 bg-amber-400/10 ring-amber-400/20',
  staging: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/20',
  dev: 'text-[color:var(--text-muted)] bg-zinc-400/10 ring-zinc-400/20',
};

function EnvBadge({ env }: { env: Workspace['env'] }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${ENV_STYLE[env]}`}
    >
      {env}
    </span>
  );
}

export default function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState('sf-prod');
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const active = WORKSPACES.find((w) => w.id === activeId) ?? WORKSPACES[0];
  const filtered = WORKSPACES.filter((w) =>
    `${w.name} ${w.env}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all duration-200 ease-out hover:bg-[color:var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40"
      >
        <span
          aria-hidden="true"
          className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[color:var(--accent)] text-[11px] font-bold text-[color:var(--accent-fg)] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)]"
        >
          {active.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold leading-none text-[color:var(--text)]">
            {active.name}
          </span>
          <span className="flex items-center gap-1.5">
            <EnvBadge env={active.env} />
          </span>
        </span>
        <CaretUpDown
          size={14}
          className="shrink-0 text-[color:var(--text-dim)]"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="surface-popover absolute left-0 right-0 top-[calc(100%+6px)] z-50 origin-top-left animate-[menu-in_120ms_ease-out] overflow-hidden rounded-xl"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-2.5 py-2">
            <MagnifyingGlass
              size={13}
              className="shrink-0 text-[color:var(--text-dim)]"
              aria-hidden="true"
            />
            <input
              // biome-ignore lint/a11y/noAutofocus: focus on open is expected UX for search-in-dropdown
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspaces"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text)] placeholder:text-[color:var(--text-dim)] focus:outline-none"
            />
          </div>
          <div className="px-1.5 py-1.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
              Workspaces
            </div>
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-[12px] text-[color:var(--text-dim)]">No matches</div>
            )}
            {filtered.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setActiveId(w.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-[color:var(--text)] hover:bg-white/[0.05]"
              >
                <span
                  aria-hidden="true"
                  className="inline-grid h-5 w-5 shrink-0 place-items-center rounded bg-gradient-to-br from-violet-500 to-indigo-600 text-[9px] font-bold text-white"
                >
                  {w.initials}
                </span>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <EnvBadge env={w.env} />
                {w.id === activeId && (
                  <Check size={12} className="shrink-0 text-emerald-400" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-white/[0.06] px-1.5 py-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-[color:var(--text-muted)] hover:bg-white/[0.05]"
            >
              <Plus size={13} className="text-[color:var(--text-dim)]" aria-hidden="true" />
              <span>Create workspace</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-[color:var(--text-muted)] hover:bg-white/[0.05]"
            >
              <Gear size={13} className="text-[color:var(--text-dim)]" aria-hidden="true" />
              <span>Workspace settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
