import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
  			// OB-201: theme font tokens (current = DM Sans/Mono; bliss = Urbanist/Inter/DM Mono)
  			display: ['var(--font-display)', 'system-ui', 'sans-serif'],
  			body: ['var(--font-body)', 'system-ui', 'sans-serif'],
  			mono: ['var(--font-mono)', 'monospace'],
  		},
  		colors: {
  			// HF-305: theme-aware neutral scales. Each step reads a CSS var whose FALLBACK is the
  			// exact original Tailwind hex (as an RGB triplet) — so at data-theme="current" (var
  			// unset) every bg-/text-/border-{slate,zinc,gray}-N renders byte-for-byte identical to
  			// today, incl. opacity modifiers (rgb(... / <alpha-value>)). Under [data-theme="bliss"]
  			// globals.css defines these vars, inverting the dark scale to bliss light surfaces/ink
  			// text — reskinning all ~3047 hardcoded dark-palette usages with ZERO component edits.
  			slate: {
  				'50': 'rgb(var(--c-slate-50, 248 250 252) / <alpha-value>)',
  				'100': 'rgb(var(--c-slate-100, 241 245 249) / <alpha-value>)',
  				'200': 'rgb(var(--c-slate-200, 226 232 240) / <alpha-value>)',
  				'300': 'rgb(var(--c-slate-300, 203 213 225) / <alpha-value>)',
  				'400': 'rgb(var(--c-slate-400, 148 163 184) / <alpha-value>)',
  				'500': 'rgb(var(--c-slate-500, 100 116 139) / <alpha-value>)',
  				'600': 'rgb(var(--c-slate-600, 71 85 105) / <alpha-value>)',
  				'700': 'rgb(var(--c-slate-700, 51 65 85) / <alpha-value>)',
  				'800': 'rgb(var(--c-slate-800, 30 41 59) / <alpha-value>)',
  				'900': 'rgb(var(--c-slate-900, 15 23 42) / <alpha-value>)',
  				'950': 'rgb(var(--c-slate-950, 2 6 23) / <alpha-value>)'
  			},
  			zinc: {
  				'50': 'rgb(var(--c-zinc-50, 250 250 250) / <alpha-value>)',
  				'100': 'rgb(var(--c-zinc-100, 244 244 245) / <alpha-value>)',
  				'200': 'rgb(var(--c-zinc-200, 228 228 231) / <alpha-value>)',
  				'300': 'rgb(var(--c-zinc-300, 212 212 216) / <alpha-value>)',
  				'400': 'rgb(var(--c-zinc-400, 161 161 170) / <alpha-value>)',
  				'500': 'rgb(var(--c-zinc-500, 113 113 122) / <alpha-value>)',
  				'600': 'rgb(var(--c-zinc-600, 82 82 91) / <alpha-value>)',
  				'700': 'rgb(var(--c-zinc-700, 63 63 70) / <alpha-value>)',
  				'800': 'rgb(var(--c-zinc-800, 39 39 42) / <alpha-value>)',
  				'900': 'rgb(var(--c-zinc-900, 24 24 27) / <alpha-value>)',
  				'950': 'rgb(var(--c-zinc-950, 9 9 11) / <alpha-value>)'
  			},
  			gray: {
  				'50': 'rgb(var(--c-gray-50, 249 250 251) / <alpha-value>)',
  				'100': 'rgb(var(--c-gray-100, 243 244 246) / <alpha-value>)',
  				'200': 'rgb(var(--c-gray-200, 229 231 235) / <alpha-value>)',
  				'300': 'rgb(var(--c-gray-300, 209 213 219) / <alpha-value>)',
  				'400': 'rgb(var(--c-gray-400, 156 163 175) / <alpha-value>)',
  				'500': 'rgb(var(--c-gray-500, 107 114 128) / <alpha-value>)',
  				'600': 'rgb(var(--c-gray-600, 75 85 99) / <alpha-value>)',
  				'700': 'rgb(var(--c-gray-700, 55 65 81) / <alpha-value>)',
  				'800': 'rgb(var(--c-gray-800, 31 41 55) / <alpha-value>)',
  				'900': 'rgb(var(--c-gray-900, 17 24 39) / <alpha-value>)',
  				'950': 'rgb(var(--c-gray-950, 3 7 18) / <alpha-value>)'
  			},
  			navy: {
  				'50': 'rgb(var(--c-navy-50, 239 246 255) / <alpha-value>)',
  				'100': 'rgb(var(--c-navy-100, 219 234 254) / <alpha-value>)',
  				'200': 'rgb(var(--c-navy-200, 191 219 254) / <alpha-value>)',
  				'300': 'rgb(var(--c-navy-300, 147 197 253) / <alpha-value>)',
  				'400': 'rgb(var(--c-navy-400, 96 165 250) / <alpha-value>)',
  				'500': 'rgb(var(--c-navy-500, 59 130 246) / <alpha-value>)',
  				'600': 'rgb(var(--c-navy-600, 37 99 235) / <alpha-value>)',
  				'700': 'rgb(var(--c-navy-700, 29 78 216) / <alpha-value>)',
  				'800': 'rgb(var(--c-navy-800, 30 64 175) / <alpha-value>)',
  				'900': 'rgb(var(--c-navy-900, 30 58 138) / <alpha-value>)',
  				'950': 'rgb(var(--c-navy-950, 23 37 84) / <alpha-value>)'
  			},
  			sky: {
  				'50': '#f0f9ff',
  				'100': '#e0f2fe',
  				'200': '#bae6fd',
  				'300': '#7dd3fc',
  				'400': '#38bdf8',
  				'500': '#0ea5e9',
  				'600': '#0284c7',
  				'700': '#0369a1',
  				'800': '#075985',
  				'900': '#0c4a6e'
  			},
  			emerald: {
  				'50': '#ecfdf5',
  				'100': '#d1fae5',
  				'200': '#a7f3d0',
  				'300': '#6ee7b7',
  				'400': '#34d399',
  				'500': '#10b981',
  				'600': '#059669',
  				'700': '#047857',
  				'800': '#065f46',
  				'900': '#064e3b'
  			},
  			'ds-chart': {
  				rose: '#f87171',
  				amber: '#fbbf24',
  				blue: '#60a5fa',
  				emerald: '#34d399',
  				purple: '#a78bfa',
  				pink: '#f472b6',
  			},
  			background: 'oklch(var(--background) / <alpha-value>)',
  			foreground: 'oklch(var(--foreground) / <alpha-value>)',
  			card: {
  				DEFAULT: 'oklch(var(--card) / <alpha-value>)',
  				foreground: 'oklch(var(--card-foreground) / <alpha-value>)'
  			},
  			popover: {
  				DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
  				foreground: 'oklch(var(--popover-foreground) / <alpha-value>)'
  			},
  			primary: {
  				DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
  				foreground: 'oklch(var(--primary-foreground) / <alpha-value>)'
  			},
  			secondary: {
  				DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
  				foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)'
  			},
  			muted: {
  				DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
  				foreground: 'oklch(var(--muted-foreground) / <alpha-value>)'
  			},
  			accent: {
  				DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
  				foreground: 'oklch(var(--accent-foreground) / <alpha-value>)'
  			},
  			destructive: {
  				DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
  				foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)'
  			},
  			border: 'oklch(var(--border) / <alpha-value>)',
  			input: 'oklch(var(--input) / <alpha-value>)',
  			ring: 'oklch(var(--ring) / <alpha-value>)',
  			chart: {
  				'1': 'oklch(var(--chart-1) / <alpha-value>)',
  				'2': 'oklch(var(--chart-2) / <alpha-value>)',
  				'3': 'oklch(var(--chart-3) / <alpha-value>)',
  				'4': 'oklch(var(--chart-4) / <alpha-value>)',
  				'5': 'oklch(var(--chart-5) / <alpha-value>)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
