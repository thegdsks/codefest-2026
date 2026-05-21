'use client';

import {
  ArrowRight,
  ChartLine,
  Gear,
  type Icon,
  KeyReturn,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  Users,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type CommandGroup = 'Navigate' | 'Actions' | 'Filters';

interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  hint?: string;
  icon: Icon;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetWindow?: (window: '1h' | '24h' | '7d') => void;
  onTailLatest?: () => void;
}

function matchScore(query: string, item: CommandItem): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const haystack = `${item.label} ${item.hint ?? ''} ${item.group}`.toLowerCase();
  if (haystack.startsWith(q)) return 3;
  if (haystack.includes(q)) return 2;
  return 0;
}

export default function CommandPalette({
  open,
  onOpenChange,
  onSetWindow,
  onTailLatest,
}: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const items: CommandItem[] = useMemo(() => {
    const nav: CommandItem[] = [
      {
        id: 'nav.dashboard',
        group: 'Navigate',
        label: 'Go to Overview',
        hint: 'Live metrics and engine health',
        icon: SquaresFour,
        shortcut: 'G D',
        run: () => router.push('/admin'),
      },
      {
        id: 'nav.decisions',
        group: 'Navigate',
        label: 'Go to Decision feed',
        hint: 'Stream of engine outcomes',
        icon: ChartLine,
        shortcut: 'G C',
        run: () => router.push('/admin/decisions'),
      },
      {
        id: 'nav.users',
        group: 'Navigate',
        label: 'Go to Users',
        hint: 'Loyalty and profile completion',
        icon: Users,
        shortcut: 'G U',
        run: () => router.push('/admin/users'),
      },
      {
        id: 'nav.sessions',
        group: 'Navigate',
        label: 'Go to Auth sessions',
        hint: 'Active auth sessions',
        icon: ShieldCheck,
        shortcut: 'G S',
        run: () => router.push('/admin/sessions'),
      },
      {
        id: 'nav.settings',
        group: 'Navigate',
        label: 'Go to Configuration',
        icon: Gear,
        shortcut: 'G ,',
        run: () => router.push('/admin/settings'),
      },
    ];

    const actions: CommandItem[] = [
      {
        id: 'action.tail',
        group: 'Actions',
        label: 'Tail latest decisions',
        hint: 'Auto-scroll to newest rows',
        icon: Sparkle,
        run: () => {
          onTailLatest?.();
          router.push('/admin/decisions');
        },
      },
    ];

    const filters: CommandItem[] = onSetWindow
      ? [
          {
            id: 'filter.1h',
            group: 'Filters',
            label: 'Set window: last 1 hour',
            icon: ChartLine,
            run: () => onSetWindow('1h'),
          },
          {
            id: 'filter.24h',
            group: 'Filters',
            label: 'Set window: last 24 hours',
            icon: ChartLine,
            run: () => onSetWindow('24h'),
          },
          {
            id: 'filter.7d',
            group: 'Filters',
            label: 'Set window: last 7 days',
            icon: ChartLine,
            run: () => onSetWindow('7d'),
          },
        ]
      : [];

    return [...nav, ...actions, ...filters];
  }, [router, onSetWindow, onTailLatest]);

  const filtered = useMemo(() => {
    return items
      .map((item) => ({ item, score: matchScore(query, item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [items, query]);

  const grouped = useMemo(() => {
    const order: CommandGroup[] = ['Navigate', 'Actions', 'Filters'];
    const map = new Map<CommandGroup, CommandItem[]>();
    for (const group of order) map.set(group, []);
    for (const item of filtered) {
      map.get(item.group)?.push(item);
    }
    return order
      .map((group) => ({ group, list: map.get(group) ?? [] }))
      .filter((block) => block.list.length > 0);
  }, [filtered]);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setActiveIndex(0);
  }, [onOpenChange]);

  const runActive = useCallback(() => {
    const item = filtered[activeIndex];
    if (!item) return;
    item.run();
    close();
  }, [filtered, activeIndex, close]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((idx) => Math.min(idx + 1, filtered.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((idx) => Math.max(idx - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        runActive();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered.length, runActive, close]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset index whenever query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24 sm:pt-32"
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={close}
        className="absolute inset-0 cursor-default bg-zinc-950/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950 shadow-2xl shadow-indigo-500/10 ring-1 ring-white/5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-indigo-500/30" />
        <div className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2.5">
          <MagnifyingGlass size={16} className="text-zinc-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, filter, or action"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="hidden rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline-flex">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              No matches for &quot;{query}&quot;
            </div>
          ) : (
            grouped.map((block) => (
              <div key={block.group} className="mb-2 last:mb-0">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {block.group}
                </div>
                <div role="listbox">
                  {block.list.map((item) => {
                    flatIndex += 1;
                    const isActive = flatIndex === activeIndex;
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => {
                            item.run();
                            close();
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? 'bg-indigo-500/10 text-zinc-100 ring-1 ring-inset ring-indigo-400/30'
                              : 'text-zinc-300 hover:bg-zinc-900'
                          }`}
                        >
                          <span
                            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                              isActive
                                ? 'bg-indigo-500/20 text-indigo-200'
                                : 'bg-zinc-900 text-zinc-400'
                            }`}
                          >
                            <Icon size={14} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{item.label}</span>
                            {item.hint ? (
                              <span className="truncate text-xs text-zinc-500">{item.hint}</span>
                            ) : null}
                          </span>
                          {item.shortcut ? (
                            <span className="hidden items-center gap-1 text-[10px] text-zinc-500 sm:inline-flex">
                              {item.shortcut.split(' ').map((key) => (
                                <kbd
                                  key={key}
                                  className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-medium"
                                >
                                  {key}
                                </kbd>
                              ))}
                            </span>
                          ) : null}
                          {isActive ? (
                            <ArrowRight size={14} className="text-indigo-300" aria-hidden="true" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-950/80 px-3 py-2 text-[10px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-medium">
              <KeyReturn size={9} />
            </kbd>
            to run
          </span>
          <span className="inline-flex items-center gap-2">
            <span>
              <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-medium">
                up
              </kbd>{' '}
              <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-medium">
                down
              </kbd>{' '}
              to navigate
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
