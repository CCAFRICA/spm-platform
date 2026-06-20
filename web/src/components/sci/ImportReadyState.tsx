'use client';

// SCI ImportReadyState — Post-import summary + Calculate bridge.
// OB-203 Phase 5 (D10): the completion screen tells the TRUTH about the session — it renders the FULL
// unit set from the durable SessionStateView read (imported / excluded / failed–unresolved), not just
// the committed subset; and context-dependent panels (components / plan) are suppressed when no plan
// exists rather than rendering as placeholders, with a plan-aware next action. Same durable read, no
// new surface. Zero domain vocabulary. Korean Test applies.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, XCircle, ArrowRight, Upload, AlertTriangle, RotateCcw, MinusCircle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useCarrierIntelligence } from '@/lib/hooks/useCarrierIntelligence';
import type { AgentType, ContentUnitResult } from '@/lib/sci/sci-types';
import type { SessionStateView, UnitStateView, ImportTelemetry } from '@/lib/sci/comprehension-state-service';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules', entity: 'Team Roster', target: 'Perf. Targets', transaction: 'Transaction Data', reference: 'Reference Data',
};

interface ImportReadyStateProps {
  results: ContentUnitResult[];
  totalRowsCommitted: number;
  tenantId?: string;
  importSessionId?: string;
  entityCount?: number;
  planName?: string;
  componentCount?: number;
  sourceDateRange?: { min: string; max: string } | null;
  onNavigateToCalculate: () => void;
  onImportMore: () => void;
  onRetryFailed?: () => void;
}

type Disposition = 'imported' | 'failed' | 'excluded' | 'resolved';
interface CompletionRow { key: string; sheetName: string; disposition: Disposition; rows: number; classification?: AgentType; reason?: string | null; }

function Conclusion({ label, value, accent, isVialuce }: { label: string; value: string; accent?: boolean; isVialuce?: boolean }) {
  if (isVialuce) {
    return (
      <div style={{ padding: '2px 0' }}>
        <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '14px', fontWeight: 'var(--vl-fw-med)' as unknown as number, color: accent ? 'var(--vl-success)' : 'var(--vl-text)', margin: 0 }}>{value}</p>
        <p style={{ fontSize: '11px', color: 'var(--vl-text-soft)', margin: '1px 0 0' }}>{label}</p>
      </div>
    );
  }
  return (
    <div className="py-0.5">
      <p className={cn('text-sm tabular-nums', accent ? 'text-emerald-300 font-medium' : 'text-zinc-200')}>{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

const sheetOf = (id: string) => id.split('::')[1] || id;

// OB-205 / DS-029 §5.2 — confidence indicator from avg classification confidence (0–100).
function confidenceNote(pct: number | null): { label: string; cls: string } | null {
  if (pct == null) return null;
  if (pct > 90) return { label: 'High confidence classification', cls: 'text-emerald-300' };
  if (pct >= 70) return { label: 'Review recommended', cls: 'text-amber-300' };
  return { label: 'Low confidence — review classifications before calculating', cls: 'text-rose-300' };
}

export function ImportReadyState({
  results, totalRowsCommitted, tenantId, importSessionId, entityCount, planName, componentCount, sourceDateRange,
  onNavigateToCalculate, onImportMore, onRetryFailed,
}: ImportReadyStateProps) {
  const isVialuce = useIsVialuce(); // HF-315: import-complete summary → design-spec KPIs / session .tbl / .insight banners under Vialuce
  const router = useRouter();
  const [sessionUnits, setSessionUnits] = useState<UnitStateView[] | null>(null);
  const [telemetry, setTelemetry] = useState<ImportTelemetry | null>(null);
  const [auditVerdict, setAuditVerdict] = useState<{ divergent: boolean; fields?: string[] } | null>(null);
  // OB-205 / DS-029 §5: carrier intelligence briefing — same payload the stream reads.
  const { carrier } = useCarrierIntelligence(tenantId ?? null);

  // D10/D18: read the full unit set AND the final telemetry from the durable surface (?telemetry=1). This
  // is the ONLY source — never the execute response (which died at Vercel's 300s cap in run-5 while the
  // server kept committing). The completion screen renders the truth: what the DB actually holds.
  // OB-203 Phase D: the settle audit is invoked FIRST (idempotent backstop — first audit wins), so the
  // session-state read that follows carries the reconciliation verdict.
  useEffect(() => {
    if (!tenantId || !importSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/import/sci/settle-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, importSessionId }),
        }).catch(() => null);
        const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}&telemetry=1`);
        if (res.ok && !cancelled) {
          const view = (await res.json()) as SessionStateView & { telemetry?: ImportTelemetry; audit?: { divergent?: boolean; fields?: string[] } | null };
          setSessionUnits(view.units);
          if (view.telemetry) setTelemetry(view.telemetry);
          if (view.audit) setAuditVerdict({ divergent: view.audit.divergent === true, fields: view.audit.fields });
        }
      } catch { /* graceful degradation to results-only below */ }
    })();
    return () => { cancelled = true; };
  }, [tenantId, importSessionId]);

  // D18: per-unit committed rows come from the durable telemetry (keyed by sheet), not the dead response.
  const telRowsBySheet = new Map((telemetry?.perUnit ?? []).map(p => [p.sheetName, p.expectedRows]));
  // D18: the authoritative "records imported" is the durable row count, not the response-scoped prop.
  const committedRows = telemetry ? telemetry.rows.committed : totalRowsCommitted;

  // Rows + commit-failures from the execute results (keyed by sheet).
  const resultBySheet = new Map(results.map(r => [sheetOf(r.contentUnitId), r]));

  // Build the truthful unit list: prefer the durable session set; fall back to results when absent.
  const rows: CompletionRow[] = sessionUnits
    ? sessionUnits.map(u => {
        const r = resultBySheet.get(sheetOf(u.unitId));
        let disposition: Disposition;
        if (u.state === 'bound' || (r && r.success)) disposition = 'imported';
        else if (u.state === 'failed_interpretation') disposition = 'failed';
        else if (u.state === 'resolved') disposition = 'resolved';
        else disposition = 'excluded';
        // D18: rows from durable telemetry (by sheet); reason persists from the spine's failureClass.
        const sheetName = u.sheetName ?? sheetOf(u.unitId);
        return { key: u.unitId, sheetName, disposition, rows: telRowsBySheet.get(sheetName) ?? r?.rowsProcessed ?? 0, classification: (r?.classification ?? u.classification ?? undefined) as AgentType | undefined, reason: u.failureClass };
      })
    : results.map(r => ({ key: r.contentUnitId, sheetName: sheetOf(r.contentUnitId), disposition: (r.success ? 'imported' : 'failed') as Disposition, rows: r.rowsProcessed, classification: r.classification }));

  const importedRows = rows.filter(r => r.disposition === 'imported');
  const notImportedRows = rows.filter(r => r.disposition !== 'imported');
  const total = rows.length;
  const importedCount = importedRows.length;

  const hasPlan = !!planName;
  const hasData = committedRows > 0;
  const calculateReady = hasData && hasPlan;

  const title = notImportedRows.length > 0
    ? `Import complete — ${importedCount} of ${total} units imported`
    : 'Import Complete';

  const DISPO_CHIP: Record<Exclude<Disposition, 'imported'>, { label: string; cls: string }> = {
    failed: { label: 'failed — unresolved', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
    excluded: { label: 'excluded', cls: 'border-zinc-600 bg-zinc-700/30 text-zinc-400' },
    resolved: { label: 'resolved — not committed', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  };

  // Vialuce: the import-complete screen becomes design-spec surfaces — a header .card with KPI stat boxes,
  // the truthful session listing as a .card.flush + .tbl with .pill dispositions, the reconciliation flag and
  // the carrier briefing as gold .insight banners, telemetry conclusions in DM Mono. Strings/handlers reused.
  if (isVialuce) {
    const DISPO_PILL: Record<Exclude<Disposition, 'imported'>, { label: string; cls: string }> = {
      failed: { label: DISPO_CHIP.failed.label, cls: 'pill danger' },
      excluded: { label: DISPO_CHIP.excluded.label, cls: 'pill neutral' },
      resolved: { label: DISPO_CHIP.resolved.label, cls: 'pill success' },
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header card + KPI stat boxes */}
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            {notImportedRows.length > 0
              ? <AlertTriangle size={20} style={{ color: 'var(--vialuce-gold)' }} />
              : <Check size={20} style={{ color: 'var(--vl-success)' }} />}
            <h2 style={{ fontSize: '16px', fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)', margin: 0 }}>{title}</h2>
          </div>

          {/* HF-318 hero — Records Imported / Entities Found / Content Units (the headline). */}
          <div className="kpis" style={{ marginBottom: 20 }}>
            <div className="kpi">
              <div className="kpi-label">Records Imported</div>
              <div className="kpi-val">{committedRows.toLocaleString()}</div>
            </div>
            {entityCount != null && (
              <div className="kpi">
                <div className="kpi-label">Entities Found</div>
                <div className="kpi-val">{entityCount.toLocaleString()}</div>
              </div>
            )}
            <div className="kpi">
              <div className="kpi-label">Content Units</div>
              <div className="kpi-val">{importedCount}</div>
            </div>
          </div>

          {(hasPlan || sourceDateRange) && (
            <>
              <div style={{ height: 1, background: 'var(--vl-line)', margin: '0 0 16px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {hasPlan && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--vl-text-soft)' }}>Plan</span>
                    <span style={{ fontSize: '13px', color: 'var(--vl-text)' }}>{planName}{componentCount != null ? ` · ${componentCount} components` : ''}</span>
                  </div>
                )}
                {sourceDateRange && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--vl-text-soft)' }}>Source dates</span>
                    <span style={{ fontSize: '13px', color: 'var(--vl-text)' }}>{sourceDateRange.min} through {sourceDateRange.max}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Session summary (truthful) */}
          <div style={{ height: 1, background: 'var(--vl-line)', margin: '0 0 12px' }} />
          <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '11px', letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 12px' }}>
            Session — {importedCount} of {total} units imported · {committedRows.toLocaleString()} rows
            {notImportedRows.length > 0 && ` · ${notImportedRows.length} not imported`}
          </p>
          <div className="card flush" style={{ marginTop: 0 }}>
            <table className="tbl">
              <tbody>
                {importedRows.map(r => (
                  <tr key={r.key}>
                    <td style={{ width: 28 }}>
                      <span style={{ display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--vl-success-50)' }}>
                        <Check size={11} style={{ color: 'var(--vl-success)' }} />
                      </span>
                    </td>
                    <td className="name">{r.sheetName}</td>
                    <td className="mut">{r.classification ? CLASSIFICATION_LABELS[r.classification] : ''}</td>
                    <td className="num">{r.rows > 0 ? `${r.rows.toLocaleString()} rows` : 'Acknowledged'}</td>
                  </tr>
                ))}
                {notImportedRows.map(r => {
                  const pill = DISPO_PILL[r.disposition as Exclude<Disposition, 'imported'>];
                  return (
                    <tr key={r.key}>
                      <td style={{ width: 28 }}>
                        {r.disposition === 'failed'
                          ? <XCircle size={14} style={{ color: 'var(--vl-danger)' }} />
                          : <MinusCircle size={14} style={{ color: 'var(--vl-text-soft)' }} />}
                      </td>
                      <td className="mut" style={r.disposition === 'excluded' ? { textDecoration: 'line-through' } : undefined}>
                        {r.sheetName}
                        {r.reason && <span style={{ display: 'block', fontSize: '11px', color: 'var(--vl-text-soft)', marginTop: 2 }}>{r.reason.replace(/_/g, ' ')}</span>}
                      </td>
                      <td><span className={pill.cls}>{pill.label}</span></td>
                      <td className="num mut">not committed</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {auditVerdict?.divergent && (
            <div className="insight" style={{ marginTop: 16, marginBottom: 0 }}>
              <span className="spark"><AlertTriangle size={17} /></span>
              <div>
                <div className="lbl">TELEMETRY RECONCILIATION</div>
                <p style={{ fontSize: '12.5px', color: 'var(--vl-text-muted)', margin: 0 }}>
                  Telemetry reconciliation: the settle audit found {auditVerdict.fields?.length ?? 0} field
                  {(auditVerdict.fields?.length ?? 0) === 1 ? '' : 's'} where the live counters diverged from
                  scanned truth ({(auditVerdict.fields ?? []).join(', ')}). Scanned truth is recorded on the
                  session record for review.
                </p>
              </div>
            </div>
          )}

          {telemetry && (
            <>
              <div style={{ height: 1, background: 'var(--vl-line)', margin: '24px 0' }} />
              <div className="card" style={{ marginTop: 0, background: 'var(--vl-bg)' }}>
                <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10px', fontWeight: 'var(--vl-fw-bold)' as unknown as number, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 12px' }}>Intelligence Summary</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                  <div>
                    <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-success)', margin: '0 0 6px' }}>Recognized</p>
                    <Conclusion isVialuce label="Recognized Patterns" value={telemetry.atoms.claimedFromMemory.toLocaleString()} accent={telemetry.atoms.claimedFromMemory > 0} />
                    <Conclusion isVialuce label="Field Mappings Applied" value={`${telemetry.fieldBindingsInjected}`} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vialuce-indigo)', margin: '0 0 6px' }}>Learned</p>
                    <Conclusion isVialuce label="New Patterns Learned" value={telemetry.atoms.novelComprehended.toLocaleString()} />
                    <Conclusion isVialuce label="Data Signatures Stored" value={`${telemetry.fingerprints.storedNew}`} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 6px' }}>Processed</p>
                    <Conclusion isVialuce label="AI Analysis Steps" value={`${telemetry.llm.made}`} />
                    <Conclusion isVialuce label="Quality Signals Captured" value={telemetry.totalSignalsWritten.toLocaleString()} />
                    <Conclusion isVialuce label="Records Committed" value={telemetry.rows.committed.toLocaleString()} />
                  </div>
                </div>
              </div>
            </>
          )}

          {results.some(r => !r.success) && onRetryFailed && (
            <div style={{ marginTop: 16 }}>
              <button onClick={onRetryFailed} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: 'var(--vialuce-gold)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <RotateCcw size={14} /> Retry failed items
              </button>
            </div>
          )}
        </div>

        {/* Carrier intelligence briefing → gold insight */}
        {carrier && (
          <div className="insight" style={{ marginBottom: 0, flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className="spark"><Activity size={17} /></span>
              <div style={{ flex: 1 }}>
                <div className="lbl">CARRIER INTELLIGENCE</div>
                <p style={{ fontSize: '14px', color: 'var(--vl-text)', margin: 0 }}>
                  {carrier.dataSnapshot.totalRows.toLocaleString()} rows · {carrier.entities.total.toLocaleString()} entit{carrier.entities.total !== 1 ? 'ies' : 'y'} · {carrier.dataSnapshot.contentUnits.length} content unit{carrier.dataSnapshot.contentUnits.length !== 1 ? 's' : ''}
                </p>
                {(() => {
                  const note = confidenceNote(carrier.classification.avgConfidence);
                  return note ? (
                    <p style={{ fontSize: '13px', fontWeight: 'var(--vl-fw-med)' as unknown as number, color: note.label.startsWith('High') ? 'var(--vl-success)' : note.label.startsWith('Low') ? 'var(--vl-danger)' : 'var(--vialuce-gold)', margin: '6px 0 0' }}>{carrier.classification.avgConfidence}% — {note.label}</p>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        )}

        {/* HF-318 — prioritized CTAs. PRIMARY gold "Go to Calculate" → /operate (the Lifecycle Cockpit,
            the natural next step — the cockpit guides Configure/Import/Calculate from there). SECONDARY
            "Review Data Quality" (was "Review Bindings"). TERTIARY ghosts. User language throughout. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/operate')} className="btn-gold">
            Go to Calculate <ArrowRight size={16} />
          </button>
          <button onClick={() => router.push('/operate/import/quarantine')} className="btn-pri">
            Review Data Quality <ArrowRight size={16} />
          </button>
          <button onClick={onImportMore} className="btn-sec">
            <Upload size={16} /> Import More Data
          </button>
          <button onClick={() => router.push('/stream')} style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--vialuce-indigo)', background: 'none', border: 'none', cursor: 'pointer' }}>
            View in Intelligence &rarr;
          </button>
        </div>

        {/* Guidance — plan-aware next action */}
        <div style={{ fontSize: '12px', color: 'var(--vl-text-soft)', textAlign: 'center' }}>
          {!hasData
            ? 'No data imported. Import data to enable calculation.'
            : !hasPlan
              ? 'Imported data is saved. The cockpit will guide you to configure a plan before calculating.'
              : 'Import complete. Go to Calculate to run calculations, or import additional data.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-6">
        <div className="flex items-center gap-2 mb-6">
          {notImportedRows.length > 0 ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <Check className="w-5 h-5 text-emerald-400" />}
          <h2 className="text-base font-medium text-zinc-100">{title}</h2>
        </div>

        {/* Stat boxes — Components shown only when a plan exists (D10.2: no placeholder) */}
        <div className={cn('grid gap-6 mb-6', hasPlan ? (sourceDateRange ? 'grid-cols-3' : 'grid-cols-2') : (sourceDateRange ? 'grid-cols-2' : 'grid-cols-1'))}>
          <div className="text-center">
            <p className="text-2xl text-zinc-100 font-light tabular-nums">{committedRows.toLocaleString()}</p>
            <p className="text-xs text-zinc-500 mt-1">Records imported</p>
          </div>
          {sourceDateRange && (
            <div className="text-center">
              <p className="text-lg text-zinc-100 font-light">{sourceDateRange.min} — {sourceDateRange.max}</p>
              <p className="text-xs text-zinc-500 mt-1">Source date range</p>
            </div>
          )}
          {hasPlan && (
            <div className="text-center">
              <p className="text-2xl text-zinc-100 font-light tabular-nums">{componentCount != null ? componentCount.toString() : '—'}</p>
              <p className="text-xs text-zinc-500 mt-1">Components</p>
            </div>
          )}
        </div>

        {/* Context — Plan row only when a plan exists (D10.2) */}
        {(hasPlan || sourceDateRange) && (
          <>
            <div className="h-px bg-zinc-800 mb-6" />
            <div className="space-y-2.5 mb-6">
              {hasPlan && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-zinc-500">Plan</span>
                  <span className="text-sm text-zinc-200">{planName}</span>
                </div>
              )}
              {sourceDateRange && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-zinc-500">Source dates</span>
                  <span className="text-sm text-zinc-200">{sourceDateRange.min} through {sourceDateRange.max}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Session summary (truthful) */}
        <div className="h-px bg-zinc-800 mb-6" />
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
          Session — {importedCount} of {total} units imported · {committedRows.toLocaleString()} rows
          {notImportedRows.length > 0 && ` · ${notImportedRows.length} not imported`}
        </p>
        <div className="space-y-0.5">
          {importedRows.map(r => (
            <div key={r.key} className="flex items-center gap-3 px-3 py-2 rounded-lg">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-2.5 h-2.5 text-emerald-400" />
              </div>
              <span className="text-sm text-zinc-300 flex-1 min-w-0 truncate">{r.sheetName}</span>
              {r.classification && <span className="text-xs text-zinc-600 flex-shrink-0">{CLASSIFICATION_LABELS[r.classification]}</span>}
              <span className="text-xs text-zinc-500 tabular-nums w-20 text-right flex-shrink-0">{r.rows > 0 ? `${r.rows.toLocaleString()} rows` : 'Acknowledged'}</span>
            </div>
          ))}
          {/* D10.1: excluded / failed units MUST appear — the user's decision is not erased */}
          {notImportedRows.map(r => {
            const chip = DISPO_CHIP[r.disposition as Exclude<Disposition, 'imported'>];
            return (
              <div key={r.key} className="px-3 py-2 rounded-lg opacity-70">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-zinc-600/20 flex items-center justify-center flex-shrink-0">
                    {r.disposition === 'failed' ? <XCircle className="w-2.5 h-2.5 text-rose-400" /> : <MinusCircle className="w-2.5 h-2.5 text-zinc-400" />}
                  </div>
                  <span className={cn('text-sm flex-1 min-w-0 truncate', r.disposition === 'excluded' ? 'text-zinc-500 line-through' : 'text-zinc-400')}>{r.sheetName}</span>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0', chip.cls)}>{chip.label}</span>
                  <span className="text-xs text-zinc-600 tabular-nums w-20 text-right flex-shrink-0">not committed</span>
                </div>
                {/* D18: the failure REASON persists — the story is not erased ("plan interpretation found zero components"). */}
                {r.reason && <p className="text-[11px] text-zinc-500 mt-1 ml-7">{r.reason.replace(/_/g, ' ')}</p>}
              </div>
            );
          })}
        </div>

        {/* OB-203 Phase D: settle-audit reconciliation flag — truth-telling, never silent
            self-correction. Rendered only when the audit found accumulated != scanned. */}
        {auditVerdict?.divergent && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-amber-300/90">
              Telemetry reconciliation: the settle audit found {auditVerdict.fields?.length ?? 0} field
              {(auditVerdict.fields?.length ?? 0) === 1 ? '' : 's'} where the live counters diverged from
              scanned truth ({(auditVerdict.fields ?? []).join(', ')}). Scanned truth is recorded on the
              session record for review.
            </p>
          </div>
        )}

        {/* 2.2 conclusion centerpiece: the Progressive-Performance story — what memory SAVED (first, the
            payoff), what was LEARNED, what it COST. Durable telemetry, persisted on the screen. */}
        {telemetry && (
          <>
            <div className="h-px bg-zinc-800 my-6" />
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">What just happened</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1.5">Memory saved</p>
                  <Conclusion label="LLM calls bypassed" value={`${telemetry.llm.bypassedByMemory}`} accent={telemetry.llm.bypassedByMemory > 0} />
                  <Conclusion label="Atoms recalled" value={telemetry.atoms.claimedFromMemory.toLocaleString()} />
                  <Conclusion label="Bindings injected" value={`${telemetry.fieldBindingsInjected}`} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-sky-400/80 mb-1.5">Learned</p>
                  <Conclusion label="Atoms (novel)" value={telemetry.atoms.novelComprehended.toLocaleString()} />
                  <Conclusion label="Fingerprints stored" value={`${telemetry.fingerprints.storedNew}`} />
                  <Conclusion label="Signals captured" value={telemetry.totalSignalsWritten.toLocaleString()} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400/80 mb-1.5">Cost</p>
                  <Conclusion label="LLM calls made" value={`${telemetry.llm.made}`} />
                  <Conclusion label="Rows committed" value={telemetry.rows.committed.toLocaleString()} />
                  <Conclusion label="Pulses" value={`${telemetry.pulses.committed}`} />
                </div>
              </div>
            </div>
          </>
        )}

        {results.some(r => !r.success) && onRetryFailed && (
          <div className="mt-4">
            <button onClick={onRetryFailed} className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Retry failed items
            </button>
          </div>
        )}
      </div>

      {/* OB-205 / DS-029 §5: carrier intelligence briefing — the confidence bridge.
          Summary + classification confidence + a forward action derived from pipeline
          readiness, plus a path into the stream. Augments (does not replace) the
          existing Go-to-Calculate action below. */}
      {carrier && (
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-indigo-400" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Carrier intelligence</p>
          </div>
          <p className="text-sm text-zinc-200">
            {carrier.dataSnapshot.totalRows.toLocaleString()} rows · {carrier.entities.total.toLocaleString()} entit{carrier.entities.total !== 1 ? 'ies' : 'y'} · {carrier.dataSnapshot.contentUnits.length} content unit{carrier.dataSnapshot.contentUnits.length !== 1 ? 's' : ''}
          </p>
          {(() => {
            const note = confidenceNote(carrier.classification.avgConfidence);
            return note ? <p className={cn('text-xs mt-1', note.cls)}>{carrier.classification.avgConfidence}% — {note.label}</p> : null;
          })()}
          <div className="mt-4 flex items-center gap-3">
            {(() => {
              const r = carrier.pipelineReadiness;
              if (r.hasPlan && r.hasBindings) {
                return <button onClick={onNavigateToCalculate} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Calculate <ArrowRight className="w-4 h-4" /></button>;
              }
              if (!r.hasPlan) {
                return <button onClick={() => router.push('/operate/import')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Upload Plan <ArrowRight className="w-4 h-4" /></button>;
              }
              return <button onClick={() => router.push('/operate/calculate')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Review Bindings <ArrowRight className="w-4 h-4" /></button>;
            })()}
            <button onClick={() => router.push('/stream')} className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors">View in Stream &rarr;</button>
          </div>
        </div>
      )}

      {/* Actions — plan-aware (D10.2) */}
      <div className="flex items-center justify-between">
        <button onClick={onImportMore} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors">
          <Upload className="w-4 h-4" /> Import more data
        </button>
        {hasPlan && (
          <button onClick={onNavigateToCalculate} disabled={!calculateReady}
            className={cn('flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-colors',
              calculateReady ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed')}>
            Go to Calculate <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Guidance — plan-aware next action (D10.2) */}
      <div className="text-xs text-zinc-500 text-center">
        {!hasData
          ? 'No data imported. Import data to enable calculation.'
          : !hasPlan
            ? 'Imported data is saved. A plan is needed before calculation — configure one to continue.'
            : 'Import complete. Go to Calculate to run calculations, or import additional data.'}
      </div>
    </div>
  );
}
