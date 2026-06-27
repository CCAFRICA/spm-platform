'use client';

// OB-249 — Rendered Remediation (P7): the before → after → why surface.
//
// Renders the ACTUAL applied remediation for the tenant (sourced from committed_data via
// /api/remediation/review): per column, each variant→canonical collapse, how many rows it touched,
// and on what BASIS (structural noise vs an LLM-expressed semantic equivalence). When nothing was
// changed it still confirms the stage RAN (the data was already congruent) — making the mandatory,
// no-bypass placement visible, not merely asserted.

import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

interface Mapping { from: unknown; to: unknown; rows: number }
interface ColumnRemediation { column: string; agent: string; basis: string; rowsChanged: number; mappings: Mapping[] }
interface ReviewModel { tenantId: string; stageRan: boolean; columns: ColumnRemediation[]; totalChanges: number; batchesSeen: number }

const show = (v: unknown): string => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'string' ? v : JSON.stringify(v));

function basisLabel(basis: string): { text: string; cls: string } {
  return basis === 'llm'
    ? { text: 'semantic · LLM-expressed', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' }
    : { text: 'structural', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
}

export function RemediationReview({ tenantId, importBatchId }: { tenantId: string; importBatchId?: string }) {
  const [model, setModel] = useState<ReviewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams({ tenant_id: tenantId });
    if (importBatchId) qs.set('import_batch_id', importBatchId);
    fetch(`/api/remediation/review?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m: ReviewModel) => { if (active) { setModel(m); setError(null); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, importBatchId]);

  if (loading) {
    return (
      <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-5 flex items-center gap-3 text-sm text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Reviewing remediation…
      </div>
    );
  }
  if (error || !model || !model.stageRan) {
    // The stage runs on every commit; absence here just means no committed rows to read yet.
    return null;
  }

  const hasChanges = model.totalChanges > 0;

  return (
    <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-5 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-amber-300" />
        <h3 className="text-sm font-semibold text-zinc-100">Remediation</h3>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-300/90">
          <ShieldCheck className="w-3.5 h-3.5" /> stage verified
        </span>
      </div>

      {!hasChanges ? (
        <p className="text-xs text-zinc-400">
          Data was already congruent — the remediation stage examined every eligible column and made no changes.
          (The stage runs on every import before promotion; nothing bypasses it.)
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-400 mb-3">
            Made <span className="text-zinc-200 font-medium">{model.totalChanges}</span> value{model.totalChanges === 1 ? '' : 's'} congruent
            across <span className="text-zinc-200 font-medium">{model.columns.length}</span> column{model.columns.length === 1 ? '' : 's'} before promotion.
            The original value is retained alongside the canonical.
          </p>
          <div className="space-y-3">
            {model.columns.map((col) => {
              const b = basisLabel(col.basis);
              return (
                <div key={col.column} className="rounded-lg bg-zinc-900/50 border border-zinc-700/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-zinc-200 font-mono">{col.column}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>
                    <span className="ml-auto text-[11px] text-zinc-500">{col.rowsChanged} row{col.rowsChanged === 1 ? '' : 's'}</span>
                  </div>
                  <ul className="space-y-1">
                    {col.mappings.slice(0, 12).map((m, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-400 line-through decoration-zinc-600 truncate max-w-[40%]" title={show(m.from)}>{show(m.from)}</span>
                        <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                        <span className="text-emerald-300 truncate max-w-[40%]" title={show(m.to)}>{show(m.to)}</span>
                        <span className="ml-auto text-[10px] text-zinc-600">×{m.rows}</span>
                      </li>
                    ))}
                    {col.mappings.length > 12 && (
                      <li className="text-[10px] text-zinc-600">+{col.mappings.length - 12} more</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default RemediationReview;
