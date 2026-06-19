'use client';

import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface AnomalyMatrixProps {
  entities: string[];
  metrics: string[];
  values: number[][]; // normalized -1 to 1, rows=entities, cols=metrics
  onCellClick?: (entityIdx: number, metricIdx: number) => void;
}

function cellColor(val: number): string {
  const abs = Math.abs(val);
  if (abs < 0.1) return 'bg-zinc-800';
  if (val > 0) {
    if (abs > 0.7) return 'bg-emerald-500/60';
    if (abs > 0.4) return 'bg-emerald-500/35';
    return 'bg-emerald-500/15';
  }
  if (abs > 0.7) return 'bg-rose-500/60';
  if (abs > 0.4) return 'bg-rose-500/35';
  return 'bg-rose-500/15';
}

// HF-316: design-spec cell fill — positive deviations ramp the indigo scale, negative ramp danger.
function cellColorVialuce(val: number): string {
  const abs = Math.abs(val);
  if (abs < 0.1) return 'var(--vl-line-soft)';
  if (val > 0) {
    if (abs > 0.7) return 'var(--vl-raw-indigo)';
    if (abs > 0.4) return 'var(--vl-raw-indigo-light)';
    return '#9A9CE0';
  }
  if (abs > 0.7) return 'var(--vl-danger)';
  if (abs > 0.4) return 'rgba(220,84,84,.55)';
  return 'rgba(220,84,84,.28)';
}

export function AnomalyMatrix({ entities, metrics, values, onCellClick }: AnomalyMatrixProps) {
  const isVialuce = useIsVialuce(); // HF-316: card-flush + tbl + indigo/danger heat ramp under Vialuce
  if (entities.length === 0 || metrics.length === 0) {
    if (isVialuce) {
      return (
        <div className="empty">
          <div className="ic">▦</div>
          <b>Sin datos de anomalias.</b>
        </div>
      );
    }
    return <p className="text-sm text-zinc-400">Sin datos de anomalias.</p>;
  }

  if (isVialuce) {
    return (
      <div className="card flush" style={{ marginTop: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-24" />
              {metrics.map((m, ci) => (
                <th key={ci} className="max-w-[60px] truncate" style={{ textAlign: 'center' }}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entities.map((entity, ri) => (
              <tr key={ri}>
                <td className="name truncate max-w-[96px]" style={{ padding: '6px 12px' }}>{entity}</td>
                {metrics.map((_, ci) => {
                  const val = values[ri]?.[ci] ?? 0;
                  return (
                    <td key={ci} style={{ padding: '4px', borderTop: '1px solid var(--vl-line-soft)' }}>
                      <button
                        onClick={() => onCellClick?.(ri, ci)}
                        className="w-full h-5 transition-all"
                        style={{ borderRadius: '4px', background: cellColorVialuce(val) }}
                        title={`${entity} · ${metrics[ci]}: ${(val * 100).toFixed(0)}%`}
                        aria-label={`${entity} ${metrics[ci]} deviation ${(val * 100).toFixed(0)}%`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] text-zinc-400 font-normal pb-1 pr-2 w-24" />
            {metrics.map((m, ci) => (
              <th key={ci} className="text-center text-[10px] text-zinc-400 font-normal pb-1 px-0.5 max-w-[60px] truncate">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity, ri) => (
            <tr key={ri}>
              <td className="text-[11px] text-zinc-400 pr-2 py-0.5 truncate max-w-[96px]">{entity}</td>
              {metrics.map((_, ci) => {
                const val = values[ri]?.[ci] ?? 0;
                return (
                  <td key={ci} className="px-0.5 py-0.5">
                    <button
                      onClick={() => onCellClick?.(ri, ci)}
                      className={`w-full h-5 rounded-sm ${cellColor(val)} hover:ring-1 hover:ring-zinc-500 transition-all`}
                      title={`${entity} · ${metrics[ci]}: ${(val * 100).toFixed(0)}%`}
                      aria-label={`${entity} ${metrics[ci]} deviation ${(val * 100).toFixed(0)}%`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
