'use client';

/**
 * PipelineReadinessCard — Shows periods needing data import
 *
 * Five Elements:
 *   Value:      N periods need data
 *   Context:    Period labels
 *   Comparison: Reference to periods that have data
 *   Action:     "Import Data →" button
 *   Impact:     What importing enables
 *
 * OB-170: Intelligence Stream Phase A
 * Bloodwork Principle: only renders when empty periods exist.
 */

import { Upload, ArrowRight } from 'lucide-react';
import { IntelligenceCard } from './IntelligenceCard';

interface EmptyPeriod {
  periodId: string;
  label: string;
}

interface PipelineReadinessCardProps {
  accentColor: string;
  periods: EmptyPeriod[];
  periodsWithDataCount: number;
  onImport: () => void;
  onView?: () => void;
}

export function PipelineReadinessCard({
  accentColor,
  periods,
  periodsWithDataCount,
  onImport,
  onView,
}: PipelineReadinessCardProps) {
  if (periods.length === 0) return null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Pipeline Readiness"
      elementId="pipeline-readiness"
      fullWidth
      onView={onView}
    >
      {/* Value */}
      <p className="text-lg font-semibold text-slate-100">
        {periods.length} period{periods.length !== 1 ? 's' : ''} need data
      </p>

      {/* Comparison */}
      {periodsWithDataCount > 0 && (
        <p className="text-xs text-slate-500 mt-1">
          {periodsWithDataCount} period{periodsWithDataCount !== 1 ? 's' : ''} already have data
        </p>
      )}

      {/* Context: period list */}
      <div className="mt-4 space-y-1.5">
        {periods.slice(0, 6).map(p => (
          <div
            key={p.periodId}
            className="flex items-center gap-3 px-4 py-2 rounded-md bg-zinc-800/30"
          >
            <Upload className="h-3.5 w-3.5 text-slate-600" />
            <span className="text-sm text-slate-300">{p.label}</span>
            <span className="text-xs text-slate-600">No data imported</span>
          </div>
        ))}
        {periods.length > 6 && (
          <p className="text-xs text-slate-500 px-4">
            +{periods.length - 6} more
          </p>
        )}
      </div>

      {/* Action */}
      <div className="mt-4 flex items-center justify-between border-t border-zinc-800/60 pt-4">
        <p className="text-xs text-slate-500">
          Importing data enables calculation and result verification.
        </p>
        <button
          onClick={onImport}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors"
        >
          Import Data
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </IntelligenceCard>
  );
}
