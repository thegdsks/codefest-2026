/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The customer (hotel) route group defines these CSS vars via next/font.
      // Outside that group (e.g. /admin) the vars are undefined, so the
      // fallback stacks match Tailwind's prior defaults and admin is unchanged.
      fontFamily: {
        sans: ['var(--font-montserrat)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'ui-serif', 'Georgia', 'serif'],
        display: ['var(--font-playfair)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
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
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};
