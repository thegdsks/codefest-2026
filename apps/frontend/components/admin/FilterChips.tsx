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
    <fieldset className="m-0 border-0 p-0">
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
                  ? 'inline-flex items-center rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent-fg)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
                  : 'inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] motion-safe:transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
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
