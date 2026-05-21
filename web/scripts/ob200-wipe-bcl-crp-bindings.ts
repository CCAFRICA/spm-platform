// OB-200 Phase 5 verification: wipe BCL + CRP convergence bindings so the
// next calculation reruns the OB-200 unified convergence pipeline against
// the current rule_sets and emits scale metadata / scope into bindings.
//
// Run from /Users/AndrewAfrica/spm-platform/web:
//   set -a && source .env.local && set +a
//   npx tsx scripts/ob200-wipe-bcl-crp-bindings.ts
//
// The script touches input_bindings only — calculationIntent on components is
// preserved. The next calc invocation will rebuild bindings + derivations
// through the OB-200 unified pass (filters + scope + LLM-emitted scale).

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const CRP = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

async function wipe(tenantId: string, name: string): Promise<void> {
  const { data: before } = await sb
    .from('rule_sets')
    .select('id, name, status, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  console.log(`=== ${name} (${tenantId}) ===`);
  console.log(`Active rule_sets: ${before?.length ?? 0}`);
  for (const r of before ?? []) {
    const ib = r.input_bindings as Record<string, unknown> | null;
    const cbKeys = ib && typeof ib === 'object' && ib.convergence_bindings
      ? Object.keys(ib.convergence_bindings as Record<string, unknown>).length
      : 0;
    const derivCount = ib && Array.isArray(ib.metric_derivations)
      ? (ib.metric_derivations as unknown[]).length
      : 0;
    console.log(`  ${r.id} "${r.name}": ${cbKeys} component bindings, ${derivCount} derivations`);
  }

  const { error } = await sb
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  if (error) {
    console.log(`  WIPE FAILED: ${error.message}`);
    return;
  }
  console.log(`  WIPED: input_bindings = '{}'`);
  console.log();
}

(async () => {
  await wipe(BCL, 'BCL');
  await wipe(CRP, 'CRP');
  console.log('Done. Trigger a calc through the browser (or the periods page) to ');
  console.log('regenerate bindings through the OB-200 unified pipeline.');
})();
