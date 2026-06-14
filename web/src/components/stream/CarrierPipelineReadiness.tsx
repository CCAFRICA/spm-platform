'use client';

/**
 * HF-291 §5.3 — Next Step card (was Pipeline Readiness stepper).
 *
 * Cognitive Fit (TMR-8): a five-step stepper serves a planning task only while the
 * pipeline is blocked. The stream page renders this ONLY for Admin AND only when the
 * pipeline is not yet calculated — so here we show just the ONE blocking step and its
 * single action. No abstract five-step stepper. The user needs to know what to do
 * next, not which of five steps is incomplete. Thermostat, not thermometer.
 */

import { IntelligenceCard } from '@/components/intelligence/IntelligenceCard';
import type { CarrierIntelligence } from '@/lib/carrier/types';

interface Props {
  carrier: CarrierIntelligence | null;
  accentColor: string;
  onNavigate: (route: string, stage: string) => void;
  onView?: () => void;
}

/** The single blocking step: its message and one action. Null when nothing blocks. */
function nextStep(carrier: CarrierIntelligence | null): { stage: string; message: string; label: string; route: string } | null {
  const r = carrier?.pipelineReadiness;
  if (!r) return null;
  if (!r.hasData) return { stage: 'Import', message: 'Import data to begin.', label: 'Import Data', route: '/operate/import' };
  if (!r.hasEntities) return { stage: 'Classify', message: 'Import data so the platform can identify entities.', label: 'Import Data', route: '/operate/import' };
  if (!r.hasPlan) return { stage: 'Bind', message: 'Upload your compensation plan to enable calculation.', label: 'Upload Plan', route: '/operate/import' };
  if (!r.hasBindings) return { stage: 'Bind', message: 'Entities need binding configuration before calculation.', label: 'Configure Bindings', route: '/operate/calculate' };
  if (!r.hasCalculation) return { stage: 'Calculate', message: 'Run the calculation to produce results.', label: 'Calculate', route: '/operate/calculate' };
  return null;
}

export function CarrierPipelineReadiness({ carrier, accentColor, onNavigate, onView }: Props) {
  const step = nextStep(carrier);
  if (!step) return null; // pipeline healthy — silent, no card (Bloodwork)

  return (
    <IntelligenceCard accentColor={accentColor} label="Next Step" elementId="carrier-next-step" fullWidth onView={onView} tier="action">
      <span className="absolute top-5 right-5 h-2.5 w-2.5 rounded-full bg-amber-400" />
      <p className="text-sm text-slate-200 pr-6">{step.message}</p>
      <button
        onClick={() => onNavigate(step.route, step.stage)}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
      >
        {step.label}
        <span aria-hidden="true">&rarr;</span>
      </button>
    </IntelligenceCard>
  );
}
