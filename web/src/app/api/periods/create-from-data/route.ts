// OB-153: Create periods from committed_data source_date or row_data dates
// Decision 92: Periods created at calculate time, not import time.
// Korean Test: zero field-name matching — uses source_date column or structural date scan.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { tenantId } = await req.json();
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    // Check for existing periods
    const { count: existingCount } = await supabase
      .from('periods')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (existingCount && existingCount > 0) {
      return NextResponse.json({ message: 'Periods already exist', count: existingCount });
    }

    // Strategy 1: Use source_date column (OB-152 temporal binding)
    // HF-185: Period creation from transactional data only (OB-107 principle).
    // Entity/roster dates (hire_date) and reference dates are not performance boundaries.
    const periodMap = new Map<string, { year: number; month: number; count: number }>();

    const { data: sourceDateSample } = await supabase
      .from('committed_data')
      .select('source_date')
      .eq('tenant_id', tenantId)
      .not('source_date', 'is', null)
      .or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target')
      .limit(1);

    if (sourceDateSample && sourceDateSample.length > 0) {
      // Source dates exist — scan them for unique year-months
      let offset = 0;
      while (true) {
        const { data: rows } = await supabase
          .from('committed_data')
          .select('source_date')
          .eq('tenant_id', tenantId)
          .not('source_date', 'is', null)
          .or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target')
          .range(offset, offset + 4999);

        if (!rows || rows.length === 0) break;

        for (const row of rows) {
          const d = new Date(row.source_date);
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            if (y >= 2000 && y <= 2100) {
              const key = `${y}-${String(m).padStart(2, '0')}`;
              const existing = periodMap.get(key);
              if (existing) existing.count++;
              else periodMap.set(key, { year: y, month: m, count: 1 });
            }
          }
        }

        offset += rows.length;
        if (rows.length < 5000) break;
      }
    }

    // Strategy 2: If no source_dates, find date fields via semantic roles in metadata
    // Korean Test: field names come from metadata, not hardcoded
    if (periodMap.size === 0) {
      // First, discover date field names from metadata.semantic_roles
      const dateFieldNames = new Set<string>();
      const DATE_ROLES = ['transaction_date', 'period_marker', 'event_timestamp'];

      const { data: metaSample } = await supabase
        .from('committed_data')
        .select('metadata')
        .eq('tenant_id', tenantId)
        .limit(50);

      if (metaSample) {
        for (const row of metaSample) {
          const meta = row.metadata as Record<string, unknown> | null;
          const roles = meta?.semantic_roles as Record<string, { role: string }> | undefined;
          if (roles) {
            for (const [field, info] of Object.entries(roles)) {
              if (DATE_ROLES.includes(info.role)) {
                dateFieldNames.add(field);
              }
            }
          }
        }
      }

      if (dateFieldNames.size > 0) {
        // Scan the identified date fields in row_data
        let offset = 0;
        while (offset < 50000) {
          const { data: rows } = await supabase
            .from('committed_data')
            .select('row_data')
            .eq('tenant_id', tenantId)
            .range(offset, offset + 4999);

          if (!rows || rows.length === 0) break;

          for (const row of rows) {
            const rd = row.row_data as Record<string, unknown>;
            for (const field of Array.from(dateFieldNames)) {
              const val = rd[field];
              if (val == null) continue;
              // Excel serial dates (tight range: 40000-50000 ≈ 2009-2036)
              if (typeof val === 'number' && val > 40000 && val < 50000) {
                const date = new Date((val - 25569) * 86400 * 1000);
                if (!isNaN(date.getTime())) {
                  const y = date.getUTCFullYear();
                  const m = date.getUTCMonth() + 1;
                  if (y >= 2020 && y <= 2030) {
                    const key = `${y}-${String(m).padStart(2, '0')}`;
                    const existing = periodMap.get(key);
                    if (existing) existing.count++;
                    else periodMap.set(key, { year: y, month: m, count: 1 });
                  }
                }
              }
              // ISO date strings
              if (typeof val === 'string' && val.length >= 10 && val.length <= 30) {
                const date = new Date(val);
                if (!isNaN(date.getTime())) {
                  const y = date.getFullYear();
                  const m = date.getMonth() + 1;
                  if (y >= 2020 && y <= 2030) {
                    const key = `${y}-${String(m).padStart(2, '0')}`;
                    const existing = periodMap.get(key);
                    if (existing) existing.count++;
                    else periodMap.set(key, { year: y, month: m, count: 1 });
                  }
                }
              }
            }
          }

          offset += rows.length;
          if (rows.length < 5000) break;
        }
      }
    }

    if (periodMap.size === 0) {
      return NextResponse.json({ error: 'No date data found in committed_data' }, { status: 400 });
    }

    // Fetch existing canonical_keys to avoid duplicates
    const { data: existingPeriods } = await supabase
      .from('periods')
      .select('canonical_key')
      .eq('tenant_id', tenantId);
    const existingKeys = new Set((existingPeriods || []).map(p => p.canonical_key));

    // Create periods
    const newPeriods = Array.from(periodMap.entries())
      .filter(([key]) => !existingKeys.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const lastDay = new Date(data.year, data.month, 0).getDate();
        return {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          label: `${MONTH_NAMES[data.month - 1]} ${data.year}`,
          period_type: 'monthly',
          status: 'open',
          start_date: `${data.year}-${String(data.month).padStart(2, '0')}-01`,
          end_date: `${data.year}-${String(data.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
          canonical_key: key,
          metadata: { source: 'ob153_calculate', recordCount: data.count },
        };
      });

    if (newPeriods.length === 0) {
      return NextResponse.json({ message: 'All periods already exist' });
    }

    const { error } = await supabase.from('periods').insert(newPeriods);
    if (error) {
      console.error('[Periods] Creation failed:', error);
      return NextResponse.json({ error: 'Period creation failed' }, { status: 500 });
    }

    const labels = newPeriods.map(p => p.label);
    console.log(`[Periods] Created ${newPeriods.length} periods for tenant ${tenantId}: ${labels.join(', ')}`);

    return NextResponse.json({
      created: newPeriods.length,
      periods: newPeriods.map(p => ({ id: p.id, label: p.label, canonicalKey: p.canonical_key })),
    });

  } catch (err) {
    console.error('[Periods] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
