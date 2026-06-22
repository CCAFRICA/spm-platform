/**
 * OB-228 Phase 6 — persona → canvas-renderer dispatch (Concept ⑧ seam). The persona
 * resolved by the seam selects the renderer via a MAP with a deferred-renderer fallback.
 * ONLY AdminCanvas exists this OB; RepCanvas/ManagerCanvas are OB-229 slot-fills — adding
 * them is a map entry, NOT a refactor (the seam already resolves scope + persona). This is
 * the literal "the admin is the first view but the persona will be important" architecture.
 */
'use client';
import { Users } from 'lucide-react';
import type { PlanStructure, CanonicalComponent } from '@/lib/plan-surface';
import { PlanCanvas, type PeriodOption } from './PlanCanvas';

export interface PersonaCanvasProps {
  plan: PlanStructure;
  periods: PeriodOption[];
  selectedPeriodId: string | null;
  onPeriodChange: (id: string) => void;
  canEdit: boolean;
  editLabel: string;
  onEditComponent?: (c: CanonicalComponent, variantId: string) => void;
  isSpanish: boolean;
}

/** Admin refraction — the editable canvas + confidence/provenance overlays. */
function AdminCanvas(props: PersonaCanvasProps) {
  return (
    <PlanCanvas
      plan={props.plan}
      periods={props.periods}
      selectedPeriodId={props.selectedPeriodId}
      onPeriodChange={props.onPeriodChange}
      canEdit={props.canEdit}
      editLabel={props.editLabel}
      onEditComponent={props.onEditComponent}
    />
  );
}

/** Deferred refraction slot (Rep / Manager) — OB-229. The seam still resolved scope +
 *  persona correctly; only the rendered refraction is pending. */
function DeferredPersonaCanvas({ persona, isSpanish }: { persona: string; isSpanish: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <Users className="h-9 w-9 mx-auto mb-3 text-muted-foreground/50" />
      <div className="text-foreground font-medium capitalize">{persona} {isSpanish ? 'refracción' : 'refraction'}</div>
      <div className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        {isSpanish
          ? 'La refracción de este plan para este persona se entrega en OB-229. El seam ya resolvió el alcance correctamente.'
          : 'This persona’s refraction of the plan ships in OB-229. The seam already resolved scope correctly — only the rendered view is pending.'}
      </div>
    </div>
  );
}

const PERSONA_CANVAS: Record<string, (props: PersonaCanvasProps) => React.ReactNode> = {
  admin: AdminCanvas,
};

/** Resolve the canvas renderer for a persona — deferred-renderer fallback (slot for OB-229). */
export function resolvePersonaCanvas(persona: string): (props: PersonaCanvasProps) => React.ReactNode {
  return PERSONA_CANVAS[persona] ?? ((props: PersonaCanvasProps) => <DeferredPersonaCanvas persona={persona || 'rep'} isSpanish={props.isSpanish} />);
}
