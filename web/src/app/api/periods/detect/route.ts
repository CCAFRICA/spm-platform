// OB-187: Intelligent Period Detection API
// Detects needed periods from committed_data date ranges + plan cadences.
// Returns detected periods with exists/new status and plan associations.
// Korean Test: zero field-name matching — uses source_date column and cadence_config JSONB.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DetectedPeriod {
  label: string;
  period_type: string;
  start_date: string;
  end_date: string;
  canonical_key: string;
  exists: boolean;
  used_by_plans: string[];
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function generateMonthlyPeriods(minDate: Date, maxDate: Date): Array<Omit<DetectedPeriod, 'exists' | 'used_by_plans'>> {
  const periods: Array<Omit<DetectedPeriod, 'exists' | 'used_by_plans'>> = [];
  const current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (current <= maxDate) {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const lastDay = lastDayOfMonth(y, m);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    periods.push({
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      period_type: 'monthly',
      start_date: startDate,
      end_date: endDate,
      canonical_key: `monthly_${startDate}_${endDate}`,
    });
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

function generateBiweeklyPeriods(minDate: Date, maxDate: Date): Array<Omit<DetectedPeriod, 'exists' | 'used_by_plans'>> {
  const periods: Array<Omit<DetectedPeriod, 'exists' | 'used_by_plans'>> = [];
  const current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (current <= maxDate) {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const lastDay = lastDayOfMonth(y, m);

    // First half: 1st-15th
    const start1 = `${y}-${String(m).padStart(2, '0')}-01`;
    const end1 = `${y}-${String(m).padStart(2, '0')}-15`;
    periods.push({
      label: `${MONTH_NAMES[m - 1]} 1-15, ${y}`,
      period_type: 'biweekly',
      start_date: start1,
      end_date: end1,
      canonical_key: `biweekly_${start1}_${end1}`,
    });

    // Second half: 16th-last day
    const start2 = `${y}-${String(m).padStart(2, '0')}-16`;
    const end2 = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    periods.push({
      label: `${MONTH_NAMES[m - 1]} 16-${lastDay}, ${y}`,
      period_type: 'biweekly',
      start_date: start2,
      end_date: end2,
      canonical_key: `biweekly_${start2}_${end2}`,
    });

    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

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

    // 1. Get plan cadences
    const { data: plans } = await supabase
      .from('rule_sets')
      .select('id, name, cadence_config')
      .eq('tenant_id', tenantId);

    const cadenceToPlanNames = new Map<string, string[]>();
    for (const plan of plans || []) {
      const cc = plan.cadence_config as Record<string, unknown> | null;
      const cadence = (cc?.period_type as string) || 'monthly';
      const existing = cadenceToPlanNames.get(cadence) || [];
      existing.push(plan.name || 'Unnamed Plan');
      cadenceToPlanNames.set(cadence, existing);
    }

    // Default to monthly if no plans exist
    if (cadenceToPlanNames.size === 0) {
      cadenceToPlanNames.set('monthly', []);
    }

    // 2. Get source_date range from committed_data
    const { data: minRow } = await supabase
      .from('committed_data')
      .select('source_date')
      .eq('tenant_id', tenantId)
      .not('source_date', 'is', null)
      .order('source_date', { ascending: true })
      .limit(1);

    const { data: maxRow } = await supabase
      .from('committed_data')
      .select('source_date')
      .eq('tenant_id', tenantId)
      .not('source_date', 'is', null)
      .order('source_date', { ascending: false })
      .limit(1);

    if (!minRow?.length || !maxRow?.length) {
      return NextResponse.json({
        detected: [],
        summary: { total_detected: 0, already_exist: 0, new_needed: 0, cadences_found: [], data_range: null },
      });
    }

    const minDate = new Date(minRow[0].source_date);
    const maxDate = new Date(maxRow[0].source_date);

    // 3. Generate periods for each cadence
    const allDetected: DetectedPeriod[] = [];
    const cadences = Array.from(cadenceToPlanNames.keys());

    for (const cadence of cadences) {
      const planNames = cadenceToPlanNames.get(cadence) || [];
      let generated: Array<Omit<DetectedPeriod, 'exists' | 'used_by_plans'>> = [];

      switch (cadence) {
        case 'monthly':
          generated = generateMonthlyPeriods(minDate, maxDate);
          break;
        case 'biweekly':
          generated = generateBiweeklyPeriods(minDate, maxDate);
          break;
        case 'quarterly': {
          // Quarter-aligned periods
          const qStart = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
          while (qStart <= maxDate) {
            const y = qStart.getFullYear();
            const qm = qStart.getMonth();
            const qEnd = new Date(y, qm + 3, 0);
            const q = Math.floor(qm / 3) + 1;
            generated.push({
              label: `Q${q} ${y}`,
              period_type: 'quarterly',
              start_date: `${y}-${String(qm + 1).padStart(2, '0')}-01`,
              end_date: `${y}-${String(qm + 3).padStart(2, '0')}-${String(qEnd.getDate()).padStart(2, '0')}`,
              canonical_key: `quarterly_${y}-${String(qm + 1).padStart(2, '0')}-01_${y}-${String(qm + 3).padStart(2, '0')}-${String(qEnd.getDate()).padStart(2, '0')}`,
            });
            qStart.setMonth(qStart.getMonth() + 3);
          }
          break;
        }
        default:
          generated = generateMonthlyPeriods(minDate, maxDate);
          break;
      }

      for (const p of generated) {
        allDetected.push({ ...p, exists: false, used_by_plans: planNames });
      }
    }

    // 4. Check which periods already exist (match by start_date + end_date + period_type)
    const { data: existingPeriods } = await supabase
      .from('periods')
      .select('id, start_date, end_date, period_type, canonical_key')
      .eq('tenant_id', tenantId);

    for (const det of allDetected) {
      const match = (existingPeriods || []).find(ep =>
        ep.start_date === det.start_date &&
        ep.end_date === det.end_date &&
        ep.period_type === det.period_type
      );
      if (match) {
        det.exists = true;
      }
    }

    // Sort: existing first, then by start_date
    allDetected.sort((a, b) => {
      if (a.period_type !== b.period_type) return a.period_type.localeCompare(b.period_type);
      return a.start_date.localeCompare(b.start_date);
    });

    const alreadyExist = allDetected.filter(d => d.exists).length;
    const newNeeded = allDetected.filter(d => !d.exists).length;

    return NextResponse.json({
      detected: allDetected,
      summary: {
        total_detected: allDetected.length,
        already_exist: alreadyExist,
        new_needed: newNeeded,
        cadences_found: cadences,
        data_range: { min: minRow[0].source_date, max: maxRow[0].source_date },
      },
    });
  } catch (err) {
    console.error('[Periods/Detect] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
