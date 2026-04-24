// HF-193 Phase 3.4 — Purge plan_agent_seeds JSONB from all rule_sets.
// Preserves all other input_bindings keys (metric_derivations, convergence_bindings, etc.).
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // BEFORE count
  const { count: before, error: beforeErr } = await sb
    .from('rule_sets')
    .select('id', { count: 'exact', head: true })
    .not('input_bindings->plan_agent_seeds', 'is', null);
  if (beforeErr) {
    console.error('BEFORE count failed:', beforeErr.message);
    process.exit(1);
  }
  console.log('rule_sets with seeds BEFORE:', before);

  // Fetch affected ids for audit trail
  const { data: affected, error: affectedErr } = await sb
    .from('rule_sets')
    .select('id, tenant_id, name')
    .not('input_bindings->plan_agent_seeds', 'is', null);
  if (affectedErr) {
    console.error('affected lookup failed:', affectedErr.message);
    process.exit(1);
  }
  console.log('affected rule_sets:', JSON.stringify(affected, null, 2));

  // Per-row delete-key update — preserves all other input_bindings keys.
  for (const rs of affected ?? []) {
    const { data: current, error: readErr } = await sb
      .from('rule_sets')
      .select('input_bindings')
      .eq('id', rs.id)
      .single();
    if (readErr) {
      console.error(`read failed for ${rs.id}:`, readErr.message);
      continue;
    }
    const nextBindings = { ...(current?.input_bindings as Record<string, unknown> ?? {}) };
    delete nextBindings.plan_agent_seeds;
    const { error: updateErr } = await sb
      .from('rule_sets')
      .update({ input_bindings: nextBindings })
      .eq('id', rs.id);
    if (updateErr) {
      console.error(`update failed for ${rs.id}:`, updateErr.message);
      continue;
    }
    console.log(`purged: ${rs.id} (${rs.name})`);
  }

  // AFTER count
  const { count: after, error: afterErr } = await sb
    .from('rule_sets')
    .select('id', { count: 'exact', head: true })
    .not('input_bindings->plan_agent_seeds', 'is', null);
  if (afterErr) {
    console.error('AFTER count failed:', afterErr.message);
    process.exit(1);
  }
  console.log('rule_sets with seeds AFTER:', after);
}

main().catch(err => {
  console.error('Top-level error:', err);
  process.exit(1);
});
