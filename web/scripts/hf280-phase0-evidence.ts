/**
 * HF-280 Phase 0.5 — evidence the post-HF-279 imports persisted PARTIAL plans.
 * Read-only. For each tenant matching BCL/Meridian: latest active rule_set's
 * per-variant component inventory (count + names + ratio/scale flags) and the
 * latest import_batches.error_summary componentOutcomes (failed + attempts).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

function ratioScaleFlags(components: any[]): string {
  // Walk each component's persisted compositional_intent for ratio dims + scale.
  let ratioDims = 0, scaleNodes = 0;
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.shape === 'banded_lookup' && Array.isArray(n.dimensions)) {
      for (const d of n.dimensions) if (d?.reference_source?.type === 'ratio') ratioDims++;
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v);
    }
  };
  for (const c of components) {
    const ci = c?.metadataExtension?.compositional_intent ?? c?.metadata?.compositional_intent;
    if (ci?.structure) walk(ci.structure);
    if (ci?.scale) scaleNodes++;
  }
  return `ratioDims=${ratioDims} scaleNodes=${scaleNodes}`;
}

async function main() {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .or('name.ilike.%BCL%,name.ilike.%Banco%,name.ilike.%Meridian%');
  console.log('=== tenants matched ===');
  console.log((tenants ?? []).map(t => `${t.name} :: ${t.id}`).join('\n') || '(none)');

  for (const t of tenants ?? []) {
    console.log(`\n========================================\nTENANT: ${t.name} (${t.id})`);
    const { data: rsList } = await supabase
      .from('rule_sets')
      .select('id, name, status, version, components, created_at')
      .eq('tenant_id', t.id)
      .order('created_at', { ascending: false })
      .limit(3);
    for (const rs of rsList ?? []) {
      let raw: any = rs.components;
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = {}; } }
      const variants: any[] = Array.isArray(raw?.variants) ? raw.variants
        : Array.isArray(raw) ? [{ variantId: '(flat)', components: raw }] : [];
      console.log(`\n  rule_set ${rs.id} status=${rs.status} v${rs.version} created=${rs.created_at}`);
      console.log(`    variants=${variants.length}`);
      for (const v of variants) {
        const comps: any[] = Array.isArray(v.components) ? v.components : [];
        // ratio/scale flags read the engine-format intent tree per component
        const names = comps.map(c => c.name ?? c.id ?? '(unnamed)');
        console.log(`    variant "${v.variantId ?? v.variant_id ?? '?'}": n=${comps.length} -> [${names.join(', ')}]`);
      }
    }

    const { data: batches } = await supabase
      .from('import_batches')
      .select('id, created_at, error_summary')
      .eq('tenant_id', t.id)
      .order('created_at', { ascending: false })
      .limit(5);
    console.log(`\n  --- latest import_batches.error_summary (componentOutcomes) ---`);
    for (const b of batches ?? []) {
      const es: any = b.error_summary;
      if (!es || !es.componentOutcomes) { console.log(`    batch ${b.id} ${b.created_at}: (no componentOutcomes)`); continue; }
      const outs = es.componentOutcomes as any[];
      const failed = outs.filter(o => o.status !== 'success');
      console.log(`    batch ${b.id} ${b.created_at}: partialSuccess=${es.partialSuccess} total=${outs.length} failed=${failed.length}`);
      for (const f of failed) {
        console.log(`        FAILED name="${f.name}" id=${f.id} status=${f.status} attempts=${f.attempts} errClass=${f.errClass} msg=${(f.errMessage ?? '').slice(0, 160)}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
