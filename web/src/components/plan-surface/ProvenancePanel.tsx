/**
 * OB-228 Phase 5 — ProvenancePanel (Concept ④). River Test made interactive: the source
 * sentence the Reader read the value from, the construction method, confidence, the binding
 * (column + match reason + field refs), and the correction history (lazy-fetched from
 * classification_signals). Recognition only (Decision 158) — explains, never alters.
 */
'use client';
import { useEffect, useState } from 'react';
import { Quote, Link2, GitBranch, History, Loader2 } from 'lucide-react';
import { getProvenance, type CanonicalComponent, type ProvenanceData } from '@/lib/plan-surface';
import { useLocale } from '@/contexts/locale-context';

export function ProvenancePanel({ component, ruleSetId, planConfidence }: { component: CanonicalComponent; ruleSetId: string; planConfidence?: number }) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const prov: ProvenanceData = getProvenance(component, planConfidence);
  const [corrections, setCorrections] = useState<ProvenanceData['corrections']>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan-surface/provenance?ruleSetId=${ruleSetId}&componentId=${encodeURIComponent(component.id)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCorrections(d.corrections ?? []); })
      .catch(() => { if (!cancelled) setCorrections([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ruleSetId, component.id]);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3 text-sm">
      {prov.sourceNote ? (
        <div className="flex items-start gap-2">
          <Quote className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--vl-kpi-accent, #4446B8)' }} />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{isSpanish ? 'Origen' : 'Source'}</div>
            <div className="text-foreground italic">“{prov.sourceNote}”</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{isSpanish ? 'Sin oración de origen registrada.' : 'No source sentence recorded.'}</div>
      )}

      <div className="flex items-start gap-2">
        <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{isSpanish ? 'Enlace de datos' : 'Data binding'}</div>
          <div className="text-foreground">
            {prov.binding.column ? <code className="px-1 py-0.5 rounded bg-muted font-mono">{prov.binding.column}</code> : (isSpanish ? 'sin enlace' : 'unbound')}
            {prov.binding.matchReason && <span className="text-muted-foreground text-xs ml-2">· {prov.binding.matchReason}</span>}
            {prov.binding.tokenOverlap !== undefined && <span className="text-muted-foreground text-xs ml-1">· overlap {Math.round(prov.binding.tokenOverlap * 100)}%</span>}
          </div>
          {prov.binding.fieldRefs.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
              {prov.binding.fieldRefs.map((f, i) => <span key={i} className="font-mono">{f.field}<span className="opacity-60">·{f.via}</span></span>)}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" />
        {prov.constructionMethod && <span>{isSpanish ? 'Método' : 'Method'}: {prov.constructionMethod}</span>}
        {prov.confidence !== undefined && <span>· {isSpanish ? 'Confianza' : 'Confidence'} {Math.round(prov.confidence * 100)}%</span>}
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1"><History className="h-3 w-3" />{isSpanish ? 'Historial de correcciones' : 'Correction history'}</div>
        {loading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{isSpanish ? 'Cargando…' : 'Loading…'}</div>
        ) : corrections.length === 0 ? (
          <div className="text-xs text-muted-foreground">{isSpanish ? 'Sin correcciones registradas.' : 'No corrections recorded.'}</div>
        ) : (
          <div className="space-y-1">
            {corrections.slice(0, 6).map((c) => (
              <div key={c.id} className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{c.signalType}</span>{c.at ? ` · ${new Date(c.at).toLocaleDateString()}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
