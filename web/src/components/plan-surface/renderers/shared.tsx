/**
 * OB-228 — shared presentational atoms for component renderers. Theme-robust:
 * semantic tokens (bg-card/border/text-*) theme across Dark/Bliss/Vialuce; Vialuce
 * indigo/gold accents via var(--vl-*) with fallbacks (Rule 30 — no bare hex).
 */
import type { CanonicalComponent, ComponentView, ComponentDistribution } from '@/lib/plan-surface';

export interface RendererProps {
  component: CanonicalComponent;
  view: ComponentView;
  /** Resolved distribution for the selected period, if loaded (overlays band tables). */
  distribution?: ComponentDistribution | null;
}

export function fmtRate(v: number | string): string {
  if (typeof v !== 'number') return String(v);
  if (Math.abs(v) <= 1 && v !== 0) return `${+(v * 100).toFixed(2)}%`;
  return String(+v.toFixed(3));
}
export function fmtNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(+n.toFixed(2));
}

const ACCENT = 'var(--vl-kpi-accent, #4446B8)';
const GOLD = 'var(--vl-cta-signal, #E8A838)';

export function StepLine({ icon, label, detail, tone = 'default' }: { icon?: React.ReactNode; label: string; detail?: string; tone?: 'default' | 'accent' | 'gold' | 'danger' }) {
  const color = tone === 'gold' ? GOLD : tone === 'accent' ? ACCENT : tone === 'danger' ? 'var(--vl-danger, #DC5454)' : undefined;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {icon && <span className="mt-0.5 shrink-0" style={color ? { color } : undefined}>{icon}</span>}
      <div className="min-w-0">
        <div className="text-sm text-foreground leading-snug">{label}</div>
        {detail && <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

export function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' | 'gold' | 'danger' }) {
  const styles: React.CSSProperties =
    tone === 'gold' ? { background: 'var(--vl-gold-50, #FCF4E3)', color: '#7a5210', borderColor: GOLD }
    : tone === 'accent' ? { background: 'var(--vl-indigo-50, #EEF0FB)', color: ACCENT, borderColor: 'var(--vl-indigo-100, #E0E2F6)' }
    : tone === 'danger' ? { background: 'var(--vl-danger-50, #FCECEC)', color: 'var(--vl-danger, #DC5454)', borderColor: 'var(--vl-danger, #DC5454)' }
    : { background: 'var(--muted)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' };
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono" style={styles}>
      {children}
    </span>
  );
}

/** A band/tier ladder table (lowerLabel → output). The Concept-① tier table. */
export function BandTable({ refField, bands, distribution }: {
  refField: string;
  bands: { lowerLabel: string; output: number | string }[];
  distribution?: { label: string; entityCount: number }[];
}) {
  const distByLabel = new Map((distribution ?? []).map((d) => [d.label, d.entityCount]));
  const maxCount = Math.max(1, ...(distribution ?? []).map((d) => d.entityCount));
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/50">
        <span>{refField}</span><span>Rate</span>
      </div>
      <div className="divide-y divide-border">
        {bands.map((b, i) => {
          const c = distByLabel.get(b.lowerLabel);
          const w = c !== undefined ? Math.round((c / maxCount) * 100) : 0;
          return (
            <div key={i} className="relative px-3 py-1.5 grid grid-cols-[1fr_auto] gap-2 items-center text-sm">
              {c !== undefined && (
                <span className="absolute inset-y-0 left-0 -z-0" style={{ width: `${w}%`, background: 'var(--vl-indigo-50, #EEF0FB)' }} aria-hidden />
              )}
              <span className="relative z-10 text-foreground">{b.lowerLabel}</span>
              <span className="relative z-10 font-mono" style={{ color: ACCENT }}>{fmtRate(b.output)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
