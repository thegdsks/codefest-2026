interface ActionPillProps {
  action: string;
}

const TONE: Record<string, string> = {
  ALLOW:
    'bg-[color:var(--success-bg)] text-[color:var(--success-fg)] border-[color:var(--success-border)]',
  BLOCK:
    'bg-[color:var(--danger-bg)] text-[color:var(--danger-fg)] border-[color:var(--danger-border)]',
  HOLD: 'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]',
  REVIEW: 'bg-[color:var(--info-bg)] text-[color:var(--info-fg)] border-[color:var(--info-border)]',
  MFA: 'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]',
  RELEASE:
    'bg-[color:var(--accent-sky-bg)] text-[color:var(--accent-sky-fg)] border-[color:var(--accent-sky-border)]',
  OFFER:
    'bg-[color:var(--success-bg)] text-[color:var(--success-fg)] border-[color:var(--success-border)]',
  NUDGE:
    'bg-[color:var(--accent-violet-bg)] text-[color:var(--accent-violet-fg)] border-[color:var(--accent-violet-border)]',
  HINT: 'bg-[color:var(--info-bg)] text-[color:var(--info-fg)] border-[color:var(--info-border)]',
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
      className={`flex flex-col items-center justify-center text-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
