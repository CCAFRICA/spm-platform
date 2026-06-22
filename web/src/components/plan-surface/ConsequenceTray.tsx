/**
 * OB-228 Phase 4 — ConsequenceTray (Zone C, Concept ②). On edit it shows the deterministic
 * structural diff (before→after of the plan's numbers) and, per HALT-4, the payout-consequence
 * SEAM ("recompute pending architect disposition") — never fabricated Δ/crosser/zero numbers.
 * Commit writes the edited component to rule_sets.components (D158) and emits a tenant
 * classification signal (Three-Scope Flywheel). Discard drops the in-memory draft.
 */
'use client';
import { useMemo, useState } from 'react';
import { useLocale } from '@/contexts/locale-context';
import { X, GitCommit, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import type { PlanStructure, CanonicalComponent } from '@/lib/plan-surface';
import { extractEditableValues, applyEdits } from '@/lib/plan-surface/edit-model';
import { summarizeEdits } from '@/lib/plan-surface/consequence';

export interface EditDraft {
  planId: string;
  planName: string;
  variantId: string | null;
  component: CanonicalComponent;
  periodId: string | null;
}

const fmt = (n: number) => (Math.abs(n) <= 1 && n !== 0 ? `${+(n * 100).toFixed(2)}%` : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));

export function ConsequenceTray({ plan, draft, onClose, onCommitted }: {
  plan: PlanStructure;
  draft: EditDraft;
  periodId: string | null;
  tenantId: string | null;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const editable = useMemo(() => extractEditableValues(draft.component), [draft.component]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editList = useMemo(
    () => editable.filter((e) => edits[e.id] !== undefined && edits[e.id] !== e.value).map((e) => ({ path: e.path, value: edits[e.id] })),
    [editable, edits],
  );
  const { applied, calculationIntent, compositionalIntent } = useMemo(() => applyEdits(draft.component, editList), [draft.component, editList]);
  const summary = summarizeEdits(applied);

  const commit = async () => {
    if (summary.count === 0) return;
    setCommitting(true); setError(null);
    try {
      const res = await fetch('/api/plan-surface/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleSetId: plan.id,
          variantId: draft.variantId,
          componentId: draft.component.id,
          calculationIntent, compositionalIntent,
          edits: applied.map((a) => ({ label: a.label, from: a.from, to: a.to })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Commit failed'); return; }
      onCommitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally { setCommitting(false); }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card shadow-2xl flex flex-col" role="dialog" aria-label="Consequence tray">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{isSpanish ? 'Editar componente' : 'Edit component'} · {plan.name}</div>
          <div className="font-medium text-foreground truncate">{draft.component.name}</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {/* editable values */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{isSpanish ? 'Valores editables' : 'Editable values'}</div>
          {editable.length === 0 && <div className="text-sm text-muted-foreground">{isSpanish ? 'Este componente no tiene valores escalares editables.' : 'This component has no editable scalar values.'}</div>}
          {editable.map((e) => (
            <label key={e.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="text-foreground">{e.label}</span>
                <span className="ml-1.5 text-[10px] font-mono uppercase rounded px-1 py-0.5" style={{ background: 'var(--vl-indigo-50, #EEF0FB)', color: 'var(--vl-kpi-accent, #4446B8)' }}>{e.role}</span>
              </span>
              <input
                type="number" step="any"
                defaultValue={e.value}
                onChange={(ev) => setEdits((cur) => ({ ...cur, [e.id]: parseFloat(ev.target.value) }))}
                className="w-28 rounded-md border border-border bg-background px-2 py-1 font-mono text-right text-sm"
              />
            </label>
          ))}
        </div>

        {/* deterministic structural diff */}
        {summary.count > 0 && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{isSpanish ? 'Cambio propuesto' : 'Proposed change'}</div>
            {summary.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground min-w-0 truncate">{l.label}</span>
                <span className="ml-auto flex items-center gap-1.5 font-mono">
                  <span className="text-muted-foreground line-through">{fmt(l.from)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span style={{ color: 'var(--vl-kpi-accent, #4446B8)' }}>{fmt(l.to)}</span>
                  {l.pct !== null && <span className={l.pct >= 0 ? 'text-[11px]' : 'text-[11px]'} style={{ color: l.pct >= 0 ? 'var(--vl-success, #15936A)' : 'var(--vl-danger, #DC5454)' }}>{l.pct >= 0 ? '+' : ''}{l.pct.toFixed(0)}%</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* payout consequence — HALT-4 seam (no fabricated numbers) */}
        <div className="rounded-lg border border-dashed border-border p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--vl-cta-signal, #E8A838)' }} />
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">{isSpanish ? 'Vista previa de impacto en pagos: pendiente' : 'Payout consequence preview: pending'}</div>
            <div>
              {isSpanish
                ? 'El recálculo determinista por entidad (Δ agregado, cruces de umbral, nuevos ceros) requiere el adaptador de recálculo (HALT-4, disposición del arquitecto). La edición y el guardado son deterministas y están disponibles ahora.'
                : 'The deterministic per-entity recompute (aggregate Δ, threshold-crossers, new-zeros) requires the scoped recompute adapter (HALT-4, architect disposition). The edit and commit are deterministic and available now.'}
            </div>
          </div>
        </div>

        {error && <div className="text-sm" style={{ color: 'var(--vl-danger, #DC5454)' }}>{error}</div>}
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
        <button
          onClick={commit}
          disabled={summary.count === 0 || committing}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-50"
          style={{ background: 'var(--vl-cta-primary, #4446B8)' }}
        >
          {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
          {isSpanish ? 'Guardar cambios' : 'Commit changes'}{summary.count > 0 ? ` (${summary.count})` : ''}
        </button>
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{isSpanish ? 'Descartar' : 'Discard'}</button>
      </div>
    </div>
  );
}
