/**
 * OB-234 T1-C — DS-003 shared tokens. The single source of truth for the visualization vocabulary's
 * color encoding (DS-003 §3) and text hierarchy, so every component in this library renders the same
 * dark-background language. Semantic colors are RESERVED for state; persona accent (from
 * usePersonaTheme) is RESERVED for environment.
 */

// ── Semantic state colors (DS-003 §3 — never used for brand/decoration) ───────────────────────────
export const SEMANTIC = {
  green: '#10B981', // healthy / on-track / positive
  amber: '#F59E0B', // warning / attention / approaching limit
  red: '#EF4444', // critical / off-track / exceeded
  blue: '#3B82F6', // informational / neutral / new
} as const;

export type SemanticTone = 'positive' | 'negative' | 'neutral' | 'warning';

export function toneColor(tone: SemanticTone | undefined): string {
  switch (tone) {
    case 'positive':
      return SEMANTIC.green;
    case 'negative':
      return SEMANTIC.red;
    case 'warning':
      return SEMANTIC.amber;
    default:
      return '#94A3B8'; // slate-400 neutral
  }
}

/** Map a direction to a semantic color (up=green, down=red, flat/stable=neutral). */
export function directionColor(dir: 'up' | 'down' | 'flat' | 'stable' | null | undefined): string {
  if (dir === 'up') return SEMANTIC.green;
  if (dir === 'down') return SEMANTIC.red;
  return '#94A3B8';
}

// ── Severity (PrioritySortedList, validity verdict) ───────────────────────────────────────────────
export type Severity = 'critical' | 'warning' | 'info' | 'opportunity';

export const SEVERITY: Record<Severity, { color: string; border: string; bg: string; label: string }> = {
  critical: { color: SEMANTIC.red, border: 'rgba(239,68,68,0.45)', bg: 'rgba(239,68,68,0.08)', label: 'Critical' },
  warning: { color: SEMANTIC.amber, border: 'rgba(245,158,11,0.45)', bg: 'rgba(245,158,11,0.08)', label: 'Attention' },
  info: { color: SEMANTIC.blue, border: 'rgba(59,130,246,0.45)', bg: 'rgba(59,130,246,0.08)', label: 'Info' },
  opportunity: { color: SEMANTIC.green, border: 'rgba(16,185,129,0.45)', bg: 'rgba(16,185,129,0.08)', label: 'Opportunity' },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, opportunity: 3 };
export function bySeverity(a: { severity: Severity }, b: { severity: Severity }): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

// ── Text hierarchy (DS-003 §3 — never pure #FFFFFF body) ──────────────────────────────────────────
export const TEXT = {
  headline: 'text-slate-100', // page titles, hero values
  sectionLabel: 'text-slate-300', // section headers (uppercase, tracking-wide)
  body: 'text-slate-400', // descriptions, labels
  muted: 'text-slate-500', // timestamps, metadata
  disabled: 'text-slate-600', // truly inactive / placeholder
} as const;

/** A section-header className (uppercase tracking) used by every component title. */
export const SECTION_LABEL_CLASS = `text-xs font-semibold uppercase tracking-wide ${TEXT.sectionLabel}`;

// ── Surface (card) — dark, sits on the persona ambient gradient ───────────────────────────────────
export const CARD = 'rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-sm';
export const CARD_PAD = 'p-4 sm:p-5';

// ── Data-encoding palette (categorical, dark-safe) — DS-003 §3 ────────────────────────────────────
export const DATA_PALETTE = [
  '#818cf8', // indigo-400
  '#6ee7b7', // emerald-300
  '#fbbf24', // amber-400
  '#60a5fa', // blue-400
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
] as const;

export function paletteColor(i: number): string {
  return DATA_PALETTE[i % DATA_PALETTE.length];
}

// ── Formatting helpers ────────────────────────────────────────────────────────────────────────────
/** Default numeric formatter; surfaces pass useCurrency().format for money. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

/** Compact axis/label formatter — 1.2k, 3.4M (no currency symbol; for chart ticks). */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Signed percent string with sign, e.g. +12.0% / −3.0%. */
export function signedPct(fraction: number): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** Recharts tooltip surface style (dark). */
export const TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid rgba(51,65,85,0.8)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
} as const;

export const GRID_STROKE = 'rgba(51,65,85,0.4)'; // slate-700/40
export const AXIS_TICK = { fill: '#64748b', fontSize: 11 }; // slate-500
