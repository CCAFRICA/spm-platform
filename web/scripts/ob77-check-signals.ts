/**
 * OB-77 Mission 2 Verification: Training Signal Capture
 *
 * Tests:
 * 1. Signal persistence imports are wired in all three locations
 * 2. Signal types use correct naming convention
 * 3. Fire-and-forget pattern used (no await on persistSignal)
 * 4. Existing signals in classification_signals table (if any)
 * 5. Signal schema matches expected structure
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

async function main() {
  const webRoot = path.resolve(__dirname, '..');

  // ──────────────────────────────────────────────
  // Test 1: Signal wiring in calculation route
  // ──────────────────────────────────────────────
  console.log('=== Test 1: Calculation Route Signal Wiring ===');

  const routePath = path.join(webRoot, 'src/app/api/calculation/run/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  assert(
    routeContent.includes("import { persistSignal } from '@/lib/ai/signal-persistence'"),
    'route.ts imports persistSignal'
  );
  assert(
    routeContent.includes("signalType: 'training:dual_path_concordance'"),
    'route.ts uses training:dual_path_concordance signal type'
  );
  assert(
    routeContent.includes('matchCount: intentMatchCount'),
    'route.ts captures matchCount'
  );
  assert(
    routeContent.includes('concordanceRate:'),
    'route.ts captures concordanceRate'
  );
  assert(
    routeContent.includes('.catch(err =>'),
    'route.ts uses fire-and-forget pattern'
  );

  // ──────────────────────────────────────────────
  // Test 2: Signal wiring in approval route
  // ──────────────────────────────────────────────
  console.log('\n=== Test 2: Approval Route Signal Wiring ===');

  const approvalPath = path.join(webRoot, 'src/app/api/approvals/[id]/route.ts');
  const approvalContent = fs.readFileSync(approvalPath, 'utf-8');

  assert(
    approvalContent.includes("import { persistSignal } from '@/lib/ai/signal-persistence'"),
    'approval route imports persistSignal'
  );
  assert(
    approvalContent.includes("signalType: 'training:lifecycle_transition'"),
    'approval route uses training:lifecycle_transition signal type'
  );
  assert(
    approvalContent.includes("source: 'user_confirmed'"),
    'approval route marks source as user_confirmed'
  );
  assert(
    approvalContent.includes("trigger: 'approval_decision'"),
    'approval route has trigger context'
  );

  // ──────────────────────────────────────────────
  // Test 3: Signal wiring in lifecycle service
  // ──────────────────────────────────────────────
  console.log('\n=== Test 3: Lifecycle Service Signal Wiring ===');

  const lifecyclePath = path.join(webRoot, 'src/lib/calculation/calculation-lifecycle-service.ts');
  const lifecycleContent = fs.readFileSync(lifecyclePath, 'utf-8');

  assert(
    lifecycleContent.includes("import { persistSignal } from '@/lib/ai/signal-persistence'"),
    'lifecycle service imports persistSignal'
  );
  assert(
    lifecycleContent.includes("signalType: 'training:lifecycle_transition'"),
    'lifecycle service uses training:lifecycle_transition signal type'
  );
  assert(
    lifecycleContent.includes("trigger: 'lifecycle_service'"),
    'lifecycle service has trigger context'
  );

  // ──────────────────────────────────────────────
  // Test 4: Signal persistence service structure
  // ──────────────────────────────────────────────
  console.log('\n=== Test 4: Signal Persistence Service ===');

  const persistPath = path.join(webRoot, 'src/lib/ai/signal-persistence.ts');
  const persistContent = fs.readFileSync(persistPath, 'utf-8');

  assert(
    persistContent.includes('export async function persistSignal'),
    'persistSignal is exported'
  );
  assert(
    persistContent.includes('export async function persistSignalBatch'),
    'persistSignalBatch is exported'
  );
  assert(
    persistContent.includes('export async function getTrainingSignals'),
    'getTrainingSignals is exported'
  );
  assert(
    persistContent.includes("from('classification_signals')"),
    'writes to classification_signals table'
  );

  // ──────────────────────────────────────────────
  // Test 5: Check classification_signals table exists
  // ──────────────────────────────────────────────
  console.log('\n=== Test 5: Classification Signals Table ===');

  const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

  const { data: signals, error: sigErr } = await supabase
    .from('classification_signals')
    .select('id, signal_type, confidence, source, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(20);

  assert(!sigErr, `classification_signals table accessible (${sigErr?.message ?? 'OK'})`);
  console.log(`  INFO: ${signals?.length ?? 0} signals found for tenant`);

  if (signals && signals.length > 0) {
    // Check signal types present
    const types = Array.from(new Set(signals.map(s => s.signal_type)));
    console.log(`  INFO: Signal types: ${types.join(', ')}`);

    const hasDualPath = types.some(t => t === 'training:dual_path_concordance');
    const hasLifecycle = types.some(t => t === 'training:lifecycle_transition');
    console.log(`  INFO: Has dual_path_concordance: ${hasDualPath}`);
    console.log(`  INFO: Has lifecycle_transition: ${hasLifecycle}`);
  }

  // ──────────────────────────────────────────────
  // Test 6: Run a quick write+read round-trip
  // ──────────────────────────────────────────────
  console.log('\n=== Test 6: Signal Round-Trip Test ===');

  const testSignalId = crypto.randomUUID();
  const { error: writeErr } = await supabase
    .from('classification_signals')
    .insert({
      tenant_id: TENANT_ID,
      signal_type: 'training:ob77_verification',
      signal_value: {
        testId: testSignalId,
        source: 'ob77-check-signals.ts',
        timestamp: new Date().toISOString(),
      },
      confidence: 1.0,
      source: 'ai_prediction',
      context: { verification: true },
    });

  assert(!writeErr, `Write signal succeeded (${writeErr?.message ?? 'OK'})`);

  const { data: readBack } = await supabase
    .from('classification_signals')
    .select('signal_value')
    .eq('tenant_id', TENANT_ID)
    .eq('signal_type', 'training:ob77_verification')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const readValue = readBack?.signal_value as Record<string, unknown> | null;
  assert(readValue?.testId === testSignalId, 'Read-back matches written signal');

  // Clean up test signal
  await supabase
    .from('classification_signals')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('signal_type', 'training:ob77_verification');

  // ──────────────────────────────────────────────
  // Test 7: No-blocking pattern verification
  // ──────────────────────────────────────────────
  console.log('\n=== Test 7: Fire-and-Forget Pattern ===');

  // Verify all three locations use .catch() (fire-and-forget, not await)
  const routeAwaitCount = (routeContent.match(/await\s+persistSignal/g) || []).length;
  const approvalAwaitCount = (approvalContent.match(/await\s+persistSignal/g) || []).length;
  const lifecycleAwaitCount = (lifecycleContent.match(/await\s+persistSignal/g) || []).length;

  assert(routeAwaitCount === 0, `route.ts: 0 await persistSignal calls (got ${routeAwaitCount})`);
  assert(approvalAwaitCount === 0, `approval route: 0 await persistSignal calls (got ${approvalAwaitCount})`);
  assert(lifecycleAwaitCount === 0, `lifecycle service: 0 await persistSignal calls (got ${lifecycleAwaitCount})`);

  // Count .catch() calls that follow persistSignal blocks (multiline-safe)
  const routeCatchCount = (routeContent.match(/\}\)\.catch\(err\s*=>/g) || []).length;
  const approvalCatchCount = (approvalContent.match(/\}\)\.catch\(err\s*=>/g) || []).length;
  const lifecycleCatchCount = (lifecycleContent.match(/\}\)\.catch\(err\s*=>/g) || []).length;

  assert(routeCatchCount >= 1, `route.ts: has .catch() handler (${routeCatchCount})`);
  assert(approvalCatchCount >= 1, `approval route: has .catch() handler (${approvalCatchCount})`);
  assert(lifecycleCatchCount >= 1, `lifecycle service: has .catch() handler (${lifecycleCatchCount})`);

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
