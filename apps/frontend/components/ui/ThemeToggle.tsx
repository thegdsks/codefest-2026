'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

type ThemeOption = 'light' | 'dark' | 'system';

const OPTIONS: Array<{ value: ThemeOption; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-7 w-[152px] rounded-md bg-zinc-800 animate-pulse" />;
  }

  return (
    <fieldset
      aria-label="Theme"
      className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
          className={[
            'rounded px-3 py-1 text-xs font-medium transition-colors duration-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
            theme === opt.value ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </fieldset>
  );
}
