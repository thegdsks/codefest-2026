interface ProgressBarProps {
  value: number;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

const TONE: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  indigo: 'bg-gradient-to-r from-indigo-500 to-fuchsia-500',
  emerald: 'bg-emerald-500/70',
  amber: 'bg-amber-500/70',
  rose: 'bg-rose-500/70',
};

const WIDTHS = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
];

function widthClass(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const idx = Math.round(clamped / 5);
  return WIDTHS[idx];
}

export default function ProgressBar({ value, tone = 'indigo' }: ProgressBarProps) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded bg-zinc-800"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full ${widthClass(value)} ${TONE[tone]}`} />
    </div>
  );
}
