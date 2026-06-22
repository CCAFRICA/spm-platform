/**
 * OB-228 — ComponentCard (Concepts ① ③ ④). Header (name + primitive glyph + confidence
 * glyph + edit slot) · confidence overlay (③: critical=red/ack, warning=amber) · body
 * (type-dispatched renderer, Korean Test) · footer (bound-column chip → ProvenancePanel ④
 * + DistributionSparkline ①, period-scoped).
 */
'use client';
import { useEffect, useState } from 'react';
import { Layers, RotateCcw, Filter, GitBranch, Boxes, Link2, ChevronDown, Check } from 'lucide-react';
import { analyzeComponent, type CanonicalComponent, type ComponentDistribution, type ComponentConfidence } from '@/lib/plan-surface';
import { resolveRenderer } from './renderers';
import { DistributionSparkline } from './DistributionSparkline';
import { ConfidenceGlyph } from './ConfidenceGlyph';
import { ProvenancePanel } from './ProvenancePanel';
import { useLocale } from '@/contexts/locale-context';

const SHAPE_GLYPH: Record<string, React.ReactNode> = {
  banded_lookup: <Layers className="h-4 w-4" />,
  banded_conditional: <Layers className="h-4 w-4" />,
  conditional: <GitBranch className="h-4 w-4" />,
  filtered_count: <Filter className="h-4 w-4" />,
  reversal: <RotateCcw className="h-4 w-4" />,
  arithmetic: <Boxes className="h-4 w-4" />,
};

export interface ComponentCardProps {
  component: CanonicalComponent;
  ruleSetId: string;
  periodId: string | null;
  /** Concept ③ — per-component confidence/anomaly assessment. */
  confidence?: ComponentConfidence;
  /** Plan-level confidence (for provenance display fallback). */
  planConfidence?: number;
  /** Whether the viewer may acknowledge / edit (icm.configure_plans). */
  canEdit?: boolean;
  /** Phase 4 edit affordance. */
  editSlot?: (component: CanonicalComponent) => React.ReactNode;
}

export function ComponentCard({ component, ruleSetId, periodId, confidence, planConfidence, canEdit, editSlot }: ComponentCardProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const view = analyzeComponent(component);
  const Renderer = resolveRenderer(component.componentType);
  const [dist, setDist] = useState<ComponentDistribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [showProv, setShowProv] = useState(false);
  const [acked, setAcked] = useState(false);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    if (!periodId) { setDist(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/plan-surface/distribution?ruleSetId=${ruleSetId}&componentId=${encodeURIComponent(component.id)}&periodId=${periodId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDist(d); })
      .catch(() => { if (!cancelled) setDist(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ruleSetId, component.id, periodId]);

  const acknowledge = async () => {
    if (!confidence) return;
    setAcking(true);
    try {
      await fetch('/api/plan-surface/acknowledge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleSetId, componentId: component.id, severity: confidence.severity, reason: confidence.reasons[0] }),
      });
      setAcked(true);
    } catch { /* non-blocking */ } finally { setAcking(false); }
  };

  const glyph = SHAPE_GLYPH[view.shape] ?? <Boxes className="h-4 w-4" />;
  const sev = confidence?.severity ?? 'info';
  const needsReview = confidence?.needsReview && !acked;
  const ringColor = sev === 'critical' ? 'var(--vl-danger, #DC5454)' : sev === 'warning' ? 'var(--vl-cta-signal, #E8A838)' : undefined;

  return (
    <div
      className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col"
      style={{ borderColor: needsReview ? ringColor : 'var(--border)', borderLeftWidth: needsReview ? 3 : 1 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="grid place-items-center h-8 w-8 rounded-lg shrink-0" style={{ background: 'var(--vl-indigo-50, #EEF0FB)', color: 'var(--vl-kpi-accent, #4446B8)' }}>{glyph}</span>
          <div className="min-w-0">
            <div className="font-medium text-foreground leading-tight truncate">{component.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{view.summary}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {confidence && <ConfidenceGlyph severity={acked ? 'info' : confidence.severity} label={acked ? (isSpanish ? 'Reconocido' : 'Acknowledged') : undefined} />}
          {editSlot?.(component)}
        </div>
      </div>

      {/* Concept ③ — confidence overlay (recede the confident, surface the exception) */}
      {needsReview && (
        <div className="px-4 py-2.5 text-xs" style={{ background: sev === 'critical' ? 'var(--vl-danger-50, #FCECEC)' : 'var(--vl-gold-50, #FCF4E3)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-foreground/90">{confidence?.reasons[0]}</div>
            {canEdit && (
              <button onClick={acknowledge} disabled={acking} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">
                <Check className="h-3 w-3" />{isSpanish ? 'Reconocer' : 'Acknowledge'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Body — type-dispatched renderer (Korean Test) */}
      <div className="px-4 py-3 flex-1">
        <Renderer component={component} view={view} distribution={dist} />
      </div>

      {/* Footer — bound-column chip (→ provenance) + distribution */}
      <div className="px-4 pb-4 pt-1 space-y-2.5">
        {component.binding.column && (
          <button onClick={() => setShowProv((s) => !s)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Link2 className="h-3 w-3" />
            <span>{isSpanish ? 'enlazado a' : 'bound to'}</span>
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-foreground">{component.binding.column}</code>
            <ChevronDown className={`h-3 w-3 transition-transform ${showProv ? 'rotate-180' : ''}`} />
          </button>
        )}
        {showProv && <ProvenancePanel component={component} ruleSetId={ruleSetId} planConfidence={planConfidence} />}
        <DistributionSparkline distribution={dist} loading={loading} />
      </div>
    </div>
  );
}
