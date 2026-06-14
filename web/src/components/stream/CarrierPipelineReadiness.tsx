'use client';

/**
 * OB-205 / DS-029 §4.4 — Pipeline Readiness card.
 *
 * Renders ALWAYS (even with no data — shows an empty pipeline). A horizontal
 * stepper Import → Classify → Bind → Calculate → Reconcile, each ✓ (complete) or
 * ○ (pending) from the pipelineReadiness booleans. The first pending step is the
 * active step and carries exactly ONE primary action. Thermostat, not thermometer.
 */

import { Check } from 'lucide-react';
import { IntelligenceCard } from '@/components/intelligence/IntelligenceCard';
import { CARRIER_PIPELINE_STAGES } from '@/lib/carrier/types';
import type { CarrierIntelligence } from '@/lib/carrier/types';

interface Props {
  carrier: CarrierIntelligence | null;
  accentColor: string;
  onNavigate: (route: string, stage: string) => void;
  onView?: () => void;
}

const RECONCILED_STATES = new Set(['RECONCILED', 'OFFICIAL', 'APPROVED', 'PAID']);

/** Per-stage completion from the readiness booleans. */
function stageComplete(carrier: CarrierIntelligence | null): Record<string, boolean> {
  const r = carrier?.pipelineReadiness;
  const reconciled = !!r?.latestLifecycleState && RECONCILED_STATES.has(r.latestLifecycleState);
  return {
    Import: !!r?.hasData,
    Classify: !!r?.hasEntities,
    Bind: !!r?.hasPlan && !!r?.hasBindings,
    Calculate: !!r?.hasCalculation,
    Reconcile: reconciled,
  };
}

/** The single action for the first pending stage. */
function activeAction(carrier: CarrierIntelligence | null): { stage: string; label: string; route: string } | null {
  const r = carrier?.pipelineReadiness;
  if (!r?.hasData) return { stage: 'Import', label: 'Import Data', route: '/operate/import' };
  if (!r.hasEntities) return { stage: 'Classify', label: 'Import Data', route: '/operate/import' };
  if (!r.hasPlan) return { stage: 'Bind', label: 'Upload Plan', route: '/operate/import' };
  if (!r.hasBindings) return { stage: 'Bind', label: 'Configure Bindings', route: '/operate/calculate' };
  if (!r.hasCalculation) return { stage: 'Calculate', label: 'Calculate', route: '/operate/calculate' };
  if (!RECONCILED_STATES.has(r.latestLifecycleState ?? '')) return { stage: 'Reconcile', label: 'Start Reconciliation', route: '/operate/reconciliation' };
  return null;
}

export function CarrierPipelineReadiness({ carrier, accentColor, onNavigate, onView }: Props) {
  const complete = stageComplete(carrier);
  const action = activeAction(carrier);

  return (
    <IntelligenceCard accentColor={accentColor} label="Pipeline Readiness" elementId="carrier-pipeline-readiness" fullWidth onView={onView} tier="information">
      <div className="flex items-center">
        {CARRIER_PIPELINE_STAGES.map((stage, i) => {
          const done = complete[stage];
          const isActive = action?.stage === stage && !done;
          return (
            <div key={stage} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={[
                  'h-7 w-7 rounded-full flex items-center justify-center border text-xs font-medium',
                  done ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : isActive ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200'
                      : 'bg-zinc-800/40 border-zinc-700 text-zinc-600',
                ].join(' ')}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
                </div>
                <span className={['text-[11px]', done ? 'text-slate-300' : isActive ? 'text-indigo-300' : 'text-slate-600'].join(' ')}>{stage}</span>
              </div>
              {i < CARRIER_PIPELINE_STAGES.length - 1 && (
                <div className={['h-px flex-1 mx-2 mb-5', done ? 'bg-emerald-500/30' : 'bg-zinc-800'].join(' ')} />
              )}
            </div>
          );
        })}
      </div>

      {/* One action — the first pending stage */}
      {action ? (
        <button
          onClick={() => onNavigate(action.route, action.stage)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          {action.label}
          <span aria-hidden="true">&rarr;</span>
        </button>
      ) : (
        <p className="mt-4 text-xs text-emerald-400">All pipeline stages complete.</p>
      )}
    </IntelligenceCard>
  );
}
