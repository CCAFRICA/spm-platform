/**
 * OB-148 Phase 2C: Investigate 15 entities with $0 Óptica
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('--- 15 Zero-Óptica Entities ---\n');
  
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();
  if (!enero) return;

  // Get all results and find zero-Óptica entities
  const { data: allResults } = await supabase
    .from('calculation_results')
    .select('entity_id, components')
    .eq('tenant_id', tenantId);

  if (!allResults) return;

  const zeroOpticaEntityIds: string[] = [];
  for (const r of allResults) {
    const comps = (r.components ?? []) as Array<Record<string, any>>;
    const optica = comps.find(c => String(c.componentName ?? '').includes('ptica'));
    if (optica && Number(optica.payout ?? 0) === 0) {
      zeroOpticaEntityIds.push(r.entity_id);
    }
  }

  console.log(`Zero-Óptica entities: ${zeroOpticaEntityIds.length}`);

  // Get entity details
  for (const entId of zeroOpticaEntityIds.slice(0, 8)) {
    const { data: ent } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('id', entId)
      .single();
    if (!ent) continue;

    const meta = ent.metadata as Record<string, any>;
    console.log(`\nEntity ${ent.external_id} (store: ${meta.store_id})`);

    // Check committed_data for this entity
    const { data: cd } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('entity_id', ent.id);

    if (cd) {
      for (const row of cd) {
        const rd = row.row_data as Record<string, any>;
        const dt = row.data_type;
        if (dt.includes('venta_individual')) {
          console.log(`  ${dt}: Cumplimiento=${rd.Cumplimiento}, Meta=${rd.Meta}, Real=${rd.Real}`);
        }
      }
      if (cd.length === 0) {
        console.log('  NO committed_data rows');
      } else {
        console.log(`  ${cd.length} total rows, sheets: ${[...new Set(cd.map(r => r.data_type))].join(', ')}`);
      }
    }
  }

  // Also check: what is the full matrixConfig including all keys?
  console.log('\n\n--- Full Óptica matrixConfig Keys ---');
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();
  if (rs) {
    const comps = rs.components as Array<Record<string, any>>;
    const optica = comps.find(c => String(c.name).includes('ptica'));
    if (optica) {
      console.log('matrixConfig all keys:', Object.keys(optica.matrixConfig));
      console.log('Full matrixConfig:', JSON.stringify(optica.matrixConfig, null, 2));
    }
  }

  // Check OB-75 tenant with better error handling
  console.log('\n\n--- OB-75 Tenant Óptica ---');
  const ob75Id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
  const { data: ob75Rs } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', ob75Id)
    .eq('status', 'active')
    .single();
  if (ob75Rs) {
    const raw = ob75Rs.components;
    console.log('Components type:', typeof raw, Array.isArray(raw));
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      // Might be an object keyed by name
      const obj = raw as Record<string, any>;
      for (const [key, val] of Object.entries(obj)) {
        if (key.toLowerCase().includes('optic') || key.toLowerCase().includes('ptic')) {
          console.log(`Found Óptica key: ${key}`);
          console.log(JSON.stringify(val, null, 2));
        }
      }
    } else if (Array.isArray(raw)) {
      for (const c of raw) {
        const name = String(c.name ?? c.componentName ?? '');
        if (name.toLowerCase().includes('ptic') || name.toLowerCase().includes('optic')) {
          console.log(`Found: ${name}`);
          console.log(JSON.stringify(c.matrixConfig ?? c, null, 2));
        }
      }
    }
  }
}

main().catch(console.error);
