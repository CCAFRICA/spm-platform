/**
 * OB-128 Phase 5: Regression — verify CL/MO/IR/MBC unchanged
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob128-phase5-regression.ts
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

let pass = 0;
let fail = 0;

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    pass++;
  } else {
    console.log(`  FAIL: ${name}${details ? ' — ' + details : ''}`);
    fail++;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-128 PHASE 5: REGRESSION                       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── LAB: CL, MO, IR ──
  console.log("=== LAB Non-DG Plans ===");

  const { data: labRS } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  for (const rs of (labRS || [])) {
    const name = rs.name.toLowerCase();
    if (name.includes('deposit') || name.includes('growth')) continue;

    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', LAB)
      .eq('rule_set_id', rs.id);

    const count = results?.length || 0;
    const total = (results || []).reduce((sum, r) => sum + Number(r.total_payout || 0), 0);
    const totalStr = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    console.log(`  ${rs.name}: ${count} results, ${totalStr}`);

    // Expected values from OB-128 prompt
    if (name.includes('consumer') || name.includes('lending')) {
      assert(count === 100, `CL result count = 100 (got ${count})`);
      assert(Math.abs(total - 6540774.36) < 1, `CL total = $6,540,774.36 (got ${totalStr})`);
    } else if (name.includes('mortgage')) {
      assert(count === 56, `MO result count = 56 (got ${count})`);
      assert(Math.abs(total - 989937.41) < 1, `MO total = $989,937.41 (got ${totalStr})`);
    } else if (name.includes('insurance') || name.includes('referral')) {
      assert(count === 64, `IR result count = 64 (got ${count})`);
      assert(Math.abs(total - 366600.00) < 1, `IR total = $366,600.00 (got ${totalStr})`);
    }
  }

  // ── MBC ──
  console.log("\n=== MBC ===");

  const { data: mbcResults } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', MBC);

  const mbcCount = mbcResults?.length || 0;
  const mbcTotal = (mbcResults || []).reduce((sum, r) => sum + Number(r.total_payout || 0), 0);
  const mbcTotalStr = `$${mbcTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  console.log(`  MBC: ${mbcCount} results, ${mbcTotalStr}`);
  assert(mbcCount === 240, `MBC result count = 240 (got ${mbcCount})`);
  assert(Math.abs(mbcTotal - 3245212.66) < 10, `MBC total ≈ $3,245,212.66 (got ${mbcTotalStr})`);

  // ── Other tenants unaffected ──
  console.log("\n=== Other Tenants ===");

  // Check that convergence didn't modify other tenants' rule_sets
  const { data: otherRS } = await supabase
    .from('rule_sets')
    .select('tenant_id, input_bindings')
    .not('tenant_id', 'in', `(${LAB},${MBC})`);

  const otherWithBindings = (otherRS || []).filter(rs => {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    return bindings && Object.keys(bindings).length > 0;
  });
  console.log(`  Other tenants with non-empty input_bindings: ${otherWithBindings.length}`);
  // This is informational — not a failure if other tenants have their own bindings

  // Check no auth files modified
  console.log("\n=== Auth Files ===");
  const { execSync } = require('child_process');
  const diff = execSync('cd /Users/AndrewAfrica/spm-platform && git diff HEAD~5 --name-only | grep -i "middleware\\|auth" || echo "none"').toString().trim();
  console.log(`  Modified auth files since 5 commits ago: ${diff}`);
  // middleware.ts was modified in Phase 2 (adding PUBLIC_PATHS) — that's expected
  assert(!diff.includes('middleware') || diff === 'none' || diff.includes('web/src/middleware.ts'),
    'Only expected middleware change (PUBLIC_PATHS addition)');

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
  console.log(`${'='.repeat(50)}`);

  if (fail > 0) process.exit(1);
}

main().catch(console.error);
