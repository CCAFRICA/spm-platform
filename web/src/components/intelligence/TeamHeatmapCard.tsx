'use client';

/**
 * TeamHeatmapCard — Manager entity x component grid
 *
 * Table/grid layout showing entities as rows, components as columns.
 * Cell background intensity based on attainment (darker = higher).
 * Total payout as last column. Best/worst performers highlighted.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';

interface HeatmapEntity {
  entityName: string;
  entityId: string;
  components: Array<{
    name: string;
    attainment: number;
    payout: number;
  }>;
  totalPayout: number;
  isHighlight: boolean;
}

interface TeamHeatmapCardProps {
  accentColor: string;
  entities: HeatmapEntity[];
  formatCurrency: (n: number) => string;
  onEntityClick?: (entityId: string) => void;
  onView?: () => void;
}

/**
 * Map attainment percentage to background opacity for heat intensity.
 * Higher attainment = more saturated background.
 */
function attainmentToIntensity(attainment: number): string {
  if (attainment >= 150) return 'bg-emerald-500/30';
  if (attainment >= 120) return 'bg-emerald-500/20';
  if (attainment >= 100) return 'bg-emerald-500/12';
  if (attainment >= 80) return 'bg-blue-500/12';
  if (attainment >= 50) return 'bg-amber-500/12';
  if (attainment > 0) return 'bg-rose-500/12';
  return 'bg-transparent';
}

// HF-316: Vialuce heat ramp — indigo deepens with attainment (light surface, no dark Tailwind alphas).
function attainmentToVialuceBg(attainment: number): string {
  if (attainment >= 150) return 'rgba(45,47,143,0.18)';   // indigo-deep
  if (attainment >= 120) return 'rgba(68,70,184,0.16)';   // indigo
  if (attainment >= 100) return 'rgba(102,104,216,0.13)'; // indigo-light
  if (attainment >= 80) return 'rgba(102,104,216,0.08)';
  if (attainment >= 50) return 'rgba(232,168,56,0.12)';   // gold accent (mid)
  if (attainment > 0) return 'rgba(216,79,79,0.10)';      // danger (low)
  return 'transparent';
}

export function TeamHeatmapCard({
  accentColor,
  entities,
  formatCurrency,
  onEntityClick,
  onView,
}: TeamHeatmapCardProps) {
  const isVialuce = useIsVialuce(); // HF-315: hook must precede any early return (rules-of-hooks)
  if (entities.length === 0) return null;

  // Derive component column headers from the data (Korean Test). OB-206: rows arrive
  // sorted by coaching priority; cap the displayed set (R2 pagination residual at MIR
  // scale) so the manager sees the highest-priority cases first.
  const componentNames = entities[0]?.components.map(c => c.name) ?? [];
  const MAX_ROWS = 20;
  const shown = entities.slice(0, MAX_ROWS);

  // HF-316: under Vialuce render the design-spec .tbl (DM Mono numeric cells, light surface) with an
  // indigo heat ramp. The IntelligenceCard wrapper supplies the .card surface. The else-branch is
  // byte-identical to the original (Dark/Bliss cannot regress).
  if (isVialuce) {
    return (
      <IntelligenceCard
        accentColor={accentColor}
        label="Team Coaching Grid · sorted by coaching priority"
        elementId="team-heatmap"
        fullWidth
        onView={onView}
      >
        <div className="overflow-x-auto -mx-2">
          <table className="tbl min-w-[480px]">
            <thead>
              <tr>
                <th className="sticky left-0" style={{ background: '#FAFBFE' }}>Entity</th>
                {componentNames.map(name => (
                  <th key={name} className="r max-w-[80px]">
                    <span className="block truncate">{name}</span>
                  </th>
                ))}
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(entity => (
                <tr
                  key={entity.entityId}
                  className={cn(onEntityClick && 'cursor-pointer')}
                  style={entity.isHighlight ? { boxShadow: 'inset 0 0 0 1px var(--vl-indigo-100)' } : undefined}
                  onClick={() => onEntityClick?.(entity.entityId)}
                >
                  <td
                    className="name sticky left-0 max-w-[120px]"
                    style={{ background: 'var(--vl-surface)' }}
                  >
                    <span className="block truncate">{entity.entityName}</span>
                  </td>
                  {entity.components.map(comp => (
                    <td
                      key={comp.name}
                      className="num"
                      style={{ backgroundColor: attainmentToVialuceBg(comp.attainment) }}
                    >
                      <span className="whitespace-nowrap">{formatCurrency(comp.payout)}</span>
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 'var(--vl-fw-med)' as never }}>
                    <span className="whitespace-nowrap">{formatCurrency(entity.totalPayout)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--vl-text-soft)' }}>
          Cell = per-component payout; intensity = performance relative to the top performer on that component.
          {entities.length > MAX_ROWS && ` Showing top ${MAX_ROWS} of ${entities.length} by coaching priority.`}
        </p>
      </IntelligenceCard>
    );
  }

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Team Coaching Grid · sorted by coaching priority"
      elementId="team-heatmap"
      fullWidth
      onView={onView}
    >
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs border-collapse min-w-[480px]">
          <thead>
            <tr>
              <th className="text-left text-slate-500 uppercase tracking-wider font-medium px-2 py-2 border-b border-zinc-800/60 sticky left-0 bg-zinc-900/50">
                Entity
              </th>
              {componentNames.map(name => (
                <th
                  key={name}
                  className="text-center text-slate-500 uppercase tracking-wider font-medium px-2 py-2 border-b border-zinc-800/60 max-w-[80px]"
                >
                  <span className="block truncate">{name}</span>
                </th>
              ))}
              <th className="text-right text-slate-500 uppercase tracking-wider font-medium px-2 py-2 border-b border-zinc-800/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(entity => (
              <tr
                key={entity.entityId}
                className={cn(
                  'hover:bg-zinc-800/30 transition-colors',
                  entity.isHighlight && 'ring-1 ring-inset ring-amber-500/20',
                  onEntityClick && 'cursor-pointer',
                )}
                onClick={() => onEntityClick?.(entity.entityId)}
              >
                <td
                  className={cn(
                    'text-left font-medium px-2 py-2 sticky left-0 bg-zinc-900/50 max-w-[120px]',
                    entity.isHighlight ? 'text-slate-200' : 'text-slate-400',
                  )}
                >
                  <span className="block truncate">{entity.entityName}</span>
                </td>
                {entity.components.map(comp => (
                  <td
                    key={comp.name}
                    className={cn(
                      'text-center px-2 py-2',
                      attainmentToIntensity(comp.attainment),
                    )}
                  >
                    <span className="text-slate-300 font-medium whitespace-nowrap">
                      {formatCurrency(comp.payout)}
                    </span>
                  </td>
                ))}
                <td className="text-right px-2 py-2 text-slate-200 font-semibold whitespace-nowrap">
                  {formatCurrency(entity.totalPayout)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Cell = per-component payout; intensity = performance relative to the top performer on that component.
        {entities.length > MAX_ROWS && ` Showing top ${MAX_ROWS} of ${entities.length} by coaching priority.`}
      </p>
    </IntelligenceCard>
  );
}
