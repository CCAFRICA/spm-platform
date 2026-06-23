'use client';

// OB-233 (DS-030 §5.3 / Obj 9) — the comprehension REPORT: "here's what I understood about your data."
// Replaces a domain-shaped configuration form with a universal, generically-rendered view of
// comprehension_artifacts. ZERO domain vocabulary, ZERO domain conditionals (Korean Test / C3) — it
// renders whatever the system comprehended, in the data's own language, for any tenant/domain. A field
// the user disagrees with is corrected via a free-form signal (POST /api/signals/comprehension-correction).

import { useEffect, useState, useCallback } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface ComprehendedField {
  field_name: string;
  characterization: string;
  data_nature: string | null;
  relationships: string | null;
  aggregation_behavior: string | null;
  identifies: string | null;
  display_label: string | null;
  aggregation_method: string | null;
}

export function ComprehensionReport({ tenantId }: { tenantId?: string }) {
  const isVialuce = useIsVialuce();
  const [fields, setFields] = useState<ComprehendedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [corrected, setCorrected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
        const res = await fetch(`/api/comprehension${qs}`);
        const json = await res.json();
        if (alive) setFields(Array.isArray(json?.fields) ? json.fields : []);
      } catch { /* degrade gracefully */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [tenantId]);

  const correct = useCallback(async (fieldName: string) => {
    const correction = window.prompt(`What does "${fieldName}" actually represent?`);
    if (!correction?.trim()) return;
    try {
      const res = await fetch('/api/signals/comprehension-correction', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fieldName, correction, tenantId }),
      });
      if ((await res.json())?.ok) setCorrected((c) => ({ ...c, [fieldName]: true }));
    } catch { /* never block */ }
  }, [tenantId]);

  if (loading) return null;
  if (fields.length === 0) return null;

  const card = isVialuce
    ? { background: 'var(--vl-surface)', border: '1px solid var(--vl-line)', borderRadius: 12, padding: 20 }
    : undefined;
  const cls = isVialuce ? '' : 'rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-5';

  return (
    <div style={card} className={cls}>
      <h3 className={isVialuce ? '' : 'text-sm font-semibold text-zinc-200 mb-1'}
          style={isVialuce ? { fontSize: 14, fontWeight: 600, color: 'var(--vl-text)', margin: 0 } : undefined}>
        What I understood about your data
      </h3>
      <p className={isVialuce ? '' : 'text-xs text-zinc-500 mb-4'}
         style={isVialuce ? { fontSize: 12, color: 'var(--vl-text-soft)', margin: '2px 0 14px' } : undefined}>
        {fields.length} field{fields.length === 1 ? '' : 's'} comprehended. If a characterization is wrong, correct it.
      </p>
      <div className="space-y-2.5">
        {fields.map((f) => (
          <div key={f.field_name}
               style={isVialuce ? { borderBottom: '1px solid var(--vl-line)', paddingBottom: 10 } : undefined}
               className={isVialuce ? '' : 'border-b border-zinc-700/40 pb-2.5'}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span style={isVialuce ? { fontSize: 13, fontWeight: 600, color: 'var(--vl-text)' } : undefined}
                      className={isVialuce ? '' : 'text-sm font-medium text-zinc-200 truncate'}>
                  {f.display_label || f.field_name}
                </span>
                <code style={isVialuce ? { fontSize: 11, color: 'var(--vl-text-soft)' } : undefined}
                      className={isVialuce ? '' : 'text-[11px] text-zinc-500'}>{f.field_name}</code>
                {f.aggregation_method && (
                  <span style={isVialuce ? { fontSize: 10, color: 'var(--vl-text-soft)', border: '1px solid var(--vl-line)', borderRadius: 4, padding: '1px 5px' } : undefined}
                        className={isVialuce ? '' : 'text-[10px] text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5'}>
                    {f.aggregation_method}
                  </span>
                )}
              </div>
              <button onClick={() => correct(f.field_name)}
                      style={isVialuce ? { fontSize: 11, color: corrected[f.field_name] ? 'var(--vl-success)' : 'var(--vl-text-soft)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' } : undefined}
                      className={isVialuce ? '' : `text-[11px] ${corrected[f.field_name] ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'} whitespace-nowrap`}>
                {corrected[f.field_name] ? 'noted' : "that's not right"}
              </button>
            </div>
            <p style={isVialuce ? { fontSize: 12, color: 'var(--vl-text-soft)', margin: '3px 0 0' } : undefined}
               className={isVialuce ? '' : 'text-xs text-zinc-400 mt-1'}>
              {f.characterization}
              {f.identifies ? ` — identifies ${f.identifies}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
