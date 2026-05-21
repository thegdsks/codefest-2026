// Single-accent design tokens for admin chrome.
// Accent: indigo-500 (#6366F1) — matches Linear's restrained single-purple approach
// and Stripe's high-contrast pattern with one brand color, no gradient on chrome.
// Gradients are reserved for data emphasis (ProgressBar fill) only.

export const adminTheme = {
  accent: 'indigo-500',
  accentHover: 'indigo-400',
  accentRing: 'ring-indigo-400/70',
  accentText: 'text-indigo-300',
  accentBgSoft: 'bg-indigo-500/10',
  surface0: 'bg-zinc-950',
  surface1: 'bg-zinc-900/40',
  surface2: 'bg-zinc-900',
  border: 'border-zinc-800',
  textPrimary: 'text-zinc-100',
  textMuted: 'text-zinc-400',
  textDim: 'text-zinc-500',
} as const;

// Hex reference (for documentation only — use Tailwind classes above in JSX):
// accent hex:  #6366F1  (indigo-500)
// surface0 hex: #09090B (zinc-950)
// surface2 hex: #18181B (zinc-900)
