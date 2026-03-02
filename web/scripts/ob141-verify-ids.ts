// OB-141 Phase 0: Verify IDs from database before any data operations
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-verify-ids.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  // 1. Find the Optica Luminar tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug');
  console.log('=== TENANTS ===');
  console.table(tenants);

  const olTenant = tenants?.find(t =>
    t.name?.toLowerCase().includes('optica') ||
    t.name?.toLowerCase().includes('luminar') ||
    t.slug?.includes('optica')
  );
  if (!olTenant) {
    console.error('ABORT: Cannot find Optica Luminar tenant');
    process.exit(1);
  }
  const TENANT_ID = olTenant.id;
  console.log(`\nTENANT_ID: ${TENANT_ID} (${olTenant.name})`);

  // 2. Verify rule_sets
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, status, created_at')
    .eq('tenant_id', TENANT_ID);
  console.log('\n=== RULE SETS ===');
  console.table(ruleSets);

  const originalRs = ruleSets?.find(rs => rs.name?.includes('Comisiones') || rs.name?.includes('Optica'));
  const importedRs = ruleSets?.find(rs => rs.name === 'Imported Plan');

  if (!originalRs) console.error('WARNING: Original rule_set not found by name');
  if (!importedRs) console.error('WARNING: Imported rule_set not found by name');

  console.log(`\nORIGINAL rule_set: ${originalRs?.id} — "${originalRs?.name}" — status: ${originalRs?.status}`);
  console.log(`IMPORTED rule_set: ${importedRs?.id} — "${importedRs?.name}" — status: ${importedRs?.status}`);

  // 3. Verify entity dates
  const allDates: string[] = [];
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('entities')
      .select('created_at')
      .eq('tenant_id', TENANT_ID)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    allDates.push(...page.map(e => e.created_at));
    offset += 1000;
    if (page.length < 1000) break;
  }

  const dateCounts: Record<string, number> = {};
  allDates.forEach(d => {
    const date = new Date(d).toISOString().split('T')[0];
    dateCounts[date] = (dateCounts[date] || 0) + 1;
  });
  console.log('\n=== ENTITY CREATION DATES ===');
  console.table(Object.entries(dateCounts).sort(([a], [b]) => a.localeCompare(b)).map(([d, c]) => ({ date: d, count: c })));

  const preSciDate = '2026-02-23';
  const seedCount = Object.entries(dateCounts)
    .filter(([d]) => d < preSciDate)
    .reduce((s, [_, c]) => s + c, 0);
  const sciCount = Object.entries(dateCounts)
    .filter(([d]) => d >= preSciDate)
    .reduce((s, [_, c]) => s + c, 0);
  console.log(`\nSeed entities (before ${preSciDate}): ${seedCount}`);
  console.log(`SCI entities (${preSciDate}+): ${sciCount}`);

  // 4. Verify committed_data batches
  const batchCounts: Record<string, number> = {};
  let cdOffset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', TENANT_ID)
      .range(cdOffset, cdOffset + 999);
    if (!page || page.length === 0) break;
    page.forEach(r => {
      batchCounts[r.import_batch_id || 'null'] = (batchCounts[r.import_batch_id || 'null'] || 0) + 1;
    });
    cdOffset += 1000;
    if (page.length < 1000) break;
  }

  console.log('\n=== COMMITTED DATA BY BATCH ===');
  const sortedBatches = Object.entries(batchCounts).sort((a, b) => b[1] - a[1]);
  console.table(sortedBatches.map(([id, count]) => ({ batch_id: id, rows: count })));

  const totalCd = Object.values(batchCounts).reduce((s, c) => s + c, 0);

  // 5. Summary
  console.log('\n========================================');
  console.log('VERIFY THESE VALUES BEFORE PROCEEDING:');
  console.log('========================================');
  console.log(`TENANT_ID:          ${TENANT_ID}`);
  console.log(`ORIGINAL_RS_ID:     ${originalRs?.id} (status: ${originalRs?.status})`);
  console.log(`IMPORTED_RS_ID:     ${importedRs?.id} (status: ${importedRs?.status})`);
  console.log(`SEED_ENTITIES:      ${seedCount}`);
  console.log(`SCI_ENTITIES:       ${sciCount}`);
  console.log(`TOTAL_CD_ROWS:      ${totalCd}`);
  console.log(`IMPORT_BATCHES:     ${sortedBatches.length}`);
  console.log('========================================');
}

verify().catch(console.error);
