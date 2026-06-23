'use client';

/**
 * OB-322 — DimensionBreakdown. Pivots a period's payout by a DISCOVERED dimension (Component, or
 * any entity-metadata attribute at natural grouping cardinality — region, level, cargo, …). Feeds
 * on lib/insights/dimension-discovery (Korean Test: no hardcoded field names). Replaces the
 * Analytics "No Segment Dimension" panel, which was a false negative — BCL entities carry
 * region/nivel_cargo/cargo in metadata. When the data genuinely carries no pivotable dimension,
 * the honest empty state is preserved.
 */
import { useState, useEffect } from 'react';
import {
  discoverDimensions,
  aggregateByDimension,
  type DiscoveredDimension,
  type DimensionSlice,
  type ComponentTotal,
} from '@/lib/insights';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Layers } from 'lucide-react';
import { ComponentBars } from './ComponentBars';

interface DimensionBreakdownProps {
  tenantId: string;
  periodId: string;
  /** localized "No dimension" copy from the page */
  emptyTitle?: string;
  emptyBody?: string;
}

export function DimensionBreakdown({ tenantId, periodId, emptyTitle, emptyBody }: DimensionBreakdownProps) {
  const [dims, setDims] = useState<DiscoveredDimension[]>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [slices, setSlices] = useState<DimensionSlice[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tenantId || !periodId) return;
    let cancelled = false;
    setLoaded(false);
    discoverDimensions(tenantId, periodId).then((d) => {
      if (cancelled) return;
      setDims(d);
      setActiveKey((prev) => (d.some((x) => x.key === prev) ? prev : d[0]?.key ?? ''));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [tenantId, periodId]);

  useEffect(() => {
    const dim = dims.find((d) => d.key === activeKey);
    if (!tenantId || !periodId || !dim) { setSlices([]); return; }
    let cancelled = false;
    aggregateByDimension(tenantId, periodId, dim).then((s) => { if (!cancelled) setSlices(s); });
    return () => { cancelled = true; };
  }, [tenantId, periodId, activeKey, dims]);

  // Honest empty: the data carries no pivotable dimension at all.
  if (loaded && dims.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">{emptyTitle ?? 'No Segment Dimension'}</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {emptyBody ?? 'The calculation data does not carry any groupable dimension for this tenant.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const asTotals: ComponentTotal[] = slices.map((s) => ({
    component_name: s.value,
    total_amount: s.total_payout,
    entity_count: s.entity_count,
    percentage_of_total: s.percentage,
  }));

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-end">
          <Select value={activeKey} onValueChange={setActiveKey}>
            <SelectTrigger className="w-[180px]" aria-label="Pivot dimension">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dims.map((d) => (
                <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ComponentBars components={asTotals} />
      </CardContent>
    </Card>
  );
}
