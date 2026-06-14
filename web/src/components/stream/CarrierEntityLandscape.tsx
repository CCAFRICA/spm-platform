'use client';

/**
 * OB-205 / DS-029 §4.3 — Entity Landscape card.
 *
 * Renders when the carrier holds entities. Shows the count and the type breakdown
 * derived from entity_type values, with a "View Entities" inline expansion.
 *
 * Korean Test: the type breakdown is whatever entity_type values the tenant's
 * import produced — never a domain literal.
 */

import { useState } from 'react';
import { Users, List } from 'lucide-react';
import { IntelligenceCard } from '@/components/intelligence/IntelligenceCard';
import { CarrierEntityExplorer } from './CarrierEntityExplorer';
import type { CarrierIntelligence } from '@/lib/carrier/types';

interface Props {
  carrier: CarrierIntelligence;
  accentColor: string;
  onView?: () => void;
}

export function CarrierEntityLandscape({ carrier, accentColor, onView }: Props) {
  const [open, setOpen] = useState(false);
  const { entities } = carrier;
  if (entities.total === 0) return null;

  const breakdown = entities.byType.map(t => `${t.count.toLocaleString()} ${t.entityType}`).join(', ');

  return (
    <IntelligenceCard accentColor={accentColor} label="Entity Landscape" elementId="carrier-entity-landscape" fullWidth onView={onView} tier="information">
      {/* Value */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-500" />
        <p className="text-lg font-semibold text-slate-100">{entities.total.toLocaleString()} entit{entities.total !== 1 ? 'ies' : 'y'} discovered</p>
      </div>

      {/* Context — type breakdown */}
      {breakdown && <p className="text-xs text-slate-500 mt-1">{breakdown}</p>}

      {/* Action */}
      <div className="mt-4">
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors"
        >
          <List className="h-3.5 w-3.5" /> {open ? 'Hide Entities' : 'View Entities'}
        </button>
      </div>

      {/* Inline expansion — Entity Explorer (§6.2) */}
      {open && <CarrierEntityExplorer sample={entities.sample} total={entities.total} />}
    </IntelligenceCard>
  );
}
