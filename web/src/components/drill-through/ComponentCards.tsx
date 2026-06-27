'use client';

/**
 * OB-224 — ComponentCards: drill layers 3+4 (component breakdown → per-transaction trace).
 *
 * AP-17: consumes the OB-219 statement (getEntityStatement → getCommissionStatement). Each component
 * card shows name / plan / pattern / payout, and — when per-row traces exist — an expandable trace
 * table (ref, date, formula, contribution) built straight from the statement (no second query).
 * Graceful fallback (substrate §3.1: traces only for BCL/MIR): components with no traces render
 * payout-only with an honest "entity-level" note. comparisonData overlays expected/delta
 * (reconciliation context). onTransactionDrill / onDispute let a host (DrillThroughPanel) own the
 * expansion; absent them, the card self-manages source-data and dispute inline.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useCurrency } from '@/contexts/tenant-context';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { StatusPill } from '@/components/design-system';
import { getEntityStatement, type CommissionStatement, type StatementComponent } from '@/lib/drill-through';
import { TransactionRows } from './TransactionRows';
import { DisputeInline } from './DisputeInline';

interface Props {
  tenantId: string;
  entityId: string;
  periodId: string;
  batchId?: string;
  entityName?: string;
  periodLabel?: string;
  comparisonData?: Record<string, { expected: number; delta: number }>;
  onTransactionDrill?: (componentName: string) => void;
  onDispute?: (componentName: string, amount: number) => void;
}

const patternColor = (p: string): 'indigo' | 'emerald' | 'rose' | 'zinc' =>
  p === 'clawback' ? 'rose' : p === 'qualified' ? 'emerald' : p === 'additive' ? 'indigo' : 'zinc';

export function ComponentCards(props: Props) {
  const { tenantId, entityId, periodId, batchId, comparisonData, onTransactionDrill, onDispute } = props;
  const isVialuce = useIsVialuce();
  const { format } = useCurrency();
  const { formatDate, locale } = useLocale();
  const isEs = isSpanishLocale(locale);
  // HF-346 PG-11: this is the rep's PRIMARY breakdown surface; localize its chrome (Spanish tenants
  // BCL/MIR/Sabor were seeing English-only labels here).
  const L = {
    loading: isEs ? 'Cargando desglose…' : 'Loading breakdown…',
    none: isEs ? 'No hay desglose de cálculo disponible para esta entidad y periodo.' : 'No calculation breakdown available for this entity and period.',
    txns: (n: number) => isEs ? `${n} ${n === 1 ? 'transacción' : 'transacciones'}` : `${n} transaction${n === 1 ? '' : 's'}`,
    traced: isEs ? 'trazado' : 'traced',
    entityLevel: isEs ? 'Resultado a nivel de entidad — sin desglose por transacción para este componente.' : 'Entity-level result — no per-transaction breakdown for this component.',
    source: isEs ? 'Datos fuente' : 'Source data',
    dispute: isEs ? 'Disputar' : 'Dispute',
    ref: 'Ref', date: isEs ? 'Fecha' : 'Date', detail: isEs ? 'Detalle' : 'Detail', contribution: isEs ? 'Contribución' : 'Contribution',
  };
  const [stmt, setStmt] = useState<CommissionStatement | null | undefined>(undefined);
  const [openTraces, setOpenTraces] = useState<Record<string, boolean>>({});
  const [openSource, setOpenSource] = useState<string | null>(null);   // self-managed source rows
  const [openDispute, setOpenDispute] = useState<{ name: string; amount: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setStmt(undefined);
    getEntityStatement(tenantId, entityId, periodId)
      .then(s => alive && setStmt(s))
      .catch(() => alive && setStmt(null));
    return () => { alive = false; };
  }, [tenantId, entityId, periodId]);

  const entityName = props.entityName ?? stmt?.entity.displayName;
  const periodLabel = props.periodLabel ?? stmt?.period.label;

  if (stmt === undefined) {
    return <p className={isVialuce ? 'mut' : 'text-xs text-zinc-500'} style={isVialuce ? { padding: '12px 4px', fontSize: 12, color: 'var(--vl-text-soft)' } : undefined}>{L.loading}</p>;
  }
  if (stmt === null || stmt.components.length === 0) {
    return <p className={isVialuce ? 'mut' : 'text-xs text-zinc-500'} style={isVialuce ? { padding: '12px 4px', fontSize: 12, color: 'var(--vl-text-soft)' } : undefined}>{L.none}</p>;
  }

  const fmtInputs = (inputs: Record<string, unknown>): string =>
    Object.entries(inputs).map(([k, v]) => `${k}=${typeof v === 'number' ? v : String(v)}`).join(', ');

  const handleSource = (name: string) => {
    if (onTransactionDrill) onTransactionDrill(name);
    else setOpenSource(prev => (prev === name ? null : name));
  };
  const handleDispute = (c: StatementComponent) => {
    if (onDispute) onDispute(c.name, c.payout);
    else setOpenDispute(prev => (prev?.name === c.name ? null : { name: c.name, amount: c.payout }));
  };

  const cards = stmt.components.map((c) => {
    const cmp = comparisonData?.[c.name];
    const traceOpen = !!openTraces[c.name];

    if (isVialuce) {
      return (
        <div key={c.name} className="card" style={{ borderLeft: `3px solid ${c.payout < 0 ? 'var(--vl-danger)' : 'var(--vl-kpi-accent)'}` }}>
          <div className="card-h" style={{ alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)', margin: 0 }}>{c.name}</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <StatusPill color={patternColor(c.pattern)}>{c.pattern}</StatusPill>
                {c.planName && <span style={{ fontSize: 11, color: 'var(--vl-text-soft)' }}>{c.planName}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 18, fontWeight: 'var(--vl-fw-med)' as unknown as number, color: c.payout < 0 ? 'var(--vl-danger)' : 'var(--vl-text)', margin: 0 }}>{format(c.payout)}</p>
              {cmp && <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 11, color: Math.abs(cmp.delta) < 0.005 ? 'var(--vl-text-soft)' : cmp.delta > 0 ? 'var(--vl-success)' : 'var(--vl-danger)', margin: '2px 0 0' }}>exp {format(cmp.expected)} · Δ {cmp.delta >= 0 ? '+' : ''}{format(cmp.delta)}</p>}
            </div>
          </div>

          {c.attributable && c.transactions.length > 0 ? (
            <div>
              <button onClick={() => setOpenTraces(p => ({ ...p, [c.name]: !p[c.name] }))} className="gbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {traceOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {L.txns(c.transactions.length)} · {L.traced} {format(c.tracedSubtotal)}
              </button>
              {traceOpen && (
                <div className="card flush" style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead><tr><th>{L.ref}</th><th>{L.date}</th><th>{L.detail}</th><th className="r">{L.contribution}</th></tr></thead>
                    <tbody>
                      {c.transactions.map(t => (
                        <tr key={t.committedDataId + (t.transactionRef ?? '')}>
                          <td className="name">{t.transactionRef ?? '—'}</td>
                          <td className="mut">{t.sourceDate ? formatDate(new Date(t.sourceDate)) : '—'}</td>
                          <td className="mut">{t.formula ?? fmtInputs(t.inputs)}</td>
                          <td className={`num ${t.contribution < 0 ? 'down' : ''}`}>{format(t.contribution)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--vl-text-soft)', margin: 0 }}>{L.entityLevel}</p>
          )}

          <div className="pactions" style={{ marginTop: 10 }}>
            <button onClick={() => handleSource(c.name)} className="btn-sec">{L.source}</button>
            <button onClick={() => handleDispute(c)} className="btn-sec">{L.dispute}</button>
          </div>

          {!onTransactionDrill && openSource === c.name && (
            <div style={{ marginTop: 10 }}><TransactionRows tenantId={tenantId} entityId={entityId} periodId={periodId} /></div>
          )}
          {!onDispute && openDispute?.name === c.name && (
            <DisputeInline tenantId={tenantId} entityId={entityId} periodId={periodId} batchId={batchId} componentName={c.name} amount={c.payout} entityName={entityName} periodLabel={periodLabel} onClose={() => setOpenDispute(null)} />
          )}
        </div>
      );
    }

    return (
      <div key={c.name} className={`rounded-xl border p-4 ${c.payout < 0 ? 'border-rose-500/30 bg-rose-500/[0.04]' : 'border-zinc-800 bg-zinc-900/40'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-100 font-medium">{c.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusPill color={patternColor(c.pattern)}>{c.pattern}</StatusPill>
              {c.planName && <span className="text-[11px] text-zinc-500">{c.planName}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className={`text-lg font-semibold tabular-nums ${c.payout < 0 ? 'text-rose-300' : 'text-slate-100'}`}>{format(c.payout)}</p>
            {cmp && <p className={`text-[11px] tabular-nums ${Math.abs(cmp.delta) < 0.005 ? 'text-zinc-500' : cmp.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>exp {format(cmp.expected)} · Δ {cmp.delta >= 0 ? '+' : ''}{format(cmp.delta)}</p>}
          </div>
        </div>

        {c.attributable && c.transactions.length > 0 ? (
          <div className="mt-2">
            <button onClick={() => setOpenTraces(p => ({ ...p, [c.name]: !p[c.name] }))} className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200">
              {traceOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {L.txns(c.transactions.length)} · {L.traced} {format(c.tracedSubtotal)}
            </button>
            {traceOpen && (
              <div className="mt-2 rounded-lg border border-zinc-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">{L.ref}</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">{L.date}</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500">{L.detail}</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500">{L.contribution}</th>
                  </tr></thead>
                  <tbody>
                    {c.transactions.map(t => (
                      <tr key={t.committedDataId + (t.transactionRef ?? '')} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-3 py-1.5 text-slate-300">{t.transactionRef ?? '—'}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{t.sourceDate ? formatDate(new Date(t.sourceDate)) : '—'}</td>
                        <td className="px-3 py-1.5 text-zinc-400">{t.formula ?? fmtInputs(t.inputs)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${t.contribution < 0 ? 'text-rose-300' : 'text-slate-200'}`}>{format(t.contribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">{L.entityLevel}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button onClick={() => handleSource(c.name)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-zinc-800">{L.source}</button>
          <button onClick={() => handleDispute(c)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-zinc-800">{L.dispute}</button>
        </div>

        {!onTransactionDrill && openSource === c.name && (
          <div className="mt-3"><TransactionRows tenantId={tenantId} entityId={entityId} periodId={periodId} /></div>
        )}
        {!onDispute && openDispute?.name === c.name && (
          <DisputeInline tenantId={tenantId} entityId={entityId} periodId={periodId} batchId={batchId} componentName={c.name} amount={c.payout} entityName={entityName} periodLabel={periodLabel} onClose={() => setOpenDispute(null)} />
        )}
      </div>
    );
  });

  return <div className={isVialuce ? '' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{cards}</div>;
}
