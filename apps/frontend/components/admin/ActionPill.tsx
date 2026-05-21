interface ActionPillProps {
  action: string;
}

const TONE: Record<string, string> = {
  ALLOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  BLOCK: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  HOLD: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  REVIEW: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  MFA: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  RELEASE: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  OFFER: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  NUDGE: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};

const FALLBACK = 'bg-zinc-800 text-zinc-300 border-zinc-700';

export default function ActionPill({ action }: ActionPillProps) {
  const tone = TONE[action] ?? FALLBACK;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {action}
    </span>
  );
}
