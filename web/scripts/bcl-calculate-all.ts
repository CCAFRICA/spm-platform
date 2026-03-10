#!/usr/bin/env npx tsx
/**
 * OB-163 Phase 4: Run BCL calculation for all 6 periods and verify against GT.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/bcl-calculate-all.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const BCL_RULE_SET_ID = 'b1c20001-aaaa-bbbb-cccc-222222222222';

// Load GT
const gt = JSON.parse(fs.readFileSync(new URL('./bcl-ground-truth.json', import.meta.url).pathname, 'utf-8'));

async function run() {
  console.log('=== OB-163 Phase 4: BCL Calculation + GT Verification ===\n');

  // Fetch periods
  const { data: periods, error: pErr } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date')
    .eq('tenant_id', BCL_TENANT_ID)
    .order('start_date', { ascending: true });

  if (pErr || !periods || periods.length === 0) {
    console.error('No periods found:', pErr?.message);
    process.exit(1);
  }

  console.log(`Found ${periods.length} periods`);

  let engineGrandTotal = 0;
  let allMatch = true;

  for (const period of periods) {
    console.log(`\n--- Calculating: ${period.label} (${period.canonical_key}) ---`);

    // Call the calculation API directly via HTTP
    const calcUrl = `${supabaseUrl.replace('.supabase.co', '.supabase.co')}/functions/v1/...`;
    // Actually, call the Next.js API route directly
    // Since we can't call localhost from here, let's use the calculation logic directly

    // Use the calculation API route via fetch to localhost or call supabase directly
    // For now, call the API via the running dev server
    const response = await fetch('http://localhost:3000/api/calculation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: BCL_TENANT_ID,
        periodId: period.id,
        ruleSetId: BCL_RULE_SET_ID,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Calculation failed for ${period.canonical_key}: ${response.status} ${errorText}`);
      allMatch = false;
      continue;
    }

    const result = await response.json();

    // Query calculation results for this period
    const { data: results } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('tenant_id', BCL_TENANT_ID)
      .eq('period_id', period.id);

    const periodTotal = results?.reduce((sum, r) => sum + Number(r.total_payout), 0) || 0;
    const gtPeriod = gt.perMonthTotals.find((p: { month: string }) => p.month === period.canonical_key);
    const gtTotal = gtPeriod?.total || 0;
    const delta = Math.abs(periodTotal - gtTotal);

    console.log(`  Engine total: $${periodTotal}`);
    console.log(`  GT total:     $${gtTotal}`);
    console.log(`  Delta:        $${delta}`);
    console.log(`  Entity count: ${results?.length || 0}`);

    if (delta > 0.01) {
      console.log(`  *** MISMATCH *** — needs investigation`);
      allMatch = false;
    } else {
      console.log(`  MATCH`);
    }

    engineGrandTotal += periodTotal;
  }

  console.log('\n========================================');
  console.log('BCL CALCULATION SUMMARY');
  console.log('========================================');
  console.log(`Engine Grand Total: $${engineGrandTotal}`);
  console.log(`GT Grand Total:     $${gt.grandTotal}`);
  console.log(`Grand Delta:        $${Math.abs(engineGrandTotal - gt.grandTotal)}`);
  console.log(`Status: ${allMatch ? 'ALL PERIODS MATCH' : 'MISMATCHES DETECTED'}`);

  // Check anchor entities for March 2026
  const marchPeriod = periods.find(p => p.canonical_key === '2026-03');
  if (marchPeriod) {
    console.log('\n--- March 2026 Anchor Verification ---');
    for (const anchorExtId of ['BCL-5012', 'BCL-5063', 'BCL-5003']) {
      const anchorUuid = gt.entityUuids[anchorExtId];
      if (!anchorUuid) continue;

      const { data: anchorResult } = await supabase
        .from('calculation_results')
        .select('total_payout, components')
        .eq('entity_id', anchorUuid)
        .eq('period_id', marchPeriod.id)
        .maybeSingle();

      if (anchorResult) {
        const components = anchorResult.components as Record<string, unknown>[];
        console.log(`\n  ${anchorExtId}: $${anchorResult.total_payout}`);
        if (Array.isArray(components)) {
          for (const comp of components) {
            const c = comp as { componentName?: string; payout?: number };
            console.log(`    ${c.componentName}: $${c.payout}`);
          }
        }
      }
    }
  }
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
