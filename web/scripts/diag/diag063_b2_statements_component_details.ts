/**
 * DIAG-063 / B2 follow-up — structural key shape of components[].details for the
 * componentType observed in the latest batch (prime_dag). READ-ONLY, keys only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('calculation_results')
    .select('id, components')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) { console.log('error:', error?.message ?? 'no rows'); return; }
  const comps = Array.isArray(data[0].components) ? (data[0].components as Record<string, unknown>[]) : [];
  comps.forEach((c, i) => {
    const d = (c.details ?? {}) as Record<string, unknown>;
    console.log(`component[${i}] type=${String(c.componentType)} details keys:`, Object.keys(d).sort().join(','));
  });

  // Distribution of componentType across ALL results (statuses only)
  const { data: all, error: e2 } = await supabase
    .from('calculation_results')
    .select('components');
  if (e2) { console.log('error:', e2.message); return; }
  const dist: Record<string, number> = {};
  for (const row of all ?? []) {
    const cs = Array.isArray(row.components) ? (row.components as Record<string, unknown>[]) : [];
    for (const c of cs) {
      const t = String(c.componentType ?? 'absent');
      dist[t] = (dist[t] ?? 0) + 1;
    }
  }
  console.log('componentType distribution across all calculation_results:', JSON.stringify(dist));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
