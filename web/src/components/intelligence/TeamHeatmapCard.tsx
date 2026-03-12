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

export function TeamHeatmapCard({
  accentColor,
  entities,
  formatCurrency,
  onEntityClick,
  onView,
}: TeamHeatmapCardProps) {
  if (entities.length === 0) return null;

  // Derive component column headers from first entity
  const componentNames = entities[0]?.components.map(c => c.name) ?? [];

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Team Performance Grid"
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
            {entities.map(entity => (
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
                    <span className="text-slate-300 font-medium">
                      {comp.attainment > 0 ? `${comp.attainment.toFixed(0)}%` : '-'}
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
    </IntelligenceCard>
  );
}
