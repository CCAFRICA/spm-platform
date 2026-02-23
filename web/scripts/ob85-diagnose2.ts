#!/usr/bin/env npx tsx
/**
 * OB-85 Diagnostic Part 2: Targeted follow-up
 */

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('=== OB-85 DIAGNOSTIC PART 2 ===\n');

  // Q1: import_batches with wildcard columns
  console.log('-- Q1: import_batches (all columns) --');
  const { data: ib, error: ibErr } = await supabase
    .from('import_batches')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  if (ibErr) console.log('  Error:', ibErr.message);
  console.log('  Found:', ib?.length ?? 0, 'rows');
  for (const b of ib ?? []) {
    console.log('  Batch:', b.id);
    console.log('    Columns:', Object.keys(b).join(', '));
    const meta = b.metadata as Record<string, unknown> | null;
    console.log('    Metadata keys:', meta ? Object.keys(meta).join(', ') : 'null');
    const aiCtx = meta?.ai_context as { sheets?: unknown[] } | undefined;
    console.log('    AI context sheets:', aiCtx?.sheets?.length ?? 'NONE');
    console.log('    Created:', b.created_at);
    console.log('    Status:', b.status);
  }

  // Q2: Find committed_data rows with import_batch_id
  console.log('\n-- Q2: committed_data import_batch_id values --');
  const { data: cdBatch } = await supabase
    .from('committed_data')
    .select('import_batch_id')
    .eq('tenant_id', TENANT_ID)
    .not('import_batch_id', 'is', null)
    .limit(10);

  console.log('  Rows with import_batch_id:', cdBatch?.length ?? 0);
  if (cdBatch && cdBatch.length > 0) {
    const ids = Array.from(new Set(cdBatch.map(r => r.import_batch_id)));
    console.log('  Unique batch IDs:', ids.join(', '));
  }

  // Also check if import_batch_id column even exists
  const { data: cdSample } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .limit(1);

  if (cdSample && cdSample.length > 0) {
    console.log('  committed_data columns:', Object.keys(cdSample[0]).join(', '));
  }

  // Q3: Look for 62df batch across all tables
  console.log('\n-- Q3: Search for import batch 62df8440 --');
  // Check if it's a partial UUID match
  const { data: ibAll } = await supabase
    .from('import_batches')
    .select('id, tenant_id, status, created_at')
    .limit(20);

  console.log('  All import_batches (any tenant):');
  for (const b of ibAll ?? []) {
    console.log('    ' + b.id + ' | tenant=' + b.tenant_id + ' | status=' + b.status + ' | ' + b.created_at);
    if (b.id.startsWith('62df')) {
      console.log('    >>> MATCH: 62df found!');
    }
  }

  // Q4: Check committed_data for LATEST period (2024-07) - what data is there?
  console.log('\n-- Q4: committed_data for 2024-07 (latest period) --');
  const { data: cd07 } = await supabase
    .from('committed_data')
    .select('data_type, entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', '65b16461-07b9-4bf4-a0b9-502cf7ba3ff7')
    .limit(3);

  for (const r of cd07 ?? []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log('  Sheet:', r.data_type, '| entity_id:', r.entity_id);
    console.log('    row_data:', JSON.stringify(rd).slice(0, 300));
  }

  // Q5: Check committed_data for 2024-01 (period with calculations)
  console.log('\n-- Q5: committed_data for 2024-01 (has batches) --');
  const { data: cd01 } = await supabase
    .from('committed_data')
    .select('data_type, entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', 'c90ae99f-cfd6-4346-8ae1-8373f9cab116')
    .limit(3);

  for (const r of cd01 ?? []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log('  Sheet:', r.data_type, '| entity_id:', r.entity_id);
    console.log('    row_data:', JSON.stringify(rd).slice(0, 300));
  }

  // Q6: Check ALL distinct data_types for 2024-01
  console.log('\n-- Q6: ALL sheets for 2024-01 --');
  const sheetCounts = new Map<string, number>();
  let p = 0;
  while (p < 10) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('data_type, entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', 'c90ae99f-cfd6-4346-8ae1-8373f9cab116')
      .range(p * 5000, (p + 1) * 5000 - 1);
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      const dt = r.data_type || '_null';
      sheetCounts.set(dt, (sheetCounts.get(dt) || 0) + 1);
    }
    if (rows.length < 5000) break;
    p++;
  }
  for (const [sheet, count] of Array.from(sheetCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log('  "' + sheet + '": ' + count + ' rows');
  }

  // Q7: Entity ID distribution for 2024-01
  console.log('\n-- Q7: Entity ID dist for 2024-01 --');
  let withEntity = 0;
  let withoutEntity = 0;
  const uniqueEntities = new Set<string>();
  p = 0;
  while (p < 10) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', 'c90ae99f-cfd6-4346-8ae1-8373f9cab116')
      .range(p * 5000, (p + 1) * 5000 - 1);
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      if (r.entity_id) {
        withEntity++;
        uniqueEntities.add(r.entity_id);
      } else {
        withoutEntity++;
      }
    }
    if (rows.length < 5000) break;
    p++;
  }
  console.log('  With entity_id:', withEntity, '(' + uniqueEntities.size + ' unique)');
  console.log('  Without entity_id:', withoutEntity);

  // Q8: Rule set components — raw JSON
  console.log('\n-- Q8: Rule Set Components (raw) --');
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (rs) {
    console.log('  Name:', rs.name);
    const compsJson = JSON.stringify(rs.components);
    // Print first 2000 chars
    console.log('  Components (first 2000 chars):');
    console.log(compsJson.slice(0, 2000));
    if (compsJson.length > 2000) {
      console.log('  ... (' + compsJson.length + ' total chars)');
    }
  }

  // Q9: How does the calculation route extract components from rule_set?
  console.log('\n-- Q9: Component extraction test --');
  if (rs) {
    const comps = rs.components as unknown;
    // Test if it's a flat array
    if (Array.isArray(comps)) {
      console.log('  Format: flat array, ' + comps.length + ' components');
    } else if (typeof comps === 'object' && comps !== null) {
      const obj = comps as Record<string, unknown>;
      console.log('  Format: object with keys:', Object.keys(obj).join(', '));
      if (obj.variants && Array.isArray(obj.variants)) {
        const variants = obj.variants as Array<Record<string, unknown>>;
        for (const v of variants) {
          console.log('  Variant:', v.variantId);
          if (Array.isArray(v.components)) {
            console.log('    Components:', v.components.length);
            for (const c of v.components as Array<Record<string, unknown>>) {
              console.log('      -', c.name, '| type=' + c.componentType, '| enabled=' + c.enabled);
            }
          }
        }
      }
    }
  }

  console.log('\n=== DIAGNOSTIC PART 2 COMPLETE ===');
}

diagnose().catch(console.error);
