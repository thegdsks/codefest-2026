'use client';

export type FeedFilter = 'all' | 'fraud' | 'engagement' | 'other';

interface FilterChipsProps {
  active: FeedFilter;
  onChange: (f: FeedFilter) => void;
}

const CHIPS: Array<{ value: FeedFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'other', label: 'Other' },
];

export default function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="sr-only">Decision type filter</legend>
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => {
          const isActive = chip.value === active;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onChange(chip.value)}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950'
                  : 'inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950'
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
