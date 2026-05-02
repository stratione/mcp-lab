import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-fg': 'rgb(var(--primary-fg) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        err: 'rgb(var(--err) / <alpha-value>)',
        'tool-bg': 'rgb(var(--tool-bg) / <alpha-value>)',
        'tool-fg': 'rgb(var(--tool-fg) / <alpha-value>)',
        // shadcn-convention aliases — primitives like Button reference
        // `text-primary-foreground`, `bg-destructive`, etc. Without these the
        // classes resolve to undefined and fall back to inherited color (which
        // gave us a low-contrast Next button on the workshop dock).
        background: 'rgb(var(--bg) / <alpha-value>)',
        foreground: 'rgb(var(--text) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--primary-fg) / <alpha-value>)',
        secondary: 'rgb(var(--surface-2) / <alpha-value>)',
        'secondary-foreground': 'rgb(var(--text) / <alpha-value>)',
        destructive: 'rgb(var(--err) / <alpha-value>)',
        'destructive-foreground': 'rgb(255 255 255 / <alpha-value>)',
        accent: 'rgb(var(--surface-2) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--text) / <alpha-value>)',
        popover: 'rgb(var(--surface) / <alpha-value>)',
        'popover-foreground': 'rgb(var(--text) / <alpha-value>)',
        card: 'rgb(var(--surface) / <alpha-value>)',
        'card-foreground': 'rgb(var(--text) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted) / <alpha-value>)',
        input: 'rgb(var(--border) / <alpha-value>)',
        ring: 'rgb(var(--text) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['calc(11px * var(--ui-scale, 1))', { lineHeight: '1.5' }],
        sm: ['calc(13px * var(--ui-scale, 1))', { lineHeight: '1.5' }],
        base: ['calc(15px * var(--ui-scale, 1))', { lineHeight: '1.55' }],
        lg: ['calc(17px * var(--ui-scale, 1))', { lineHeight: '1.5' }],
        xl: ['calc(20px * var(--ui-scale, 1))', { lineHeight: '1.45' }],
      },
    },
  },
  plugins: [require('@tailwindcss/typography'), require('tailwindcss-animate')],
} satisfies Config
