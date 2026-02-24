#!/usr/bin/env npx tsx
/**
 * OB-86 Phase 0: Audit Classification Signals Infrastructure
 *
 * Queries classification_signals table to document:
 * - Total row count
 * - Distinct signal_types and their counts
 * - Source distribution (ai, user_confirmed, user_corrected)
 * - Confidence histogram
 * - Existing write locations in codebase
 *
 * Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob86-phase0-audit.ts
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function audit() {
  console.log('=== OB-86 Phase 0: Classification Signals Audit ===\n');

  // 1. Total count
  const { count: totalCount, error: countErr } = await supabase
    .from('classification_signals')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error('Table query failed:', countErr.message);
    console.log('\nTable may not exist or RLS blocks access.');
    return;
  }

  console.log(`Total classification_signals rows: ${totalCount ?? 0}`);

  // 2. Fetch sample for analysis (up to 5000)
  const { data: signals, error: fetchErr } = await supabase
    .from('classification_signals')
    .select('id, tenant_id, signal_type, confidence, source, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (fetchErr) {
    console.error('Fetch failed:', fetchErr.message);
    return;
  }

  const rows = signals ?? [];
  console.log(`Fetched ${rows.length} rows for analysis\n`);

  // 3. Signal type distribution
  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.signal_type] = (byType[r.signal_type] || 0) + 1;
  }
  console.log('Signal Type Distribution:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // 4. Source distribution
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const src = r.source || 'null';
    bySource[src] = (bySource[src] || 0) + 1;
  }
  console.log('\nSource Distribution:');
  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${count}`);
  }

  // 5. Confidence histogram
  const buckets = [
    { label: '0.00-0.50', min: 0, max: 0.5, count: 0 },
    { label: '0.50-0.70', min: 0.5, max: 0.7, count: 0 },
    { label: '0.70-0.85', min: 0.7, max: 0.85, count: 0 },
    { label: '0.85-0.95', min: 0.85, max: 0.95, count: 0 },
    { label: '0.95-1.00', min: 0.95, max: 1.01, count: 0 },
  ];
  let nullConf = 0;
  let totalConf = 0;
  let confCount = 0;

  for (const r of rows) {
    if (r.confidence == null) { nullConf++; continue; }
    totalConf += r.confidence;
    confCount++;
    for (const b of buckets) {
      if (r.confidence >= b.min && r.confidence < b.max) {
        b.count++;
        break;
      }
    }
  }

  console.log('\nConfidence Histogram:');
  for (const b of buckets) {
    const bar = '#'.repeat(Math.min(50, Math.round((b.count / Math.max(rows.length, 1)) * 100)));
    console.log(`  ${b.label}: ${b.count} ${bar}`);
  }
  console.log(`  null: ${nullConf}`);
  console.log(`  avg confidence: ${confCount > 0 ? (totalConf / confCount).toFixed(4) : 'N/A'}`);

  // 6. Tenant distribution
  const byTenant: Record<string, number> = {};
  for (const r of rows) {
    byTenant[r.tenant_id] = (byTenant[r.tenant_id] || 0) + 1;
  }
  console.log(`\nTenant Distribution (${Object.keys(byTenant).length} tenants):`);
  for (const [tid, count] of Object.entries(byTenant).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${tid}: ${count}`);
  }

  // 7. Date range
  if (rows.length > 0) {
    const dates = rows.map(r => r.created_at).filter(Boolean).sort();
    console.log(`\nDate Range: ${dates[0]} → ${dates[dates.length - 1]}`);
  }

  console.log('\n=== Existing Signal Infrastructure ===');
  console.log('Write services:');
  console.log('  - classification-signal-service.ts: recordSignal, recordAIClassificationBatch, recordUserConfirmation, recordUserCorrection');
  console.log('  - signal-persistence.ts: persistSignal, persistSignalBatch');
  console.log('  - training-signal-service.ts: captureAIResponse, recordUserAction, recordOutcome');
  console.log('Read services:');
  console.log('  - signal-persistence.ts: getTrainingSignals');
  console.log('  - /api/signals: GET with summary stats');
  console.log('  - /api/platform/observatory?tab=ai: fetchAIIntelligence');
  console.log('Missing (to build in OB-86):');
  console.log('  - ai-metrics-service.ts: accuracy, calibration, flywheel computation');
  console.log('  - /api/ai/metrics: accuracy + health endpoint');
  console.log('  - /api/ai/calibration: calibration + flywheel endpoint');
  console.log('  - Enhanced AIIntelligenceTab.tsx: accuracy, calibration chart, flywheel trend');
  console.log('  - AdminDashboard.tsx: AI quality card');

  console.log('\n=== Phase 0 Audit Complete ===');
}

audit().catch(console.error);
