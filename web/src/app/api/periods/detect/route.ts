// OB-187 + OB-188: Intelligent Period Detection API
// Data-driven detection: committed_data.source_date is PRIMARY input.
// Plan cadences enrich suggestions. Both are optional (dependency independence).
// Korean Test: zero field-name matching.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

interface PeriodCandidate {
  label: string;
  period_type: string;
  start_date: string;
  end_date: string;
  canonical_key: string;
}

function generateMonthlyPeriods(minDate: Date, maxDate: Date): PeriodCandidate[] {
  const periods: PeriodCandidate[] = [];
  const current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (current <= maxDate) {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const ld = lastDayOfMonth(y, m);
    const sd = `${y}-${String(m).padStart(2, '0')}-01`;
    const ed = `${y}-${String(m).padStart(2, '0')}-${String(ld).padStart(2, '0')}`;
    periods.push({ label: `${MONTH_NAMES[m - 1]} ${y}`, period_type: 'monthly', start_date: sd, end_date: ed, canonical_key: `monthly_${sd}_${ed}` });
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

function generateBiweeklyPeriods(minDate: Date, maxDate: Date): PeriodCandidate[] {
  const periods: PeriodCandidate[] = [];
  const current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (current <= maxDate) {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const ld = lastDayOfMonth(y, m);
    const s1 = `${y}-${String(m).padStart(2, '0')}-01`;
    const e1 = `${y}-${String(m).padStart(2, '0')}-15`;
    periods.push({ label: `${MONTH_NAMES[m - 1]} 1-15, ${y}`, period_type: 'biweekly', start_date: s1, end_date: e1, canonical_key: `biweekly_${s1}_${e1}` });
    const s2 = `${y}-${String(m).padStart(2, '0')}-16`;
    const e2 = `${y}-${String(m).padStart(2, '0')}-${String(ld).padStart(2, '0')}`;
    periods.push({ label: `${MONTH_NAMES[m - 1]} 16-${ld}, ${y}`, period_type: 'biweekly', start_date: s2, end_date: e2, canonical_key: `biweekly_${s2}_${e2}` });
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    // Query 1: Data range (PRIMARY — always runs)
    // HF-185: Period detection from transactional data only (OB-107 principle).
    // Entity/roster dates (hire_date) and reference dates are not performance boundaries.
    // Include rows where informational_label is 'transaction', 'target', or null (legacy data).
    const { data: minRow } = await supabase.from('committed_data').select('source_date').eq('tenant_id', tenantId).not('source_date', 'is', null).or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target').order('source_date', { ascending: true }).limit(1);
    const { data: maxRow } = await supabase.from('committed_data').select('source_date').eq('tenant_id', tenantId).not('source_date', 'is', null).or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target').order('source_date', { ascending: false }).limit(1);
    const { count: totalTxns } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target');

    const hasData = !!(minRow?.length && maxRow?.length);
    const dataRange = hasData ? { min_date: minRow![0].source_date, max_date: maxRow![0].source_date, total_transactions: totalTxns || 0, has_data: true } : { min_date: null, max_date: null, total_transactions: 0, has_data: false };

    // Query 2: Plan cadences (ENRICHMENT — always runs independently)
    const { data: plans } = await supabase.from('rule_sets').select('id, name, cadence_config').eq('tenant_id', tenantId);
    const planCadences = (plans || []).map(p => {
      const cc = p.cadence_config as Record<string, unknown> | null;
      return { plan_id: p.id, plan_name: p.name || 'Unnamed Plan', cadence: (cc?.period_type as string) || 'monthly' };
    });
    const hasPlans = planCadences.length > 0;

    // Build cadence-to-plans map
    const cadenceToPlanNames = new Map<string, string[]>();
    for (const pc of planCadences) {
      const arr = cadenceToPlanNames.get(pc.cadence) || [];
      arr.push(pc.plan_name);
      cadenceToPlanNames.set(pc.cadence, arr);
    }
    if (cadenceToPlanNames.size === 0) cadenceToPlanNames.set('monthly', []);

    // Generate suggested periods
    const suggestedPeriods: Array<PeriodCandidate & { exists: boolean; transaction_count: number; matching_plans: string[] }> = [];

    if (hasData) {
      const minDate = new Date(dataRange.min_date!);
      const maxDate = new Date(dataRange.max_date!);
      const cadences = Array.from(cadenceToPlanNames.keys());

      for (const cadence of cadences) {
        const matchingPlans = cadenceToPlanNames.get(cadence) || [];
        let generated: PeriodCandidate[] = [];
        switch (cadence) {
          case 'monthly': generated = generateMonthlyPeriods(minDate, maxDate); break;
          case 'biweekly': generated = generateBiweeklyPeriods(minDate, maxDate); break;
          default: generated = generateMonthlyPeriods(minDate, maxDate); break;
        }
        for (const p of generated) {
          suggestedPeriods.push({ ...p, exists: false, transaction_count: 0, matching_plans: matchingPlans });
        }
      }

      // Query 3: Transaction counts per suggested period
      // HF-185: Exclude entity/reference rows from period transaction counts
      for (const sp of suggestedPeriods) {
        const { count } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('source_date', sp.start_date).lte('source_date', sp.end_date).or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target');
        sp.transaction_count = count || 0;
      }
    }

    // Query 4: Existing periods (match by start_date + end_date + period_type)
    const { data: existingPeriods } = await supabase.from('periods').select('id, start_date, end_date, period_type').eq('tenant_id', tenantId);
    for (const sp of suggestedPeriods) {
      const match = (existingPeriods || []).find(ep => ep.start_date === sp.start_date && ep.end_date === sp.end_date && ep.period_type === sp.period_type);
      if (match) sp.exists = true;
    }

    // Orphaned data detection
    let orphanedCount = 0;
    let orphanedMin: string | null = null;
    let orphanedMax: string | null = null;
    if (hasData && existingPeriods && existingPeriods.length > 0) {
      // Build a query that excludes rows covered by existing periods
      // Simplified: count rows outside ALL existing period ranges
      const allPeriodRanges = existingPeriods.map(ep => ({ start: ep.start_date, end: ep.end_date }));
      // For simplicity, check if data range extends beyond period coverage
      const coveredStart = allPeriodRanges.reduce((min, r) => r.start < min ? r.start : min, allPeriodRanges[0].start);
      const coveredEnd = allPeriodRanges.reduce((max, r) => r.end > max ? r.end : max, allPeriodRanges[0].end);

      if (dataRange.min_date! < coveredStart || dataRange.max_date! > coveredEnd) {
        // There may be orphaned data
        // HF-185: Exclude entity/reference rows from orphaned data detection
        const { count: beforeCount } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('source_date', 'is', null).lt('source_date', coveredStart).or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target');
        const { count: afterCount } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('source_date', 'is', null).gt('source_date', coveredEnd).or('metadata->>informational_label.is.null,metadata->>informational_label.eq.transaction,metadata->>informational_label.eq.target');
        orphanedCount = (beforeCount || 0) + (afterCount || 0);
        if (beforeCount && beforeCount > 0) orphanedMin = dataRange.min_date;
        if (afterCount && afterCount > 0) orphanedMax = dataRange.max_date;
      }
    }

    // Commentary engine
    const commentary: string[] = [];
    if (hasData) {
      commentary.push(`Data spans ${dataRange.min_date} to ${dataRange.max_date} (${dataRange.total_transactions} transactions)`);
    } else {
      commentary.push('No transaction data imported yet — import data or create periods manually');
    }
    if (hasPlans) {
      const cadenceSummary = Array.from(cadenceToPlanNames.entries()).map(([c, p]) => `${c} (${p.length} plan${p.length !== 1 ? 's' : ''})`).join(', ');
      commentary.push(`Plan cadences: ${cadenceSummary}`);
    } else {
      commentary.push('No plans imported yet — periods suggested based on data range only');
    }
    if (suggestedPeriods.length > 0) {
      const newCount = suggestedPeriods.filter(sp => !sp.exists).length;
      const existCount = suggestedPeriods.filter(sp => sp.exists).length;
      if (newCount > 0 && existCount > 0) {
        commentary.push(`${suggestedPeriods.length} periods suggested — ${existCount} already exist, ${newCount} new`);
      } else if (newCount > 0) {
        commentary.push(`${newCount} new periods suggested`);
      } else {
        commentary.push('All suggested periods already exist');
      }
    }
    if (orphanedCount > 0) {
      commentary.push(`⚠ ${orphanedCount} transactions fall outside existing periods`);
    }

    // Sort by period_type then start_date
    suggestedPeriods.sort((a, b) => a.period_type !== b.period_type ? a.period_type.localeCompare(b.period_type) : a.start_date.localeCompare(b.start_date));

    return NextResponse.json({
      data_range: dataRange,
      plan_cadences: planCadences,
      has_plans: hasPlans,
      suggested_periods: suggestedPeriods,
      orphaned_data: { count: orphanedCount, min_date: orphanedMin, max_date: orphanedMax },
      commentary,
    });
  } catch (err) {
    console.error('[Periods/Detect] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
