/**
 * DIAG-063 / A3 (supplement) — entity_type / status distribution for the
 * probed multi-file tenant. READ-ONLY, counts only, no display_name values.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANT = '336af2a7-e9b3-445e-abea-85792afa893d';

async function main() {
  const { data: rows, error } = await supabase
    .from('entities')
    .select('entity_type, status')
    .eq('tenant_id', TENANT)
    .range(0, 1999);
  if (error) throw error;
  const dist = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = `${r.entity_type}/${r.status}`;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  console.log(`tenant=${TENANT} entity_type/status distribution:`);
  for (const [k, v] of Array.from(dist.entries()).sort()) console.log(`  ${k}=${v}`);
}

main().catch(e => { console.error('PROBE FAILED:', e.message ?? e); process.exit(1); });
