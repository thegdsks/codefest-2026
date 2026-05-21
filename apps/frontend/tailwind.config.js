/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Each route group defines these CSS vars via next/font. Customer maps
      // them to Montserrat/Playfair/JetBrains, admin maps them to Inter/Inter
      // (display weights)/JetBrains. Fallbacks cover the brief moment before
      // hydration and the case where a group hasn't loaded yet.
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': [
          '3rem',
          { lineHeight: '1.05', letterSpacing: '-0.022em', fontWeight: '700' },
        ],
        'display-lg': [
          '2.25rem',
          { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        'display-md': [
          '1.75rem',
          { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '600' },
        ],
        'display-sm': [
          '1.375rem',
          { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        kpi: [
          '2rem',
          {
            lineHeight: '1',
            letterSpacing: '-0.025em',
            fontWeight: '600',
            fontVariantNumeric: 'tabular-nums',
          },
        ],
      },
      spacing: {
        // Values the Tailwind v4 prototype generated dynamically but absent
        // from the v3 default scale.
        4.5: '1.125rem',
        30: '7.5rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'surface-slide-in': {
          from: { opacity: '0', transform: 'translateX(1rem)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'surface-slide-in': 'surface-slide-in 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
