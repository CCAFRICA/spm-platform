/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — MatrixRenderer: the 2-D grid VISUAL, dispatched by structural shape (matrix).
 * Reads a 2-D structure from the component's compositional intent when present; falls
 * back to the structural step list otherwise. Leaf (no renderer imports). MIR has no
 * matrix components today; this renders any tenant whose interpreter emits a grid.
 */
'use client';
import { Grid3x3 } from 'lucide-react';
import { fmtRate, StepLine, type RendererProps } from './shared';

export function MatrixRenderer({ component, view }: RendererProps) {
  const ci = (component.config?.compositionalIntent as any)?.structure;
  const grid = findGrid(ci);
  if (!grid) return <div className="space-y-1">{view.steps.map((s, i) => <StepLine key={i} label={s.label} detail={s.detail} />)}</div>;
  const { rows, cols, values } = grid;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Grid3x3 className="h-3.5 w-3.5" />2-D lookup</div>
      <div className="overflow-auto rounded-md border border-border">
        <table className="text-sm w-full">
          <thead><tr className="bg-muted/50 text-[11px] text-muted-foreground"><th className="px-2 py-1.5" /></tr>{cols.length > 0 && (
            <tr className="bg-muted/50 text-[11px] text-muted-foreground"><th className="px-2 py-1.5 text-left font-normal" />{cols.map((c, i) => <th key={i} className="px-2 py-1.5 text-right font-normal">{String(c)}</th>)}</tr>)}
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, ri) => (
              <tr key={ri}><td className="px-2 py-1.5 text-muted-foreground">{String(r)}</td>{cols.map((_, ci2) => <td key={ci2} className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--vl-kpi-accent, #4446B8)' }}>{values[ri]?.[ci2] != null ? fmtRate(values[ri][ci2]) : '—'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function findGrid(struct: any): { rows: unknown[]; cols: unknown[]; values: any[][] } | null {
  if (!struct || typeof struct !== 'object') return null;
  const dims = struct.dimensions;
  if (Array.isArray(struct.values) && Array.isArray(struct.values[0]) && Array.isArray(dims) && dims.length >= 2) {
    return { rows: dims[0]?.breaks ?? [], cols: dims[1]?.breaks ?? [], values: struct.values };
  }
  if (Array.isArray(struct.operands)) for (const op of struct.operands) { const g = findGrid(op?.structure ?? op); if (g) return g; }
  return null;
}
