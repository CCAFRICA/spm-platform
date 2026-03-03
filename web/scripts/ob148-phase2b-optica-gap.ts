/**
 * OB-148 Phase 2B: Diagnose Óptica gap (69.6%)
 * 
 * Investigate: matrix values, volume tier distribution, variant resolution
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 2B: ÓPTICA GAP DIAGNOSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Get the matrix config from active rule set
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, components, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) { console.error('No active rule set'); return; }

  const components = rs.components as Array<Record<string, any>>;
  const opticaComp = components.find(c => String(c.name).includes('ptica'));

  if (!opticaComp) { console.error('No Óptica component found'); return; }

  console.log('--- Óptica Matrix Config ---');
  console.log(`Component: ${opticaComp.name}`);
  console.log(`Type: ${opticaComp.componentType}`);
  const mc = opticaComp.matrixConfig;
  console.log(`rowMetric: ${mc.rowMetric}`);
  console.log(`colMetric: ${mc.colMetric}`);
  console.log(`\nRow bands: ${JSON.stringify(mc.rowBands)}`);
  console.log(`Col bands: ${JSON.stringify(mc.colBands)}`);
  console.log(`\nMatrix values:`);
  if (mc.values) {
    for (let r = 0; r < mc.values.length; r++) {
      console.log(`  Row ${r} (${mc.rowBands?.[r]?.label ?? r}): ${JSON.stringify(mc.values[r])}`);
    }
  }
  if (mc.variants && mc.variants.length > 0) {
    console.log(`\nVariants: ${mc.variants.length}`);
    for (const v of mc.variants) {
      console.log(`  Variant: ${v.name || v.variantId || v.label}`);
      if (v.values) {
        for (let r = 0; r < v.values.length; r++) {
          console.log(`    Row ${r}: ${JSON.stringify(v.values[r])}`);
        }
      }
    }
  }

  // 2. Distribution of entities across matrix cells
  console.log('\n\n--- Entity Distribution Across Óptica Cells ---');
  const cellCounts = new Map<string, { count: number; totalPayout: number }>();
  let totalOpticaPayout = 0;
  let opticaEntities = 0;
  let opticaNonZero = 0;
  
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    
    for (const row of data) {
      const comps = (row.components ?? []) as Array<Record<string, any>>;
      const optica = comps.find(c => String(c.componentName ?? '').includes('ptica'));
      if (!optica) continue;
      opticaEntities++;
      const payout = Number(optica.payout ?? 0);
      totalOpticaPayout += payout;
      if (payout > 0) opticaNonZero++;
      
      const details = optica.details ?? {};
      const rowBand = String(details.rowBand ?? 'unknown');
      const colBand = String(details.colBand ?? 'unknown');
      const cellKey = `${rowBand}|${colBand}`;
      
      if (!cellCounts.has(cellKey)) cellCounts.set(cellKey, { count: 0, totalPayout: 0 });
      const entry = cellCounts.get(cellKey)!;
      entry.count++;
      entry.totalPayout += payout;
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`Total Óptica entities: ${opticaEntities}`);
  console.log(`Non-zero: ${opticaNonZero}`);
  console.log(`Total payout: MX$${Math.round(totalOpticaPayout).toLocaleString()}`);
  console.log(`Average (non-zero): MX$${opticaNonZero > 0 ? (totalOpticaPayout / opticaNonZero).toFixed(0) : 0}`);
  console.log(`Benchmark avg: MX$${(748600 / 719).toFixed(0)}`);

  console.log('\nCell distribution:');
  const sortedCells = Array.from(cellCounts.entries()).sort((a, b) => b[1].totalPayout - a[1].totalPayout);
  for (const [cellKey, info] of sortedCells) {
    const [row, col] = cellKey.split('|');
    const avgPayout = info.count > 0 ? (info.totalPayout / info.count).toFixed(0) : 0;
    console.log(`  ${row.padEnd(12)} | ${col.padEnd(12)} | ${info.count} entities | MX$${Math.round(info.totalPayout).toLocaleString()} | avg MX$${avgPayout}`);
  }

  // 3. Volume tier distribution
  console.log('\n\n--- Volume Tier Distribution ---');
  const tierDist = new Map<string, number>();
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    
    for (const row of data) {
      const comps = (row.components ?? []) as Array<Record<string, any>>;
      const optica = comps.find(c => String(c.componentName ?? '').includes('ptica'));
      if (!optica) continue;
      const details = optica.details ?? {};
      const colVal = String(details.colValue ?? details.colBand ?? 'unknown');
      const colBand = String(details.colBand ?? 'unknown');
      const key = `${colBand} (val=${colVal})`;
      tierDist.set(key, (tierDist.get(key) ?? 0) + 1);
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (const [key, count] of Array.from(tierDist.entries()).sort()) {
    console.log(`  ${key}: ${count} entities`);
  }

  // 4. Check attainment distribution
  console.log('\n\n--- Individual Attainment Distribution ---');
  const attBuckets: Record<string, number> = { '<80%': 0, '80-99%': 0, '100-119%': 0, '120%+': 0, 'missing': 0 };
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    
    for (const row of data) {
      const comps = (row.components ?? []) as Array<Record<string, any>>;
      const optica = comps.find(c => String(c.componentName ?? '').includes('ptica'));
      if (!optica) continue;
      const details = optica.details ?? {};
      const rowVal = Number(details.rowValue ?? 0);
      if (!details.rowValue && !details.rowBand) attBuckets['missing']++;
      else if (rowVal < 80) attBuckets['<80%']++;
      else if (rowVal < 100) attBuckets['80-99%']++;
      else if (rowVal < 120) attBuckets['100-119%']++;
      else attBuckets['120%+']++;
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  for (const [bucket, count] of Object.entries(attBuckets)) {
    console.log(`  ${bucket}: ${count} entities`);
  }

  // 5. Check OB-75 reference — what was their Óptica matrix config?
  console.log('\n\n--- OB-75 Reference Tenant Óptica Config ---');
  const pipelineTenantId = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
  const { data: ob75Rs } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', pipelineTenantId)
    .eq('status', 'active')
    .single();

  if (ob75Rs) {
    const ob75Comps = ob75Rs.components as Array<Record<string, any>>;
    const ob75Optica = ob75Comps.find(c => String(c.name).includes('ptica'));
    if (ob75Optica) {
      const ob75mc = ob75Optica.matrixConfig;
      console.log(`OB-75 rowMetric: ${ob75mc.rowMetric}`);
      console.log(`OB-75 colMetric: ${ob75mc.colMetric}`);
      console.log(`OB-75 row bands: ${JSON.stringify(ob75mc.rowBands)}`);
      console.log(`OB-75 col bands: ${JSON.stringify(ob75mc.colBands)}`);
      if (ob75mc.values) {
        console.log('OB-75 matrix values:');
        for (let r = 0; r < ob75mc.values.length; r++) {
          console.log(`  Row ${r} (${ob75mc.rowBands?.[r]?.label ?? r}): ${JSON.stringify(ob75mc.values[r])}`);
        }
      }
      if (ob75mc.variants && ob75mc.variants.length > 0) {
        console.log(`OB-75 variants: ${ob75mc.variants.length}`);
        for (const v of ob75mc.variants) {
          console.log(`  Variant: ${v.name || v.variantId || v.label}`);
          if (v.values) {
            for (let r = 0; r < v.values.length; r++) {
              console.log(`    Row ${r}: ${JSON.stringify(v.values[r])}`);
            }
          }
        }
      }
    } else {
      console.log('OB-75 tenant has no Óptica component');
    }
  } else {
    console.log('OB-75 tenant has no active rule set');
  }

  // 6. Check if Certificado/Puesto data exists ANYWHERE
  console.log('\n\n--- Search for Certification Data ---');
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();

  if (enero) {
    // Sample 50 entity rows and check for any certification-related fields
    const { data: sampleRows } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .not('entity_id', 'is', null)
      .limit(50);

    if (sampleRows && sampleRows.length > 0) {
      const allKeys = new Set<string>();
      for (const r of sampleRows) {
        const rd = r.row_data as Record<string, unknown>;
        for (const k of Object.keys(rd)) {
          allKeys.add(k);
        }
      }
      const certKeys = Array.from(allKeys).filter(k => 
        /cert|puesto|tipo|rango|llave|tamañ|position|role/i.test(k)
      );
      console.log(`All unique keys in entity rows: ${Array.from(allKeys).sort().join(', ')}`);
      console.log(`\nCert/position-related keys: ${certKeys.join(', ') || 'NONE'}`);
      
      // Check parent sheet (store rows) for Rango
      const { data: storeRows } = await supabase
        .from('committed_data')
        .select('data_type, row_data')
        .eq('tenant_id', tenantId)
        .eq('period_id', enero.id)
        .is('entity_id', null)
        .limit(50);

      if (storeRows && storeRows.length > 0) {
        const storeKeys = new Set<string>();
        for (const r of storeRows) {
          const rd = r.row_data as Record<string, unknown>;
          for (const k of Object.keys(rd)) {
            storeKeys.add(k);
          }
        }
        const storeCertKeys = Array.from(storeKeys).filter(k => 
          /cert|puesto|tipo|rango|llave|tamañ|size|volum|tier/i.test(k)
        );
        console.log(`\nAll unique keys in store rows: ${Array.from(storeKeys).sort().join(', ')}`);
        console.log(`Tier/size-related store keys: ${storeCertKeys.join(', ') || 'NONE'}`);
        
        // Show a few store rows with these keys
        if (storeCertKeys.length > 0) {
          console.log('\nSample store row tier values:');
          for (const r of storeRows.slice(0, 5)) {
            const rd = r.row_data as Record<string, unknown>;
            const vals: string[] = [];
            for (const k of storeCertKeys) {
              if (rd[k] !== undefined && rd[k] !== null) vals.push(`${k}=${rd[k]}`);
            }
            if (vals.length > 0) console.log(`  ${r.data_type}: ${vals.join(', ')}`);
          }
        }
      }
    }
  }

  // 7. Check entity metadata for volume tier
  console.log('\n\n--- Entity Metadata Volume Tier ---');
  const { data: entSample } = await supabase
    .from('entities')
    .select('external_id, metadata')
    .eq('tenant_id', tenantId)
    .limit(10);

  if (entSample) {
    for (const e of entSample.slice(0, 5)) {
      const meta = e.metadata as Record<string, unknown>;
      console.log(`  Entity ${e.external_id}: store=${meta.store_id}, vol_tier=${meta.store_volume_tier}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Phase 2B: Óptica gap analysis complete');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
