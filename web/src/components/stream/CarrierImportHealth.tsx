'use client';

/**
 * OB-205 / DS-029 §4.2 — Import Health card.
 *
 * Renders when the carrier holds data (pipelineReadiness.hasData). Five Elements:
 *   Value:      rows × content units × imports
 *   Context:    entities (+ external IDs) and classification confidence
 *   Comparison: Cold tier — first-import note when only one batch exists
 *   Action:     Calculate (when plan+bindings ready) · Review Data · Import More
 *   Impact:     derived from pipeline readiness (what's ready / what's missing)
 *
 * Korean Test: counts and labels come from the carrier (data_type, entity counts);
 * no domain literal.
 */

import { useState } from 'react';
import { Calculator, Table2, Upload, ArrowRight } from 'lucide-react';
import { IntelligenceCard } from '@/components/intelligence/IntelligenceCard';
import { CarrierContentUnitBrowser } from './CarrierContentUnitBrowser';
import type { CarrierIntelligence } from '@/lib/carrier/types';

interface Props {
  carrier: CarrierIntelligence;
  accentColor: string;
  onCalculate: () => void;
  onImportMore: () => void;
  onReviewData?: () => void;
  onView?: () => void;
}

function impactText(c: CarrierIntelligence): string {
  const r = c.pipelineReadiness;
  if (!r.hasPlan) return 'Missing a plan — upload a compensation plan to enable calculation.';
  if (!r.hasBindings) return 'Plan present, bindings incomplete — configure bindings to enable calculation.';
  if (!r.hasCalculation) return `Ready to calculate for ${c.entities.total.toLocaleString()} entities.`;
  return `Calculation ${(r.latestLifecycleState ?? 'complete').toLowerCase()} — results available in the stream.`;
}

export function CarrierImportHealth({ carrier, accentColor, onCalculate, onImportMore, onReviewData, onView }: Props) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const { dataSnapshot, entities, imports, classification, pipelineReadiness } = carrier;
  if (!pipelineReadiness.hasData) return null;

  const canCalculate = pipelineReadiness.hasBindings && pipelineReadiness.hasPlan && !pipelineReadiness.hasCalculation;
  const confidence = classification.avgConfidence;

  return (
    <IntelligenceCard accentColor={accentColor} label="Import Health" elementId="carrier-import-health" fullWidth onView={onView} tier="action">
      {/* Value */}
      <p className="text-lg font-semibold text-slate-100">
        {dataSnapshot.totalRows.toLocaleString()} rows across {dataSnapshot.contentUnits.length} content unit{dataSnapshot.contentUnits.length !== 1 ? 's' : ''} from {imports.totalBatches} import{imports.totalBatches !== 1 ? 's' : ''}
      </p>

      {/* Context */}
      <p className="text-xs text-slate-500 mt-1">
        {entities.total.toLocaleString()} entit{entities.total !== 1 ? 'ies' : 'y'} ({entities.withExternalId.toLocaleString()} with external ID)
        {confidence != null && ` · Classification confidence: ${confidence}%`}
      </p>

      {/* Comparison — Cold tier */}
      {imports.totalBatches === 1 && (
        <p className="text-xs text-slate-500 mt-1">First import period — comparison available after next import.</p>
      )}

      {/* Action */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canCalculate && (
          <button onClick={onCalculate} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors">
            <Calculator className="h-3.5 w-3.5" /> Calculate <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => { setReviewOpen(o => !o); onReviewData?.(); }}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors"
        >
          <Table2 className="h-3.5 w-3.5" /> {reviewOpen ? 'Hide Data' : 'Review Data'}
        </button>
        <button onClick={onImportMore} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors">
          <Upload className="h-3.5 w-3.5" /> Import More Data
        </button>
      </div>

      {/* Inline expansion — Content Unit Browser (§6.1) */}
      {reviewOpen && <CarrierContentUnitBrowser contentUnits={dataSnapshot.contentUnits} />}

      {/* Impact */}
      <p className="mt-3 text-xs text-slate-500">{impactText(carrier)}</p>
    </IntelligenceCard>
  );
}
