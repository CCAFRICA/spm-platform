// HF-222 Phase 6.4 M.0 — schema inspection for the calc-results table used in Phase 6.3.
import { createClient } from '@supabase/supabase-js';

const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // (a) Column inspection — replicating information_schema.columns query via service-role-friendly path:
  // probe one row, list keys; also use raw RPC-style describe if available.
  console.log('=== (a) calculation_results column inspection (via sample-row keys) ===');
  const { data: sample } = await sb.from('calculation_results').select('*').limit(1);
  if (sample && sample[0]) {
    for (const k of Object.keys(sample[0])) {
      console.log(`  ${k}: ${typeof (sample[0] as Record<string, unknown>)[k]} (sample=${JSON.stringify((sample[0] as Record<string, unknown>)[k]).slice(0, 80)})`);
    }
  }
  console.log('');

  // (b) Full example row for Meridian.
  const { data: meridianSample } = await sb.from('calculation_results')
    .select('*')
    .eq('tenant_id', MERIDIAN)
    .limit(1);
  console.log('=== (b) Meridian example row (verbatim JSONB) ===');
  console.log(JSON.stringify(meridianSample?.[0] ?? null, null, 2));
  console.log('');

  // (c) Structure determination — components stored where?
  const row = meridianSample?.[0] as Record<string, unknown> | undefined;
  console.log('=== (c) Component-storage structure ===');
  if (row?.components !== undefined) {
    const comps = row.components as Array<unknown> | null;
    if (Array.isArray(comps)) {
      console.log(`Structure: ONE ROW per (entity, period); components are stored as a JSONB ARRAY on the row.`);
      console.log(`Per-row component count for this sample: ${comps.length}`);
      if (comps.length > 0) {
        const c0 = comps[0] as Record<string, unknown>;
        console.log(`Per-component keys: ${Object.keys(c0).join(', ')}`);
        console.log(`Example component[0]: ${JSON.stringify(c0, null, 2)}`);
      }
    } else {
      console.log(`Structure: components column present but is not an array. Value: ${JSON.stringify(comps)}`);
    }
  } else {
    console.log('Structure: no `components` field on row. Component-level extraction surface unknown.');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
