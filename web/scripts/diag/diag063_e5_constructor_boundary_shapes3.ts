/**
 * DIAG-063 / E5 — pass 3 (READ-ONLY): for rule_sets whose components JSONB is an
 * OBJECT of named component configs (not the {variants:[...]} array shape), print
 * each component value's structural KEY SET only (no values), plus whether a
 * `prime`/`operation`/`calculationIntent` discriminator is present anywhere at
 * depth 1. Anonymization: tenant UUIDs only; keys and counts only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, tenant_id, status, components')
    .in('id', ['2054d734-2a3c-4cd7-b199-79d2f1c578f0', 'fc14ea6e-ecb9-40c7-a1d0-7d903fbf835b']);
  if (error) { console.error('query error:', error.message); process.exit(1); }

  for (const rs of data ?? []) {
    console.log(`rule_set=${rs.id} tenant=${rs.tenant_id} status=${rs.status}`);
    const c = rs.components as Record<string, unknown>;
    for (const [k, v] of Object.entries(c ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const keys = Object.keys(v as object);
        const vo = v as Record<string, unknown>;
        const hasPrime = typeof vo.prime === 'string';
        const hasOperation = typeof vo.operation === 'string';
        const hasCalcIntent = !!vo.calculationIntent || !!vo.calculation_intent;
        console.log(`  component_key=${k} valueType=object keys=[${keys.join(',')}] hasPrime=${hasPrime} hasOperation=${hasOperation} hasCalculationIntent=${hasCalcIntent}`);
      } else {
        console.log(`  component_key=${k} valueType=${Array.isArray(v) ? 'array' : typeof v}`);
      }
    }
  }
}

main();
