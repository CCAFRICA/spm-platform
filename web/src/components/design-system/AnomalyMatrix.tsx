'use client';

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

export function AnomalyMatrix({ entities, metrics, values, onCellClick }: AnomalyMatrixProps) {
  if (entities.length === 0 || metrics.length === 0) {
    return <p className="text-sm text-zinc-500">Sin datos de anomalias.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] text-zinc-500 font-normal pb-1 pr-2 w-24" />
            {metrics.map((m, ci) => (
              <th key={ci} className="text-center text-[10px] text-zinc-500 font-normal pb-1 px-0.5 max-w-[60px] truncate">
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
