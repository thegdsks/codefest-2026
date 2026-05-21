interface ActionPillProps {
  action: string;
}

const TONE: Record<string, string> = {
  ALLOW: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  BLOCK: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  HOLD: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  REVIEW: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  MFA: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  RELEASE: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  OFFER: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  NUDGE: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  HINT: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
};

const ACTION_LABEL: Record<string, string> = {
  ALLOW: 'Allowed',
  BLOCK: 'Blocked',
  MFA: 'MFA required',
  REVIEW: 'Review',
  OFFER: 'Offered',
  NUDGE: 'Nudged',
  HINT: 'Hinted',
};

const FALLBACK = 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]';

export default function ActionPill({ action }: ActionPillProps) {
  const tone = TONE[action] ?? FALLBACK;
  const label = ACTION_LABEL[action] ?? action;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
