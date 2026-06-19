'use client';

/**
 * HF-291 §5.1/§5.2 — Data Health card (was Import Health).
 *
 * A Bloodwork-style HEALTH ASSESSMENT, not a data inventory. One status dot
 * (green/amber/red) carries the verdict; the body is two compact lines with
 * reference frames ("vs prior import"); entity information folds in here rather
 * than as a separate card. Admin-only (gated by the stream page).
 *
 * Bloodwork: a healthy card is muted (status tier); a problem gets the accent
 * border (action tier) — passing checks are quiet, problems get visibility.
 *
 * Korean Test: every label derives from carrier data (row/entity/content-unit
 * counts, data_type) — no domain literal.
 */

import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { IntelligenceCard } from '@/components/intelligence/IntelligenceCard';
import { CarrierContentUnitBrowser } from './CarrierContentUnitBrowser';
import { CarrierEntityExplorer } from './CarrierEntityExplorer';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import type { CarrierIntelligence } from '@/lib/carrier/types';

// HF-291 R3: status thresholds as named constants (confidence is 0–100), to be
// calibrated against real tenant patterns as onboarding widens.
const CONFIDENCE_GREEN = 70; // ≥ → green / High
const CONFIDENCE_AMBER = 50; // ≥ → amber / Moderate; < → red / Low

type Health = 'green' | 'amber' | 'red';

function dataHealth(c: CarrierIntelligence): Health {
  const conf = c.classification.avgConfidence;
  if (c.entities.total === 0) return 'red';
  if (conf != null && conf < CONFIDENCE_AMBER) return 'red';
  if (conf != null && conf < CONFIDENCE_GREEN) return 'amber';
  if (c.dataSnapshot.contentUnits.length === 0) return 'amber';
  return 'green';
}

function confidenceLabel(conf: number | null): string {
  if (conf == null) return 'Unknown';
  if (conf >= CONFIDENCE_GREEN) return 'High';
  if (conf >= CONFIDENCE_AMBER) return 'Moderate';
  return 'Low';
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

/** "vs prior import" reference frame — null on the first import (no prior batch). */
function vsPrior(c: CarrierIntelligence): string | null {
  const latest = c.imports.latestBatch, prior = c.imports.priorBatch;
  if (!latest || !prior) return null;
  const d = latest.rowCount - prior.rowCount;
  if (d > 0) return `+${d.toLocaleString()} rows`;
  if (d < 0) return `${d.toLocaleString()} rows`;
  return 'no change';
}

const DOT: Record<Health, string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-rose-400',
};

// HF-315: under Vialuce the health verdict dot maps to the design-spec status palette.
const VL_DOT: Record<Health, string> = {
  green: 'var(--vl-success)',
  amber: 'var(--vl-raw-gold)',
  red: 'var(--vl-danger)',
};

export function CarrierImportHealth({ carrier, accentColor, onView }: { carrier: CarrierIntelligence; accentColor: string; onView?: () => void }) {
  const isVialuce = useIsVialuce(); // HF-315: design-spec text/number/action vocabulary inside the .card base
  const [reviewOpen, setReviewOpen] = useState(false);
  const [entitiesOpen, setEntitiesOpen] = useState(false);
  const { dataSnapshot, entities, imports, classification, pipelineReadiness } = carrier;
  if (!pipelineReadiness.hasData) return null;

  const health = dataHealth(carrier);
  const bound = entities.total > 0 && entities.withExternalId === entities.total
    ? 'all bound'
    : `${entities.withExternalId.toLocaleString()} bound`;
  const prior = vsPrior(carrier);
  const conf = classification.avgConfidence;

  if (isVialuce) {
    return (
      <IntelligenceCard accentColor={accentColor} label="Data Health" elementId="carrier-data-health" fullWidth onView={onView} tier={health === 'green' ? 'status' : 'action'}>
        {/* Status indicator — the verdict */}
        <span className="absolute top-5 right-5 flex items-center gap-1.5">
          {health === 'red' && <CircleAlert className="h-3.5 w-3.5" style={{ color: 'var(--vl-danger)' }} />}
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: VL_DOT[health] }} />
        </span>

        {/* Line 1 — counts + freshness (DM Mono numbers) */}
        <div className="flex items-baseline justify-between gap-4 pr-6">
          <p style={{ fontSize: '13px', color: 'var(--vl-text)', fontFamily: 'var(--vl-font-mono)' }}>
            {dataSnapshot.totalRows.toLocaleString()} rows · {entities.total.toLocaleString()} entit{entities.total !== 1 ? 'ies' : 'y'} ({bound}) · {dataSnapshot.contentUnits.length} content unit{dataSnapshot.contentUnits.length !== 1 ? 's' : ''}
          </p>
          <span className="whitespace-nowrap" style={{ fontSize: '11.5px', color: 'var(--vl-text-soft)' }}>Last import: {relativeTime(imports.latestBatch?.createdAt ?? null)}</span>
        </div>

        {/* Line 2 — classification verdict + reference frame */}
        <div className="flex items-baseline justify-between gap-4 mt-1 pr-6">
          <p style={{ fontSize: '12px', color: 'var(--vl-text-muted)' }}>
            Classification: {confidenceLabel(conf)}{conf != null && ` (${Math.round(conf)}%)`}
          </p>
          {prior && <span className="whitespace-nowrap" style={{ fontSize: '11.5px', color: 'var(--vl-text-soft)', fontFamily: 'var(--vl-font-mono)' }}>vs prior: {prior}</span>}
        </div>

        {/* Actions — Review Data (primary) + View Entities (secondary). */}
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={() => setReviewOpen(o => !o)}
            className="inline-flex items-center gap-1"
            style={{ fontSize: '12.5px', fontWeight: 'var(--vl-fw-med)', color: 'var(--vialuce-indigo)' }}
          >
            {reviewOpen ? 'Hide Data' : 'Review Data'} <span aria-hidden="true">&rarr;</span>
          </button>
          <button
            onClick={() => setEntitiesOpen(o => !o)}
            className="inline-flex items-center gap-1"
            style={{ fontSize: '12.5px', color: 'var(--vl-text-muted)' }}
          >
            {entitiesOpen ? 'Hide Entities' : 'View Entities'} <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        {reviewOpen && <CarrierContentUnitBrowser contentUnits={dataSnapshot.contentUnits} />}
        {entitiesOpen && <CarrierEntityExplorer sample={entities.sample} total={entities.total} />}
      </IntelligenceCard>
    );
  }

  return (
    <IntelligenceCard accentColor={accentColor} label="Data Health" elementId="carrier-data-health" fullWidth onView={onView} tier={health === 'green' ? 'status' : 'action'}>
      {/* Status indicator — the verdict */}
      <span className="absolute top-5 right-5 flex items-center gap-1.5">
        {health === 'red' && <CircleAlert className="h-3.5 w-3.5 text-rose-400" />}
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[health]}`} />
      </span>

      {/* Line 1 — counts + freshness */}
      <div className="flex items-baseline justify-between gap-4 pr-6">
        <p className="text-sm text-slate-200">
          {dataSnapshot.totalRows.toLocaleString()} rows · {entities.total.toLocaleString()} entit{entities.total !== 1 ? 'ies' : 'y'} ({bound}) · {dataSnapshot.contentUnits.length} content unit{dataSnapshot.contentUnits.length !== 1 ? 's' : ''}
        </p>
        <span className="text-xs text-slate-500 whitespace-nowrap">Last import: {relativeTime(imports.latestBatch?.createdAt ?? null)}</span>
      </div>

      {/* Line 2 — classification verdict + reference frame */}
      <div className="flex items-baseline justify-between gap-4 mt-1 pr-6">
        <p className="text-xs text-slate-500">
          Classification: {confidenceLabel(conf)}{conf != null && ` (${Math.round(conf)}%)`}
        </p>
        {prior && <span className="text-xs text-slate-500 whitespace-nowrap">vs prior: {prior}</span>}
      </div>

      {/* Actions — Review Data (primary) + View Entities (secondary). Import-More lives elsewhere. */}
      <div className="mt-3 flex items-center gap-4">
        <button
          onClick={() => setReviewOpen(o => !o)}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          {reviewOpen ? 'Hide Data' : 'Review Data'} <span aria-hidden="true">&rarr;</span>
        </button>
        <button
          onClick={() => setEntitiesOpen(o => !o)}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          {entitiesOpen ? 'Hide Entities' : 'View Entities'} <span aria-hidden="true">&rarr;</span>
        </button>
      </div>

      {reviewOpen && <CarrierContentUnitBrowser contentUnits={dataSnapshot.contentUnits} />}
      {entitiesOpen && <CarrierEntityExplorer sample={entities.sample} total={entities.total} />}
    </IntelligenceCard>
  );
}
