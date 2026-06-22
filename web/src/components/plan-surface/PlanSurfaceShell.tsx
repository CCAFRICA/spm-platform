/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — PlanSurfaceShell: the three-zone Living Plan Surface (DS-029 §5).
 * Zone A PlanRail (persona-scoped) · Zone B PlanCanvas · Zone C ConsequenceTray (Phase 4).
 * Resolves through the persona seam (the /api/plan-surface/plans route returns the
 * resolved PersonaScope, shown in the header — the seam is live, not stubbed).
 *
 * Theme-robust (Rule 30): Vialuce `.page/.phead` shell under vialuce, `p-6` otherwise;
 * shadcn semantic tokens everywhere so Dark/Bliss render correctly.
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { LayoutGrid, ShieldCheck, Loader2 } from 'lucide-react';
import type { PlanStructure, PersonaScope } from '@/lib/plan-surface';
import { PlanRail } from './PlanRail';
import { PlanCanvas, type PeriodOption } from './PlanCanvas';

interface PlansPayload { persona: PersonaScope; tenantId: string; plans: PlanStructure[] }

export function PlanSurfaceShell({ selectedId }: { selectedId: string | null }) {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const isVialuce = useIsVialuce();
  const router = useRouter();
  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id;

  const [payload, setPayload] = useState<PlansPayload | null>(null);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/plan-surface/plans?tenantId=${tenantId}`).then((r) => r.json()),
      fetch(`/api/periods?tenant_id=${tenantId}`).then((r) => r.json()),
    ])
      .then(([plansData, periodsData]) => {
        if (cancelled) return;
        setPayload(plansData);
        const ps: PeriodOption[] = (periodsData.periods ?? []).map((p: any) => ({ id: p.id, label: p.label }));
        setPeriods(ps);
        setSelectedPeriodId((cur) => cur ?? ps[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setPayload({ persona: {} as PersonaScope, tenantId: tenantId!, plans: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const plans = payload?.plans ?? [];
  const persona = payload?.persona;
  const selectedPlan = useMemo(() => plans.find((p) => p.id === selectedId) ?? null, [plans, selectedId]);
  const totalComponents = plans.reduce((s, p) => s + p.componentCount, 0);

  return (
    <div className={isVialuce ? 'page' : 'p-6'}>
      {/* Zone header — persona seam visible */}
      <div className={isVialuce ? 'phead' : 'flex items-start justify-between gap-4 mb-5'}>
        <div>
          <h1 className={isVialuce ? '' : 'text-2xl font-bold text-foreground flex items-center gap-2'}>
            {!isVialuce && <LayoutGrid className="h-6 w-6" />}
            {isSpanish ? 'Lienzo de Planes' : 'Living Plan Surface'}
          </h1>
          <div className={isVialuce ? 'sub' : 'text-sm text-muted-foreground mt-1'}>
            {isSpanish ? 'Ver, entender y ajustar los componentes de cada plan.' : 'View, understand, and adjust each plan’s components.'}
          </div>
        </div>
        {persona?.persona && (
          <div className="flex items-center gap-2 text-xs rounded-full border border-border px-3 py-1.5" style={{ background: 'var(--vl-indigo-50, #EEF0FB)' }}>
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--vl-kpi-accent, #4446B8)' }} />
            <span className="text-muted-foreground">{isSpanish ? 'Vista' : 'Viewing as'}</span>
            <span className="font-medium capitalize text-foreground">{persona.persona}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{persona.unrestricted ? (isSpanish ? 'todos los planes' : 'all plans') : `${persona.visibleRuleSetIds.length} ${isSpanish ? 'visibles' : 'visible'}`}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />{isSpanish ? 'Cargando planes…' : 'Loading plans…'}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
          {/* Zone A — rail */}
          <aside className="lg:sticky lg:top-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 px-1">{isSpanish ? 'Planes' : 'Plans'} · {plans.length}</div>
            <PlanRail plans={plans} selectedId={selectedId} />
            {totalComponents > 0 && (
              <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
                {totalComponents} {isSpanish ? 'componentes en total' : 'components in total'}
              </div>
            )}
          </aside>

          {/* Zone B — canvas */}
          <main>
            {selectedPlan ? (
              <PlanCanvas
                plan={selectedPlan}
                periods={periods}
                selectedPeriodId={selectedPeriodId}
                onPeriodChange={setSelectedPeriodId}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <div className="text-foreground font-medium">{isSpanish ? 'Selecciona un plan' : 'Select a plan'}</div>
                <div className="text-sm text-muted-foreground mt-1">{isSpanish ? 'Elige un plan del panel para ver su lienzo.' : 'Choose a plan from the rail to open its canvas.'}</div>
                {plans[0] && (
                  <button className="mt-4 text-sm rounded-md px-3 py-1.5" style={{ background: 'var(--vl-cta-primary, #4446B8)', color: '#fff' }} onClick={() => router.push(`/configure/plans/${plans[0].id}`)}>
                    {isSpanish ? `Abrir “${plans[0].name}”` : `Open “${plans[0].name}”`}
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
