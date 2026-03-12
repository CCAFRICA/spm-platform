#!/usr/bin/env npx tsx
/**
 * OB-164 Phase 4: Create Periods + Calculate + Verify GT
 *
 * 1. Create periods from committed_data source_dates
 * 2. Run calculation for each period
 * 3. Compare engine output against GT ($314,978)
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob164-phase4-calculate.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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
const DEV_SERVER = 'http://localhost:3000';

// Load GT
const gtPath = path.join(new URL('.', import.meta.url).pathname, 'bcl-ground-truth.json');
const GT = JSON.parse(fs.readFileSync(gtPath, 'utf-8'));
const GT_GRAND_TOTAL = GT.grandTotal; // 314978
const GT_PER_MONTH: Array<{ month: string; total: number }> = GT.perMonthTotals;

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 4: Calculate + Verify GT');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Step 1: Create periods ──
  console.log('── Step 1: Create Periods ──\n');

  // Check existing periods
  const { count: existingPeriods } = await supabase
    .from('periods')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', BCL_TENANT_ID);

  if (existingPeriods && existingPeriods > 0) {
    console.log(`  ${existingPeriods} periods already exist`);
  } else {
    // Try the API first
    try {
      const res = await fetch(`${DEV_SERVER}/api/periods/create-from-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: BCL_TENANT_ID }),
      });
      const data = await res.json();
      console.log(`  API response: ${JSON.stringify(data).substring(0, 200)}`);
    } catch (err) {
      console.log(`  API call failed, creating periods manually: ${err}`);
    }

    // Verify/create periods manually from source_dates
    const { data: sourceDates } = await supabase
      .from('committed_data')
      .select('source_date')
      .eq('tenant_id', BCL_TENANT_ID)
      .not('source_date', 'is', null);

    const monthSet = new Set<string>();
    for (const row of sourceDates || []) {
      const sd = row.source_date as string;
      if (sd) {
        const ym = sd.substring(0, 7); // YYYY-MM
        monthSet.add(ym);
      }
    }

    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    for (const ym of Array.from(monthSet).sort()) {
      const [yearStr, monthStr] = ym.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const lastDay = new Date(year, month, 0).getDate();

      // Check if period exists
      const { data: existing } = await supabase
        .from('periods')
        .select('id')
        .eq('tenant_id', BCL_TENANT_ID)
        .eq('start_date', `${ym}-01`)
        .maybeSingle();

      if (!existing) {
        const { error: pErr } = await supabase.from('periods').insert({
          tenant_id: BCL_TENANT_ID,
          label: `${MONTH_NAMES[month - 1]} ${year}`,
          period_type: 'monthly',
          status: 'open',
          start_date: `${ym}-01`,
          end_date: `${ym}-${String(lastDay).padStart(2, '0')}`,
          canonical_key: ym,
          metadata: { source: 'ob164_pipeline' },
        });
        if (pErr) console.error(`  Period create failed for ${ym}: ${pErr.message}`);
        else console.log(`  Created period: ${MONTH_NAMES[month - 1]} ${year}`);
      }
    }
  }

  // Fetch all periods
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, start_date, canonical_key')
    .eq('tenant_id', BCL_TENANT_ID)
    .order('start_date');

  if (!periods || periods.length === 0) {
    console.error('No periods found!');
    process.exit(1);
  }
  console.log(`\n✓ ${periods.length} periods ready`);

  // ── Step 2: Bind committed_data to periods ──
  console.log('\n── Step 2: Bind committed_data to periods ──\n');

  for (const period of periods) {
    const ym = period.canonical_key || period.start_date?.substring(0, 7);
    const startDate = `${ym}-01`;

    // Update committed_data rows with matching source_date
    const { data: unboundRows, error: fetchErr } = await supabase
      .from('committed_data')
      .select('id')
      .eq('tenant_id', BCL_TENANT_ID)
      .eq('source_date', startDate)
      .is('period_id', null);

    if (fetchErr) {
      console.error(`  Fetch failed for ${ym}: ${fetchErr.message}`);
      continue;
    }

    if (unboundRows && unboundRows.length > 0) {
      const rowIds = unboundRows.map(r => r.id);
      for (let i = 0; i < rowIds.length; i += 200) {
        const chunk = rowIds.slice(i, i + 200);
        await supabase
          .from('committed_data')
          .update({ period_id: period.id })
          .in('id', chunk);
      }
      console.log(`  ${ym}: bound ${unboundRows.length} rows to period ${period.id.substring(0, 8)}`);
    }
  }

  // ── Step 3: Run calculations ──
  console.log('\n── Step 3: Run Calculations ──\n');

  let grandTotal = 0;
  const results: Array<{ month: string; engineTotal: number; gtTotal: number; delta: number }> = [];

  for (const period of periods) {
    const ym = period.canonical_key || period.start_date?.substring(0, 7);
    console.log(`  Calculating ${ym}...`);

    try {
      const res = await fetch(`${DEV_SERVER}/api/calculation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: BCL_TENANT_ID,
          periodId: period.id,
          ruleSetId: BCL_RULE_SET_ID,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`    FAILED (${res.status}): ${errText.substring(0, 200)}`);
        continue;
      }

      const data = await res.json();
      const engineTotal = data.totalPayout || data.periodTotal || 0;

      const gtEntry = GT_PER_MONTH.find((g: { month: string }) => g.month === ym);
      const gtTotal = gtEntry?.total || 0;
      const delta = engineTotal - gtTotal;

      results.push({ month: ym!, engineTotal, gtTotal, delta });
      grandTotal += engineTotal;

      const status = delta === 0 ? '✓ EXACT' : `⚠ DELTA: $${delta}`;
      console.log(`    Engine: $${engineTotal.toLocaleString()} | GT: $${gtTotal.toLocaleString()} | ${status}`);
    } catch (err) {
      console.error(`    Error: ${err}`);
    }
  }

  // ── Step 4: GT Verification ──
  console.log('\n══════════════════════════════════════════');
  console.log('  GT VERIFICATION');
  console.log('══════════════════════════════════════════\n');

  console.log('  Period          Engine       GT          Delta');
  console.log('  ─────────────────────────────────────────────────');
  for (const r of results) {
    const deltaStr = r.delta === 0 ? '$0 ✓' : `$${r.delta}`;
    console.log(`  ${r.month}     $${r.engineTotal.toLocaleString().padStart(8)}   $${r.gtTotal.toLocaleString().padStart(8)}   ${deltaStr}`);
  }
  console.log('  ─────────────────────────────────────────────────');
  const grandDelta = grandTotal - GT_GRAND_TOTAL;
  console.log(`  TOTAL       $${grandTotal.toLocaleString().padStart(8)}   $${GT_GRAND_TOTAL.toLocaleString().padStart(8)}   ${grandDelta === 0 ? '$0 ✓' : `$${grandDelta}`}`);

  if (grandDelta === 0) {
    console.log('\n  ✓✓✓ ALL 6 PERIODS EXACT — GT MATCH $314,978 ✓✓✓');
  } else {
    console.log(`\n  ⚠ GRAND TOTAL DELTA: $${grandDelta}`);
  }

  // ── Step 5: Anchor Entity Verification ──
  console.log('\n── Anchor Entity Verification ──\n');

  const anchors = ['BCL-5012', 'BCL-5063', 'BCL-5003'];
  for (const anchorExtId of anchors) {
    const { data: entity } = await supabase
      .from('entities')
      .select('id, display_name')
      .eq('tenant_id', BCL_TENANT_ID)
      .eq('external_id', anchorExtId)
      .maybeSingle();

    if (!entity) { console.log(`  ${anchorExtId}: entity not found`); continue; }

    const { data: calcResults } = await supabase
      .from('calculation_results')
      .select('period_id, results')
      .eq('tenant_id', BCL_TENANT_ID)
      .eq('entity_id', entity.id);

    console.log(`  ${entity.display_name} (${anchorExtId}): ${calcResults?.length || 0} period results`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 4: COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
