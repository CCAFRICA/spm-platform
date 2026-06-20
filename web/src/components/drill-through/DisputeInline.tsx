'use client';

/**
 * OB-224 — DisputeInline: inline (not modal, not a page — Intuitive Adjacency) dispute filing.
 *
 * Pre-populates the read-only context (entity, period, component, amount) and submits a free-text
 * dispute via the data layer under the user's auth context (filed_by = current profile). The full
 * structured 7-category funnel with confidence scoring (OB-68) is a future build on top (R-4);
 * categories are a prop with a generic default so no domain literal is baked in (Korean Test).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useAuth } from '@/contexts/auth-context';
import { useCurrency } from '@/contexts/tenant-context';
import { submitDispute } from '@/lib/drill-through';

interface Props {
  tenantId: string;
  entityId: string;
  periodId: string;
  batchId?: string;
  componentName: string;
  amount: number;
  entityName?: string;
  periodLabel?: string;
  /** Override the category options (e.g. from the ICM domain registration). */
  categories?: string[];
  onClose: () => void;
  onSubmitted?: (disputeId: string) => void;
}

const DEFAULT_CATEGORIES = ['Calculation error', 'Missing transaction', 'Incorrect rate', 'Wrong attainment', 'Other'];

export function DisputeInline({
  tenantId, entityId, periodId, batchId, componentName, amount,
  entityName, periodLabel, categories = DEFAULT_CATEGORIES, onClose, onSubmitted,
}: Props) {
  const isVialuce = useIsVialuce();
  const { user } = useAuth();
  const { format } = useCurrency();
  const [category, setCategory] = useState(categories[0] ?? '');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Please describe the issue.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await submitDispute(tenantId, {
        entityId, periodId, batchId, category, description,
        amountDisputed: amount, filedBy: user?.id ?? null,
      });
      setDisputeId(id);
      onSubmitted?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const context = [entityName, periodLabel, componentName, format(amount)].filter(Boolean).join(' · ');

  if (disputeId) {
    return isVialuce ? (
      <div className="card" style={{ marginTop: 12, borderLeft: '3px solid var(--vl-success)' }}>
        <div className="card-h">
          <p style={{ fontSize: 14, fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)', margin: 0 }}>Dispute submitted</p>
          <button onClick={onClose} className="iact" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--vl-text-muted)' }}>Reference <span style={{ fontFamily: 'var(--vl-font-mono)' }}>{disputeId.slice(0, 8)}</span> — your administrator will review it.</p>
      </div>
    ) : (
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm text-slate-100 font-medium">Dispute submitted</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-zinc-400">Reference <span className="tabular-nums">{disputeId.slice(0, 8)}</span> — your administrator will review it.</p>
      </div>
    );
  }

  if (isVialuce) {
    return (
      <div className="card" style={{ marginTop: 12, borderLeft: '3px solid var(--vl-cta-signal)' }}>
        <div className="card-h">
          <div>
            <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: 0 }}>File a dispute</p>
            <p style={{ fontSize: 13, color: 'var(--vl-text-muted)', margin: '4px 0 0' }}>{context}</p>
          </div>
          <button onClick={onClose} className="iact" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--vl-text-soft)' }}>
            Category
            <select value={category} onChange={e => setCategory(e.target.value)} className="ctl" style={{ display: 'block', marginTop: 4, width: '100%' }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--vl-text-soft)' }}>
            Description
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe what looks wrong…"
              style={{ display: 'block', marginTop: 4, width: '100%', borderRadius: 'var(--vl-r-sm)', border: '1px solid var(--vl-line)', padding: 8, fontSize: 13, fontFamily: 'var(--vl-font-sans)', color: 'var(--vl-text)', background: 'var(--vl-surface)' }} />
          </label>
          {error && <p style={{ fontSize: 12, color: 'var(--vl-danger)' }}>{error}</p>}
          <div className="pactions">
            <button onClick={handleSubmit} disabled={submitting} className="btn-pri">{submitting ? 'Submitting…' : 'Submit dispute'}</button>
            <button onClick={onClose} className="btn-sec">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-amber-300/80">File a dispute</p>
          <p className="text-sm text-slate-300 mt-1">{context}</p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2.5">
        <label className="block text-[11px] text-zinc-500">Category
          <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-slate-200">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-zinc-500">Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe what looks wrong…"
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-slate-200" />
        </label>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={submitting} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit dispute'}</button>
          <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-zinc-800">Cancel</button>
        </div>
      </div>
    </div>
  );
}
