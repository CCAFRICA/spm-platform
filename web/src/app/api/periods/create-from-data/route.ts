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
    const periodMap = new Map<string, { year: number; month: number; count: number }>();

    const { data: sourceDateSample } = await supabase
      .from('committed_data')
      .select('source_date')
      .eq('tenant_id', tenantId)
      .not('source_date', 'is', null)
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

    // Strategy 2: If no source_dates, scan row_data for date-like values
    if (periodMap.size === 0) {
      // Sample row_data to find date patterns
      const { data: sample } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', tenantId)
        .limit(500);

      if (sample) {
        for (const row of sample) {
          const rd = row.row_data as Record<string, unknown>;
          for (const val of Object.values(rd)) {
            if (val == null) continue;
            // Try Excel serial dates
            if (typeof val === 'number' && val > 25000 && val < 100000) {
              const date = new Date((val - 25569) * 86400 * 1000);
              if (!isNaN(date.getTime())) {
                const y = date.getUTCFullYear();
                const m = date.getUTCMonth() + 1;
                if (y >= 2000 && y <= 2100) {
                  const key = `${y}-${String(m).padStart(2, '0')}`;
                  const existing = periodMap.get(key);
                  if (existing) existing.count++;
                  else periodMap.set(key, { year: y, month: m, count: 1 });
                }
              }
            }
            // Try ISO date strings
            if (typeof val === 'string' && val.length >= 10 && val.length <= 30) {
              const date = new Date(val);
              if (!isNaN(date.getTime())) {
                const y = date.getFullYear();
                const m = date.getMonth() + 1;
                if (y >= 2000 && y <= 2100) {
                  const key = `${y}-${String(m).padStart(2, '0')}`;
                  const existing = periodMap.get(key);
                  if (existing) existing.count++;
                  else periodMap.set(key, { year: y, month: m, count: 1 });
                }
              }
            }
          }
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
          status: 'active',
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
