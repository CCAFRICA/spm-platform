/**
 * OB-228 — PlanRail (Zone A, Concept ①). Persona-scoped plan list. Each item: name,
 * version, status chip, component count, and a health-glyph slot (the Concept-③
 * "Needs Review" count — present but dormant in Phase 3, lit in Phase 5).
 */
'use client';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { PlanStructure } from '@/lib/plan-surface';
import { planSourceSheet } from '@/lib/plan-surface/plan-identity'; // HF-373 Phase I (D4)
import { ConfidenceGlyph } from './ConfidenceGlyph';

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = s === 'active' || s === 'approved' ? 'success' : s === 'draft' ? 'neutral' : 'open';
  const styles: React.CSSProperties =
    tone === 'success' ? { background: 'var(--vl-success-50, #E6F5EE)', color: 'var(--vl-success, #15936A)' }
    : tone === 'open' ? { background: 'var(--vl-indigo-50, #EEF0FB)', color: 'var(--vl-kpi-accent, #4446B8)' }
    : { background: 'var(--muted)', color: 'var(--muted-foreground)' };
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-wide" style={styles}>{status}</span>;
}

export interface PlanRailProps {
  plans: PlanStructure[];
  selectedId: string | null;
}

export function PlanRail({ plans, selectedId }: PlanRailProps) {
  return (
    <nav className="space-y-1.5" aria-label="Plans">
      {plans.map((p) => {
        const active = p.id === selectedId;
        return (
          <Link
            key={p.id}
            href={`/configure/plans/${p.id}`}
            className="block rounded-lg border px-3 py-2.5 transition-colors"
            style={{
              borderColor: active ? 'var(--vl-kpi-accent, #4446B8)' : 'var(--border)',
              background: active ? 'var(--vl-indigo-50, #EEF0FB)' : 'var(--card)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <FileText className="h-4 w-4 mt-0.5 shrink-0" style={{ color: active ? 'var(--vl-kpi-accent, #4446B8)' : 'var(--muted-foreground)' }} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground leading-tight line-clamp-2">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>v{p.version}</span><span>·</span>
                    <span>{p.componentCount} comp{p.componentCount === 1 ? '' : 's'}</span>
                    {/* HF-373 Phase I (D4): source-sheet provenance — two same-titled plans stay distinguishable */}
                    {planSourceSheet(p.metadata) && (<><span>·</span><span className="truncate" title="Source sheet">{planSourceSheet(p.metadata)}</span></>)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusChip status={p.status} />
                {/* Phase 5 — health glyph (Needs Review count) */}
                {p.topology && p.topology.needsReviewCount > 0 && (
                  <ConfidenceGlyph severity={p.topology.worst} count={p.topology.needsReviewCount} label={`${p.topology.needsReviewCount} need review`} />
                )}
              </div>
            </div>
          </Link>
        );
      })}
      {plans.length === 0 && (
        <div className="text-sm text-muted-foreground px-3 py-6 text-center">No plans visible.</div>
      )}
    </nav>
  );
}
