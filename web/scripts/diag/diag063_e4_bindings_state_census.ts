// DIAG-063 / E4 — Binding-state census (READ-ONLY, structural only).
// For each rule_set: does input_bindings carry metric_derivations,
// convergence_bindings, convergence_version? UUIDs/statuses/counts only.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, tenant_id, status, input_bindings, updated_at')
    .limit(1000);
  if (error) { console.error('query error:', error.message); process.exit(1); }

  for (const rs of data ?? []) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const derivs = Array.isArray(ib?.metric_derivations) ? (ib!.metric_derivations as unknown[]).length : 0;
    const cb = ib?.convergence_bindings && typeof ib.convergence_bindings === 'object'
      ? Object.keys(ib.convergence_bindings as Record<string, unknown>).length : 0;
    const ver = typeof ib?.convergence_version === 'string' ? ib.convergence_version : 'none';
    const topKeys = ib && typeof ib === 'object' ? Object.keys(ib).join(',') : '(null)';
    console.log(
      `rule_set=${rs.id} tenant=${rs.tenant_id} status=${rs.status} ` +
      `derivations=${derivs} convergence_bindings=${cb} version=${ver} ` +
      `input_bindings_keys=[${topKeys}] updated_at=${rs.updated_at}`,
    );
  }
  console.log(`total rule_sets: ${(data ?? []).length}`);
}

main();
