/**
 * OB-228 — PrimeDagRenderer: the renderer for MIR's dialect (componentType prime_dag).
 * Renders the calculationIntent "made visible" (DS-029 §3-1). It dispatches on the
 * analyzer's STRUCTURAL SHAPE (the platform's real variety, since componentType is
 * uniformly prime_dag) to bespoke visual renderers — band/tier ladders, gated
 * conditionals, rate chips, 2-D grids — with a generic structural outline as the
 * shape-fallback. Korean-Test clean: shapes are derived from the prime-DAG structure,
 * never a hardcoded field/value/legacy-name vocabulary; an unfamiliar shape degrades
 * to the outline, never errors.
 */
'use client';
import { Rocket, Sigma, RotateCcw, ArrowRight, Hash } from 'lucide-react';
import { Chip, StepLine, fmtNum, type RendererProps } from './shared';
import { TierRenderer } from './TierRenderer';
import { RateRenderer } from './RateRenderer';
import { ConditionalRenderer } from './ConditionalRenderer';
import { MatrixRenderer } from './MatrixRenderer';

type ShapeView = (p: RendererProps) => React.ReactNode;

// Shape dispatch (NOT componentType) — keyed on the analyzer's structural vocabulary.
const SHAPE_VIEWS: Record<string, ShapeView> = {
  banded_lookup: TierRenderer,
  banded_conditional: TierRenderer,
  conditional: ConditionalRenderer,
  filtered_count: RateRenderer,
  matrix: MatrixRenderer,
};

/** The shape-fallback: a structural outline of the prime-DAG steps. Never errors. */
function StructuralOutline({ view }: RendererProps) {
  return (
    <div className="space-y-2.5">
      {view.steps.map((s, i) => {
        switch (s.kind) {
          case 'accelerator': return <StepLine key={i} icon={<Rocket className="h-4 w-4" />} tone="gold" label={s.label} />;
          case 'rollup': return <StepLine key={i} icon={<Sigma className="h-4 w-4" />} tone="accent" label={s.label} />;
          case 'reversal': return <StepLine key={i} icon={<RotateCcw className="h-4 w-4" />} tone="danger" label={s.label} detail={s.detail} />;
          case 'reference': return <StepLine key={i} icon={<ArrowRight className="h-3.5 w-3.5" />} label={s.field ?? s.label} detail={s.detail} />;
          case 'rate': return <div key={i}><Chip tone="accent">{s.label}</Chip></div>;
          default: return <StepLine key={i} icon={<Hash className="h-3.5 w-3.5" />} label={s.label} detail={s.detail} />;
        }
      })}
    </div>
  );
}

export function PrimeDagRenderer(props: RendererProps) {
  const { view } = props;

  // Clawback reversal is a top-level shape regardless of inner structure.
  if (view.isClawback) {
    return (
      <div className="space-y-2">
        <StepLine icon={<RotateCcw className="h-4 w-4" />} tone="danger" label="Clawback (reversal)" detail="Sign-flipped reversal of a prior payout" />
        {view.fieldRefs.map((r, i) => <StepLine key={i} icon={<ArrowRight className="h-3.5 w-3.5" />} label={r.field} detail={r.via} />)}
      </div>
    );
  }

  const Shape = SHAPE_VIEWS[view.shape] ?? StructuralOutline;
  return (
    <div className="space-y-2.5">
      <Shape {...props} />
      {/* accelerators / rollups that accompany a banded shape */}
      {view.shape !== 'conditional' && view.steps.filter((s) => s.kind === 'accelerator' || s.kind === 'rollup').map((s, i) => (
        <StepLine key={`x${i}`} icon={s.kind === 'accelerator' ? <Rocket className="h-4 w-4" /> : <Sigma className="h-4 w-4" />} tone={s.kind === 'accelerator' ? 'gold' : 'accent'} label={s.label} />
      ))}
      {view.shape !== 'conditional' && view.thresholds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {view.thresholds.map((t, i) => <Chip key={i}>{`${t.field ?? 'value'} ${t.op} ${fmtNum(t.value)}`}</Chip>)}
        </div>
      )}
    </div>
  );
}
