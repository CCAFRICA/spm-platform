/**
 * OB-234 T1-C — DS-003 shared tokens. THEME-AWARE (corrective): structure/text use shadcn semantic
 * Tailwind tokens (bg-card, text-foreground, text-muted-foreground, border-border, bg-muted) which the
 * app re-tunes per theme (Vialuce light, Dark, Bliss) — so DS-003 surfaces PARTICIPATE in the production
 * theme, never override it. Chart internals (recharts raw color props) use the production Vialuce theme
 * vars (--vl-*) with hex fallbacks, exactly like the OB-227 production charts. Semantic STATE colors
 * (green/amber/red/blue) are theme-agnostic indicators and stay constant. Persona accent (environment)
 * comes from usePersonaTheme, not here.
 */

// ── Semantic state colors (state indicators — legible on light AND dark; never theme bg) ──────────
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
      return 'var(--vl-text-muted, #5B637C)'; // theme muted, not a fixed slate
  }
}

/** Map a direction to a semantic color (up=green, down=red, flat/stable=neutral). */
export function directionColor(dir: 'up' | 'down' | 'flat' | 'stable' | null | undefined): string {
  if (dir === 'up') return SEMANTIC.green;
  if (dir === 'down') return SEMANTIC.red;
  return 'var(--vl-text-muted, #5B637C)';
}

// ── Severity (PrioritySortedList, validity verdict) — state tints, faint over any surface ──────────
export type Severity = 'critical' | 'warning' | 'info' | 'opportunity';

export const SEVERITY: Record<Severity, { color: string; border: string; bg: string; label: string }> = {
  critical: { color: SEMANTIC.red, border: 'rgba(239,68,68,0.45)', bg: 'rgba(239,68,68,0.08)', label: 'Critical' },
  warning: { color: SEMANTIC.amber, border: 'rgba(245,158,11,0.45)', bg: 'rgba(245,158,11,0.10)', label: 'Attention' },
  info: { color: SEMANTIC.blue, border: 'rgba(59,130,246,0.45)', bg: 'rgba(59,130,246,0.08)', label: 'Info' },
  opportunity: { color: SEMANTIC.green, border: 'rgba(16,185,129,0.45)', bg: 'rgba(16,185,129,0.08)', label: 'Opportunity' },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, opportunity: 3 };
export function bySeverity(a: { severity: Severity }, b: { severity: Severity }): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

// ── Text hierarchy — shadcn semantic Tailwind classes (auto-adapt per theme) ──────────────────────
export const TEXT = {
  headline: 'text-foreground', // page titles, hero values
  sectionLabel: 'text-muted-foreground', // section eyebrows (uppercase, tracking-wide)
  body: 'text-muted-foreground', // descriptions, labels
  muted: 'text-muted-foreground/80', // timestamps, metadata
  disabled: 'text-muted-foreground/50', // truly inactive / placeholder
} as const;

/** A section-header className (uppercase tracking) used by every component title. */
export const SECTION_LABEL_CLASS = `text-xs font-semibold uppercase tracking-wide ${TEXT.sectionLabel}`;

// ── Surface (card) — shadcn semantic card surface; adapts to the active theme ──────────────────────
export const CARD = 'rounded-xl border border-border bg-card shadow-sm';
export const CARD_PAD = 'p-4 sm:p-5';
/** Translucent "track"/well behind bars — theme muted, never a fixed slate. */
export const TRACK = 'bg-muted';

// ── Data-encoding palette (categorical) — saturated tones legible on light AND dark ────────────────
export const DATA_PALETTE = [
  '#4446B8', // indigo (vialuce brand)
  '#E8A838', // gold (vialuce signal)
  '#15936A', // emerald
  '#3B82F6', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
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

// ── recharts chrome — production Vialuce theme vars (--vl-*) with hex fallbacks (OB-227 pattern) ───
export const TOOLTIP_STYLE = {
  background: 'var(--vl-surface, #FFFFFF)',
  border: '1px solid var(--vl-line, #E8EAF3)',
  borderRadius: 8,
  color: 'var(--vl-text, #1A1A2E)',
  fontSize: 12,
} as const;

export const GRID_STROKE = 'var(--vl-line, #E8EAF3)';
export const AXIS_TICK = { fill: 'var(--vl-text-soft, #8A90A6)', fontSize: 11 };
/** Neutral chart accent when no persona/series color applies (vialuce indigo brand). */
export const CHART_NEUTRAL = 'var(--vl-kpi-accent, #4446B8)';
