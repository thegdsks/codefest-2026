import type { ReactNode } from 'react';

interface KbdProps {
  children: ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-zinc-600 bg-zinc-800 px-1 font-mono text-[10px] text-zinc-300 shadow-sm">
      {children}
    </kbd>
  );
}
