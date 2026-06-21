'use client';

/**
 * HF-324 O3 — financial drill-through cheque list. Renders the cheques behind a leakage category /
 * location / server, via the additive 'cheques' route mode. Korean Test: labels via useLocale;
 * amounts via useCurrency; Vialuce-aware surface.
 */
import { useEffect, useState } from 'react';
import { useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { loadChequesData, type ChequeDrillData } from '@/lib/financial/financial-data-service';

interface ChequeListProps {
  tenantId: string;
  entityId?: string;
  meseroId?: string;
  leakageCategory?: string;
  /** which leakage column to emphasise: 'descuentos' | 'cortesias' | 'cancelaciones' */
  emphasis?: string;
}

export function ChequeList({ tenantId, entityId, meseroId, leakageCategory, emphasis }: ChequeListProps) {
  const { format } = useCurrency();
  const { locale } = useLocale();
  const es = locale === 'es-MX';
  const [data, setData] = useState<ChequeDrillData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadChequesData(tenantId, { entityId, meseroId, leakageCategory })
      .then(d => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, entityId, meseroId, leakageCategory]);

  if (loading) return <div className="py-4 text-center text-xs text-muted-foreground">{es ? 'Cargando…' : 'Loading…'}</div>;
  if (!data || data.cheques.length === 0) return <div className="py-4 text-center text-xs text-muted-foreground">{es ? 'Sin cheques' : 'No cheques'}</div>;

  const leakCol = emphasis === 'cortesias' ? 'total_cortesias' : 'total_descuentos';
  const showLeak = emphasis === 'descuentos' || emphasis === 'cortesias';

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--vl-surface, rgba(24,24,27,0.5))', border: '1px solid var(--vl-line, rgba(63,63,70,0.5))' }}>
      <div className="px-3 py-2 text-xs text-muted-foreground border-b" style={{ borderColor: 'var(--vl-line, rgba(63,63,70,0.5))' }}>
        {es ? 'Cheques' : 'Cheques'}: {data.total_count.toLocaleString()}{data.capped ? ` (${es ? 'mostrando' : 'showing'} ${data.cheques.length})` : ''}
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-3 py-1.5 font-medium">{es ? 'Fecha' : 'Date'}</th>
              <th className="px-3 py-1.5 font-medium">{es ? 'Ubicación' : 'Location'}</th>
              <th className="px-3 py-1.5 font-medium text-right">{es ? 'Total' : 'Total'}</th>
              {showLeak && <th className="px-3 py-1.5 font-medium text-right">{es ? 'Fuga' : 'Leakage'}</th>}
            </tr>
          </thead>
          <tbody>
            {data.cheques.map((c, i) => (
              <tr key={`${c.numero_cheque}-${i}`} className="border-t" style={{ borderColor: 'var(--vl-line, rgba(63,63,70,0.3))' }}>
                <td className="px-3 py-1.5 tabular-nums">{c.numero_cheque}</td>
                <td className="px-3 py-1.5 tabular-nums">{String(c.fecha).slice(0, 10)}</td>
                <td className="px-3 py-1.5">{c.location}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{format(c.total)}</td>
                {showLeak && <td className="px-3 py-1.5 text-right tabular-nums">{format(Number(c[leakCol as 'total_descuentos' | 'total_cortesias']))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
