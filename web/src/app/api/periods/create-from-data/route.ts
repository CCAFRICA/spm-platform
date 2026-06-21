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

    // OB-203 D16.1: never derive periods from a non-completed (processing/failed) batch's partial rows.
    const { hiddenBatchIdsForTenant, applyCommittedDataVisibility } = await import('@/lib/sci/committed-data-visibility');
    const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);

    // HF-330 Defect B: do NOT short-circuit when SOME periods already exist. A blanket
    // "periods already exist → return" blocked partial-coverage tenants (MIR had Jan/Apr/May
    // but not Feb/Mar/Jun) from ever getting their missing months. The per-canonical_key dedup
    // below (existingKeys filter) already guarantees idempotency — only genuinely-missing months
    // are inserted, and a fully-covered tenant falls through to the "All periods already exist"
    // response. So we always scan + dedup, creating exactly the months that don't yet exist.

    // Strategy 1: Use source_date column (OB-152 temporal binding)
    // HF-185: Period creation from transactional data only (OB-107 principle).
    // Entity/roster dates (hire_date) and reference dates are not performance boundaries.
    const periodMap = new Map<string, { year: number; month: number; count: number }>();

    const { data: sourceDateSample } = await applyCommittedDataVisibility(supabase
      .from('committed_data')
      .select('source_date')
      .eq('tenant_id', tenantId)
      .not('source_date', 'is', null)
      .or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target'), hiddenBatchIds)
      .limit(1);

    if (sourceDateSample && sourceDateSample.length > 0) {
      // Source dates exist — scan them for unique year-months.
      // HF-330 Defect B (the root cause of MIR detecting 3 of 6 months): the prior scan used
      // `.range(offset, offset + 4999)` with `if (rows.length < 5000) break` and NO `.order()`.
      // PostgREST caps a single response at 1000 rows, so the first page returned 1000 (< 5000) and
      // the loop broke after ONE page — scanning only the first ~1000 physical rows. With no ORDER BY
      // those rows were an arbitrary slice (MIR's first-page sheets were Jan/Apr/May), so Feb/Mar/Jun
      // (12k+ rows each, all present) were never seen. Fix: page at the actual 1000-row cap, ORDER BY
      // source_date for stable pagination, and break only when a short/empty page proves the end.
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data: rows } = await applyCommittedDataVisibility(supabase
          .from('committed_data')
          .select('source_date')
          .eq('tenant_id', tenantId)
          .not('source_date', 'is', null)
          .or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target'), hiddenBatchIds)
          .order('source_date', { ascending: true })
          .range(offset, offset + PAGE - 1);

        if (!rows || rows.length === 0) break;

        for (const row of rows) {
          // HF-330 Defect B: parse YYYY-MM directly from the date string. `new Date(s).getMonth()`
          // reads LOCAL components off a UTC-parsed midnight, so a month-boundary date (2025-01-01)
          // shifts to the prior month (December 2024) in a negative-offset timezone and fabricates a
          // spurious period. source_date is a DATE column (YYYY-MM-DD) — slice the parts, no Date.
          const ym = /^(\d{4})-(\d{2})-\d{2}/.exec(String(row.source_date));
          if (ym) {
            const y = Number(ym[1]);
            const m = Number(ym[2]);
            if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
              const key = `${ym[1]}-${ym[2]}`;
              const existing = periodMap.get(key);
              if (existing) existing.count++;
              else periodMap.set(key, { year: y, month: m, count: 1 });
            }
          }
        }

        if (rows.length < PAGE) break;
        offset += PAGE;
      }
    }

    // Strategy 2: If no source_dates, find date fields via semantic roles in metadata
    // Korean Test: field names come from metadata, not hardcoded
    if (periodMap.size === 0) {
      // First, discover date field names from metadata.semantic_roles
      const dateFieldNames = new Set<string>();
      const DATE_ROLES = ['transaction_date', 'period_marker', 'event_timestamp'];

      const { data: metaSample } = await applyCommittedDataVisibility(supabase
        .from('committed_data')
        .select('metadata')
        .eq('tenant_id', tenantId), hiddenBatchIds)
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
        // Scan the identified date fields in row_data.
        // HF-330 Defect B: same 1000-row-cap pagination fix as Strategy 1 — page at the cap with a
        // stable ORDER BY id, so this fallback scans the full row set instead of one capped page.
        const PAGE = 1000;
        let offset = 0;
        while (offset < 200000) {
          const { data: rows } = await applyCommittedDataVisibility(supabase
            .from('committed_data')
            .select('row_data')
            .eq('tenant_id', tenantId), hiddenBatchIds)
            .order('id', { ascending: true })
            .range(offset, offset + PAGE - 1);

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

          if (rows.length < PAGE) break;
          offset += PAGE;
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

    // Create periods.
    // HF-225 / OB-188: canonical_key uses the new `{period_type}_{start}_{end}`
    // format. The periodMap key (`YYYY-MM`) is the legacy grouping handle;
    // it is NOT the canonical_key. The actual canonical_key is constructed
    // from period_type + start_date + end_date so monthly and biweekly
    // periods for the same month do not collide and the dedup check against
    // existingKeys (also new-format) matches correctly.
    const newPeriods = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => {
        const lastDay = new Date(data.year, data.month, 0).getDate();
        const startDate = `${data.year}-${String(data.month).padStart(2, '0')}-01`;
        const endDate = `${data.year}-${String(data.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const canonicalKey = `monthly_${startDate}_${endDate}`;
        return {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          label: `${MONTH_NAMES[data.month - 1]} ${data.year}`,
          period_type: 'monthly',
          status: 'open',
          start_date: startDate,
          end_date: endDate,
          canonical_key: canonicalKey,
          metadata: { source: 'ob153_calculate', recordCount: data.count },
        };
      })
      .filter(p => !existingKeys.has(p.canonical_key));

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
