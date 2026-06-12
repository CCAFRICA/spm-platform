/**
 * DIAG-063 / B1 — L3/L4 shape probe (READ-ONLY)
 * Inspects KEY NAMES ONLY (no values) of components[].details and
 * metadata.intentTraces[0] on the most recent calculation_result.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('calculation_results')
    .select('id, components, metadata')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) { console.log('ERROR/empty', error?.message); return; }

  const r = data[0];
  const comps = Array.isArray(r.components) ? (r.components as Array<Record<string, unknown>>) : [];
  console.log(`result_id: ${r.id}`);
  comps.forEach((c, i) => {
    const d = c.details && typeof c.details === 'object' ? Object.keys(c.details as object).sort() : null;
    console.log(`component[${i}] details keys: ${JSON.stringify(d)}`);
  });

  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const traces = Array.isArray(meta.intentTraces) ? (meta.intentTraces as Array<Record<string, unknown>>) : [];
  if (traces.length) {
    const t0 = traces[0];
    console.log(`intentTraces[0] keys: ${JSON.stringify(Object.keys(t0).sort())}`);
    for (const k of Object.keys(t0)) {
      const v = t0[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        console.log(`  intentTraces[0].${k} keys: ${JSON.stringify(Object.keys(v as object).sort())}`);
      } else if (Array.isArray(v)) {
        console.log(`  intentTraces[0].${k}: array length ${v.length}` +
          (v.length && typeof v[0] === 'object' && v[0] !== null ? `, element keys ${JSON.stringify(Object.keys(v[0] as object).sort())}` : ''));
      }
    }
  } else {
    console.log('intentTraces: none');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
