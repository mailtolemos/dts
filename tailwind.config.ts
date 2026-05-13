import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:        '#0a0d12',
        panel:     '#101521',
        panel2:    '#161c2c',
        border:    '#222a3a',
        muted:     '#7c8aa3',
        text:      '#e6ecf5',
        accent:    '#5cf3a1',
        accent2:   '#7aa2ff',
        bull:      '#34d399',
        bear:      '#f87171',
        warn:      '#fbbf24',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 12px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
