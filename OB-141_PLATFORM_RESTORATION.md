# OB-141: PLATFORM RESTORATION
## Data Cleanup + Recurrence Prevention
## Depends on: OB-140 (PR #158) — Diagnosis
## Estimated Duration: 1.5–2 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `OB-140_DIAGNOSIS.md` — the evidence this OB acts on. Read every finding.
4. `OB-140_ARCHITECTURE_TRACE_OUTPUT.txt` — raw database state
5. `OB-140_CALCULATION_TRACE_OUTPUT.txt` — raw calculation forensics
6. This entire prompt before executing anything

---

## CONTEXT

OB-140 diagnosed 8 contributing factors to the Alpha benchmark failure. This OB fixes them in two phases: data restoration first, then code fixes to prevent recurrence.

**The Alpha benchmark:** 719 entities, 6 components, MX$1,253,832 total, $0.00 delta.

| Component | Expected Payout |
|-----------|----------------|
| Venta Optica (Optical Sales) | MX$748,600 |
| Venta Tienda (Store Sales) | MX$116,250 |
| Clientes Nuevos (New Customers) | MX$39,100 |
| Cobranza (Collections) | MX$283,000 |
| Club de Proteccion (Insurance) | MX$10 |
| Garantia Extendida (Warranty) | MX$66,872 |
| **TOTAL** | **MX$1,253,832** |

**Key IDs from OB-140 traces:**
- Óptica Luminar tenant: Find from `tenants` table (slug: `optica-luminar` or name containing `Optica` or `Luminar`)
- Original rule_set: `b1b2c3d4` — "Plan de Comisiones Optica Luminar 2026" — currently `archived`
- Imported rule_set: `7657fc95` — "Imported Plan" — currently `active`
- Original committed_data batch: `46837ff1`
- Seed entities: 22 entities created before `2026-02-23`

**CRITICAL:** Verify these IDs from Phase 0 before executing any data operations. OB-140 trace output has the exact values — do NOT assume the IDs above are correct. Read them from the database.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT from web/.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx).
6. **Supabase .in() ≤ 200 items.**

---

## PHASE 0: COMMIT PROMPT + VERIFY IDS

```bash
cp OB-141_PLATFORM_RESTORATION.md web/prompts/
cd /path/to/spm-platform
git add -A
git commit -m "OB-141 Phase 0: Commit restoration prompt"
git push origin dev
```

Then verify the IDs from the database:

```typescript
// web/scripts/ob141-verify-ids.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  // 1. Find the Óptica Luminar tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug');
  console.log('=== TENANTS ===');
  console.table(tenants);
  
  // Identify the correct tenant — look for optica/luminar/ptc
  const olTenant = tenants?.find(t => 
    t.name?.toLowerCase().includes('optica') || 
    t.name?.toLowerCase().includes('luminar') ||
    t.slug?.includes('optica')
  );
  if (!olTenant) {
    console.error('ABORT: Cannot find Óptica Luminar tenant');
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
  const { data: entityDates } = await supabase
    .from('entities')
    .select('created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true });
  
  const dateCounts: Record<string, number> = {};
  entityDates?.forEach(e => {
    const date = new Date(e.created_at).toISOString().split('T')[0];
    dateCounts[date] = (dateCounts[date] || 0) + 1;
  });
  console.log('\n=== ENTITY CREATION DATES ===');
  console.table(Object.entries(dateCounts).map(([d, c]) => ({ date: d, count: c })));
  
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
  const { data: cdBatches } = await supabase
    .from('committed_data')
    .select('import_batch_id')
    .eq('tenant_id', TENANT_ID);
  
  const batchCounts: Record<string, number> = {};
  cdBatches?.forEach(r => { 
    batchCounts[r.import_batch_id || 'null'] = (batchCounts[r.import_batch_id || 'null'] || 0) + 1; 
  });
  console.log('\n=== COMMITTED DATA BY BATCH ===');
  const sortedBatches = Object.entries(batchCounts)
    .sort((a, b) => b[1] - a[1]);
  console.table(sortedBatches.map(([id, count]) => ({ batch_id: id, rows: count })));

  // 5. Summary for human verification
  console.log('\n========================================');
  console.log('VERIFY THESE VALUES BEFORE PROCEEDING:');
  console.log('========================================');
  console.log(`TENANT_ID:          ${TENANT_ID}`);
  console.log(`ORIGINAL_RS_ID:     ${originalRs?.id} (status: ${originalRs?.status})`);
  console.log(`IMPORTED_RS_ID:     ${importedRs?.id} (status: ${importedRs?.status})`);
  console.log(`SEED_ENTITIES:      ${seedCount}`);
  console.log(`SCI_ENTITIES:       ${sciCount}`);
  console.log(`TOTAL_CD_ROWS:      ${cdBatches?.length}`);
  console.log(`IMPORT_BATCHES:     ${sortedBatches.length}`);
  console.log('========================================');
}

verify().catch(console.error);
```

```bash
cd web && npx tsx scripts/ob141-verify-ids.ts
```

**PASTE THE FULL OUTPUT.** Use the verified IDs in all subsequent phases. Do NOT use hardcoded IDs from this prompt.

**Commit:** `OB-141 Phase 0: Verify IDs from database`

---

## PHASE 1: RESTORE DATA — RULE SET SWAP

Reactivate the original 6-component plan. Archive the imported plan.

```typescript
// web/scripts/ob141-phase1-ruleset-swap.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function swapRuleSets() {
  // USE THE VERIFIED IDS FROM PHASE 0
  const TENANT_ID = '<FROM PHASE 0>';
  const ORIGINAL_RS_ID = '<FROM PHASE 0>';
  const IMPORTED_RS_ID = '<FROM PHASE 0>';

  console.log('=== PRE-SWAP STATE ===');
  const { data: before } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', TENANT_ID);
  console.table(before);

  // Archive imported plan
  const { error: archiveErr } = await supabase
    .from('rule_sets')
    .update({ status: 'archived' })
    .eq('id', IMPORTED_RS_ID);
  if (archiveErr) { console.error('ABORT: Failed to archive imported plan:', archiveErr); process.exit(1); }

  // Reactivate original plan
  const { error: activateErr } = await supabase
    .from('rule_sets')
    .update({ status: 'active' })
    .eq('id', ORIGINAL_RS_ID);
  if (activateErr) { console.error('ABORT: Failed to activate original plan:', activateErr); process.exit(1); }

  console.log('\n=== POST-SWAP STATE ===');
  const { data: after } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', TENANT_ID);
  console.table(after);

  // Verify
  const original = after?.find(rs => rs.id === ORIGINAL_RS_ID);
  const imported = after?.find(rs => rs.id === IMPORTED_RS_ID);
  console.log(`\nOriginal "${original?.name}": ${original?.status} ${original?.status === 'active' ? '✅' : '❌'}`);
  console.log(`Imported "${imported?.name}": ${imported?.status} ${imported?.status === 'archived' ? '✅' : '❌'}`);
}

swapRuleSets().catch(console.error);
```

```bash
cd web && npx tsx scripts/ob141-phase1-ruleset-swap.ts
```

**PASTE OUTPUT. Verify original is active, imported is archived.**

**Commit:** `OB-141 Phase 1: Rule set swap — original reactivated`

---

## PHASE 2: RESTORE DATA — CLEAN ENTITIES

Delete the 22,215 SCI-created entities. Keep only the seed entities (created before Feb 23).

```typescript
// web/scripts/ob141-phase2-clean-entities.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanEntities() {
  const TENANT_ID = '<FROM PHASE 0>';
  const SCI_DATE = '2026-02-23T00:00:00Z';

  // Count before
  const { count: beforeCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Entities BEFORE cleanup: ${beforeCount}`);

  // Find SCI-created entity IDs (created on or after Feb 23)
  // Must batch deletes — Supabase can't delete 22K rows in one call
  
  let totalDeleted = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Fetch a batch of SCI entities
    const { data: batch } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .gte('created_at', SCI_DATE)
      .limit(200);
    
    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    const ids = batch.map(e => e.id);
    
    // Delete related records first (foreign key constraints)
    
    // 1. Delete rule_set_assignments for these entities
    await supabase
      .from('rule_set_assignments')
      .delete()
      .in('entity_id', ids);
    
    // 2. Delete calculation_results for these entities
    await supabase
      .from('calculation_results')
      .delete()
      .in('entity_id', ids);

    // 3. Delete entity_period_outcomes for these entities
    await supabase
      .from('entity_period_outcomes')
      .delete()
      .in('entity_id', ids);
    
    // 4. Update committed_data to NULL entity_id (don't delete the data)
    await supabase
      .from('committed_data')
      .update({ entity_id: null })
      .in('entity_id', ids);
    
    // 5. Delete the entities
    const { error } = await supabase
      .from('entities')
      .delete()
      .in('id', ids);
    
    if (error) {
      console.error(`Delete error at batch: ${error.message}`);
      // Try individual deletes for remaining
      for (const id of ids) {
        await supabase.from('rule_set_assignments').delete().eq('entity_id', id);
        await supabase.from('calculation_results').delete().eq('entity_id', id);
        await supabase.from('entity_period_outcomes').delete().eq('entity_id', id);
        await supabase.from('committed_data').update({ entity_id: null }).eq('entity_id', id);
        await supabase.from('entities').delete().eq('id', id);
      }
    }
    
    totalDeleted += ids.length;
    console.log(`  Deleted batch: ${ids.length} (total: ${totalDeleted})`);
  }

  // Count after
  const { count: afterCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nEntities AFTER cleanup: ${afterCount}`);
  console.log(`Deleted: ${totalDeleted}`);
  console.log(`Expected remaining: 22 seed entities`);
  console.log(`Actual remaining: ${afterCount} ${afterCount === 22 ? '✅' : '⚠️ Check manually'}`);
}

cleanEntities().catch(console.error);
```

```bash
cd web && npx tsx scripts/ob141-phase2-clean-entities.ts
```

**PASTE OUTPUT. Verify ~22 entities remain.**

**Commit:** `OB-141 Phase 2: Entity cleanup — removed SCI-created entities`

---

## PHASE 3: RESTORE DATA — CLEAN COMMITTED DATA

Remove duplicate import batches. Keep only the original batch that has proper entity_id linkages.

```typescript
// web/scripts/ob141-phase3-clean-committed-data.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanCommittedData() {
  const TENANT_ID = '<FROM PHASE 0>';
  
  // Count before
  const { count: beforeCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Committed data rows BEFORE cleanup: ${beforeCount}`);

  // List all import batches with row counts
  const { data: allCd } = await supabase
    .from('committed_data')
    .select('import_batch_id, entity_id, created_at')
    .eq('tenant_id', TENANT_ID);
  
  const batchInfo: Record<string, { count: number; withEntity: number; created: string }> = {};
  allCd?.forEach(r => {
    const bid = r.import_batch_id || 'null';
    if (!batchInfo[bid]) batchInfo[bid] = { count: 0, withEntity: 0, created: r.created_at };
    batchInfo[bid].count++;
    if (r.entity_id) batchInfo[bid].withEntity++;
  });
  
  console.log('\n=== IMPORT BATCHES ===');
  const sortedBatches = Object.entries(batchInfo)
    .sort((a, b) => b[1].count - a[1].count);
  for (const [bid, info] of sortedBatches) {
    console.log(`  ${bid}: ${info.count} rows (${info.withEntity} with entity_id) — created ${info.created}`);
  }

  // STRATEGY: Keep the batch that was used for the Alpha benchmark.
  // The seed data batch has entity_id linkages because seed scripts created them.
  // Delete ALL committed_data from SCI import batches (created on/after Feb 23).
  // 
  // IMPORTANT: The original seed data is what produced MX$1,253,832.
  // SCI-imported data was never correctly linked to entities.
  
  // Identify the seed batch(es) — created before Feb 23
  const SCI_DATE = '2026-02-23T00:00:00Z';
  const seedBatches = sortedBatches.filter(([_, info]) => info.created < SCI_DATE);
  const sciBatches = sortedBatches.filter(([_, info]) => info.created >= SCI_DATE);
  
  console.log(`\nSeed batches (keep): ${seedBatches.length}`);
  seedBatches.forEach(([bid, info]) => console.log(`  KEEP ${bid}: ${info.count} rows`));
  console.log(`SCI batches (delete): ${sciBatches.length}`);
  sciBatches.forEach(([bid, info]) => console.log(`  DELETE ${bid}: ${info.count} rows`));
  
  // Delete SCI batches in chunks
  let totalDeleted = 0;
  for (const [batchId, info] of sciBatches) {
    if (batchId === 'null') {
      // Handle NULL batch_id separately
      let deleted = 0;
      while (true) {
        const { data: chunk } = await supabase
          .from('committed_data')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .is('import_batch_id', null)
          .limit(200);
        if (!chunk || chunk.length === 0) break;
        await supabase.from('committed_data').delete().in('id', chunk.map(r => r.id));
        deleted += chunk.length;
        console.log(`    Deleted ${deleted} rows from NULL batch`);
      }
      totalDeleted += deleted;
    } else {
      // Delete by batch_id in chunks
      let deleted = 0;
      while (true) {
        const { data: chunk } = await supabase
          .from('committed_data')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .eq('import_batch_id', batchId)
          .limit(200);
        if (!chunk || chunk.length === 0) break;
        await supabase.from('committed_data').delete().in('id', chunk.map(r => r.id));
        deleted += chunk.length;
      }
      console.log(`  Deleted ${deleted} rows from batch ${batchId}`);
      totalDeleted += deleted;
    }
  }

  // Count after
  const { count: afterCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nCommitted data AFTER cleanup: ${afterCount}`);
  console.log(`Deleted: ${totalDeleted}`);
}

cleanCommittedData().catch(console.error);
```

```bash
cd web && npx tsx scripts/ob141-phase3-clean-committed-data.ts
```

**PASTE OUTPUT. Note remaining row count.**

**Commit:** `OB-141 Phase 3: Committed data cleanup — removed SCI import duplicates`

---

## PHASE 4: RESTORE DATA — CLEAN STALE PERIODS

Remove periods that don't correspond to data. Keep only the 3 periods with actual committed_data (January, February, March 2024) plus any that are structurally needed.

```typescript
// web/scripts/ob141-phase4-clean-periods.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanPeriods() {
  const TENANT_ID = '<FROM PHASE 0>';
  
  // List all periods
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, label, start_date, end_date, status, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });
  
  console.log('=== ALL PERIODS ===');
  console.table(periods);
  
  // For each period, check if committed_data exists
  for (const period of periods || []) {
    const { count } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id);
    
    const { count: calcCount } = await supabase
      .from('calculation_results')
      .select('*', { count: 'exact', head: true })
      .eq('period_id', period.id);
    
    const hasData = (count || 0) > 0;
    const hasCalc = (calcCount || 0) > 0;
    const action = hasData || hasCalc ? 'KEEP' : 'DELETE';
    console.log(`  ${period.label} (${period.canonical_key}): ${count} cd rows, ${calcCount} calc results → ${action}`);
  }
  
  // Delete periods with no committed_data AND no calculation_results
  const periodsToDelete = [];
  for (const period of periods || []) {
    const { count: cdCount } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id);
    
    const { count: calcCount } = await supabase
      .from('calculation_results')
      .select('*', { count: 'exact', head: true })
      .eq('period_id', period.id);
    
    if ((cdCount || 0) === 0 && (calcCount || 0) === 0) {
      periodsToDelete.push(period);
    }
  }
  
  console.log(`\nPeriods to delete: ${periodsToDelete.length}`);
  for (const period of periodsToDelete) {
    // Delete calculation_batches referencing this period first
    await supabase
      .from('calculation_batches')
      .delete()
      .eq('period_id', period.id)
      .eq('tenant_id', TENANT_ID);
    
    const { error } = await supabase
      .from('periods')
      .delete()
      .eq('id', period.id);
    
    if (error) {
      console.log(`  Could not delete ${period.label}: ${error.message} — SKIP (may have FK refs)`);
    } else {
      console.log(`  Deleted: ${period.label} (${period.canonical_key})`);
    }
  }
  
  // Final state
  const { data: remaining } = await supabase
    .from('periods')
    .select('id, canonical_key, label, start_date, end_date')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });
  console.log('\n=== REMAINING PERIODS ===');
  console.table(remaining);
}

cleanPeriods().catch(console.error);
```

```bash
cd web && npx tsx scripts/ob141-phase4-clean-periods.ts
```

**PASTE OUTPUT.**

**Commit:** `OB-141 Phase 4: Period cleanup — removed stale periods`

---

## PHASE 5: VERIFICATION — CALCULATE AND COMPARE

Run calculation for the Óptica Luminar tenant and verify the Alpha benchmark.

```typescript
// web/scripts/ob141-phase5-verify-benchmark.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyBenchmark() {
  const TENANT_ID = '<FROM PHASE 0>';
  const ORIGINAL_RS_ID = '<FROM PHASE 0>';
  
  // 1. Verify pre-conditions
  console.log('=== PRE-CONDITIONS ===');
  
  const { count: entityCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Entities: ${entityCount}`);
  
  const { data: activeRs } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active');
  console.log(`Active rule set: ${activeRs?.[0]?.name} (${activeRs?.[0]?.id})`);
  console.log(`Is original: ${activeRs?.[0]?.id === ORIGINAL_RS_ID ? '✅' : '❌'}`);
  
  const { count: assignmentCount } = await supabase
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('rule_set_id', ORIGINAL_RS_ID);
  console.log(`Assignments to original plan: ${assignmentCount}`);
  
  const { count: cdCount } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`Committed data rows: ${cdCount}`);
  
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });
  console.log(`Periods: ${periods?.length}`);
  periods?.forEach(p => console.log(`  ${p.label} (${p.canonical_key})`));
  
  // 2. Find the most recent calculation batch
  const { data: latestBatch } = await supabase
    .from('calculation_batches')
    .select('id, period_id, rule_set_id, entity_count, summary, lifecycle_state, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('\n=== RECENT CALCULATION BATCHES ===');
  for (const b of latestBatch || []) {
    const total = b.summary?.total_payout || b.summary?.totalPayout || '?';
    console.log(`  ${b.id} | rs: ${b.rule_set_id} | entities: ${b.entity_count} | $${total} | ${b.lifecycle_state} | ${b.created_at}`);
  }
  
  // 3. Find a batch that used the ORIGINAL rule set
  const originalBatch = latestBatch?.find(b => b.rule_set_id === ORIGINAL_RS_ID);
  
  if (!originalBatch) {
    console.log('\n⚠️  NO CALCULATION BATCH EXISTS WITH ORIGINAL RULE SET');
    console.log('A new calculation must be triggered from the browser.');
    console.log('Navigate to /operate/calculate, select the original plan, and run calculation.');
    console.log('Then re-run this script to verify.');
    
    // Still check if we can verify from the UI
    console.log('\n=== INSTRUCTIONS ===');
    console.log('1. Open vialuce.ai/operate/calculate (or localhost:3000/operate/calculate)');
    console.log('2. Select plan: "Plan de Comisiones Optica Luminar 2026"');
    console.log('3. Select period: January 2024 (or Enero 2024)');
    console.log('4. Click Calculate');
    console.log('5. Expected result: MX$1,253,832 total across 719 entities');
    console.log('6. After calculation completes, re-run: npx tsx scripts/ob141-phase5-verify-benchmark.ts');
    return;
  }
  
  // 4. Verify the calculation results
  console.log(`\n=== VERIFYING BATCH ${originalBatch.id} ===`);
  
  const { data: results } = await supabase
    .from('calculation_results')
    .select('total_payout, components')
    .eq('batch_id', originalBatch.id);
  
  const totalPayout = results?.reduce((s, r) => s + Number(r.total_payout), 0) || 0;
  const entityResults = results?.length || 0;
  const nonZero = results?.filter(r => Number(r.total_payout) > 0).length || 0;
  
  console.log(`Entity results: ${entityResults}`);
  console.log(`Non-zero: ${nonZero}`);
  console.log(`Total payout: MX$${totalPayout.toLocaleString()}`);
  
  // 5. Component-level breakdown
  const componentTotals: Record<string, number> = {};
  for (const result of results || []) {
    const comps = result.components || {};
    for (const [name, data] of Object.entries(comps)) {
      const payout = Number((data as any)?.payout || (data as any)?.result || 0);
      componentTotals[name] = (componentTotals[name] || 0) + payout;
    }
  }
  
  console.log('\n=== COMPONENT BREAKDOWN ===');
  const expectedComponents: Record<string, number> = {
    'Venta Optica': 748600,
    'Venta Tienda': 116250,
    'Clientes Nuevos': 39100,
    'Cobranza': 283000,
    'Club de Proteccion': 10,
    'Garantia Extendida': 66872,
  };
  
  for (const [name, total] of Object.entries(componentTotals)) {
    // Try to match to expected (fuzzy — component names may vary)
    const matchKey = Object.keys(expectedComponents).find(k => 
      name.toLowerCase().includes(k.toLowerCase().split(' ')[0]) ||
      k.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    );
    const expected = matchKey ? expectedComponents[matchKey] : null;
    const delta = expected !== null ? total - expected : null;
    const status = delta !== null ? (Math.abs(delta) < 1 ? '✅' : '❌') : '❓';
    console.log(`  ${status} ${name}: MX$${total.toLocaleString()} ${expected !== null ? `(expected: MX$${expected.toLocaleString()}, delta: MX$${delta?.toLocaleString()})` : '(no expected value)'}`);
  }
  
  // 6. Final verdict
  const EXPECTED_TOTAL = 1253832;
  const totalDelta = Math.abs(totalPayout - EXPECTED_TOTAL);
  console.log('\n========================================');
  console.log('ALPHA BENCHMARK VERIFICATION');
  console.log('========================================');
  console.log(`Entities:  ${entityResults} ${entityResults === 719 ? '✅' : `❌ (expected 719)`}`);
  console.log(`Total:     MX$${totalPayout.toLocaleString()} ${totalDelta < 1 ? '✅' : `❌ (expected MX$1,253,832, delta: MX$${totalDelta.toLocaleString()})`}`);
  console.log(`Components: ${Object.keys(componentTotals).length} ${Object.keys(componentTotals).length === 6 ? '✅' : `❌ (expected 6)`}`);
  console.log(`Verdict:   ${totalDelta < 1 && entityResults === 719 ? '✅ ALPHA BENCHMARK RESTORED' : '❌ BENCHMARK NOT YET RESTORED — see component breakdown'}`);
  console.log('========================================');
}

verifyBenchmark().catch(console.error);
```

```bash
cd web && npx tsx scripts/ob141-phase5-verify-benchmark.ts
```

**If no calculation batch exists with the original rule set:** Trigger calculation from the browser (localhost:3000/operate/calculate), then re-run the verification script.

**PASTE FULL OUTPUT.**

**STOP HERE IF THE BENCHMARK IS NOT RESTORED.** Do not proceed to Phase 6. Report what the verification shows — which components match, which don't, what the delta is. This becomes the input for the next diagnostic.

**Commit:** `OB-141 Phase 5: Alpha benchmark verification`

---

## PHASE 6: CODE FIXES — PREVENT RECURRENCE

**Only execute Phase 6 if Phase 5 shows the Alpha benchmark is restored (or substantially restored with a known remaining factor like cross-period aggregation).**

### 6A: Fix PPTX import — don't auto-archive existing plans

```bash
echo "=== FIND PLAN IMPORT ARCHIVE LOGIC ==="
grep -rn "archived\|archive\|deactivat\|status.*active\|status.*archived" \
  web/src/app/api/import/sci/execute/route.ts \
  web/src/app/api/import/plan-import/ \
  web/src/lib/sci/ \
  --include="*.ts" | head -30

echo ""
echo "=== FIND WHERE RULE SETS ARE CREATED DURING IMPORT ==="
grep -rn "rule_sets.*insert\|from('rule_sets').*insert\|upsert.*rule_sets\|createRuleSet\|saveRuleSet" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

**Fix:** Find the code that sets existing rule_sets to `archived` when a new one is imported. Change the behavior:
- New PPTX-imported rule_sets are created with `status: 'draft'`
- Existing rule_sets are NOT modified
- The admin must explicitly activate a draft plan (future UX — not this OB's scope)

**Test after fix:**
```bash
grep -rn "status.*archived\|archived.*status" web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" | head -10
# Should find ZERO instances of auto-archiving in import paths
```

### 6B: Fix SCI entity pipeline — deduplicate by external_id

```bash
echo "=== FIND ENTITY CREATION IN SCI ==="
grep -rn "entities.*insert\|from('entities').*insert\|createEntit\|upsertEntit\|entity.*create" \
  web/src/app/api/import/sci/execute/ \
  web/src/lib/sci/ \
  --include="*.ts" | head -20
```

**Fix:** Before inserting entities, query existing entities for this tenant and check `external_id`. Only insert entities whose `external_id` doesn't already exist. Use `upsert` with `onConflict: 'tenant_id, external_id'` if the unique constraint exists, or check-then-insert if it doesn't.

```typescript
// Pseudocode for the fix:
// BEFORE: Insert all extracted entity IDs as new entities
// AFTER:
//   1. Extract unique external_ids from the data
//   2. Query existing entities: SELECT id, external_id FROM entities WHERE tenant_id = ? AND external_id IN (?)
//   3. Filter out already-existing IDs
//   4. Insert only genuinely new entities
//   5. Return a map of external_id → entity_id (both existing and new)
```

**Batch the `.in()` query at ≤ 200 items (Standing Rule — Supabase batch limit).**

### 6C: Fix assignment creation — chunk at 200

```bash
echo "=== FIND ASSIGNMENT CREATION ==="
grep -rn "rule_set_assignments.*insert\|from('rule_set_assignments')\|createAssignment\|assignEntit" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

**Fix:** Find the assignment creation loop. If it creates assignments in a single `.insert()` call or uses `.in()` with > 200 items, chunk it:

```typescript
// Chunk assignment creation
const CHUNK_SIZE = 200;
for (let i = 0; i < assignments.length; i += CHUNK_SIZE) {
  const chunk = assignments.slice(i, i + CHUNK_SIZE);
  await supabase.from('rule_set_assignments').insert(chunk);
}
```

### 6D: Remove old plan import route

```bash
echo "=== FIND OLD PLAN IMPORT ROUTE ==="
find web/src/app -path "*configure*plan*" -name "page.tsx" | sort
find web/src/app -path "*plan-import*" -name "page.tsx" | sort
find web/src/app -path "*plan*import*" -name "page.tsx" | sort
```

**Fix:** The old `/configure/plans` or `/admin/launch/plan-import` route should redirect to `/operate/import`. Replace the page component with a redirect:

```typescript
// Replace the old plan import page with:
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlanImportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/operate/import'); }, [router]);
  return null;
}
```

**Do NOT delete the route file** — that would break any bookmarks or links. Redirect preserves the URL while funneling to the canonical SCI path.

### 6E: Build + verify

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
# Must exit 0
```

```bash
# Verify no auth files modified
git diff --name-only HEAD | grep -E "middleware|auth-service|session-context|auth-shell" && echo "⚠️ AUTH MODIFIED" || echo "✅ AUTH UNTOUCHED"
```

**Commit:** `OB-141 Phase 6: Code fixes — plan import draft status, entity dedup, assignment chunking, plan route redirect`

---

## PHASE 7: COMPLETION REPORT + PR

Create `OB-141_COMPLETION_REPORT.md` with:

1. Phase 0: Verified IDs (paste output)
2. Phase 1: Rule set swap (paste output)
3. Phase 2: Entity cleanup (paste output — before/after counts)
4. Phase 3: Committed data cleanup (paste output — before/after counts)
5. Phase 4: Period cleanup (paste output — before/after)
6. Phase 5: **Alpha benchmark verification (paste FULL output)**
7. Phase 6: Code fixes (list files modified, grep evidence of fixes)
8. All proof gates

```bash
gh pr create --base main --head dev \
  --title "OB-141: Platform Restoration — Alpha Benchmark + Recurrence Prevention" \
  --body "## Data Restoration + Code Fixes

### Data Operations
- Reactivated original 6-component rule_set (Plan de Comisiones Optica Luminar 2026)
- Archived imported heuristic rule_set (Imported Plan)
- Removed ~22,215 SCI-created entities (kept 22 seed entities)
- Removed duplicate committed_data from SCI import batches
- Removed stale periods with no data

### Alpha Benchmark Verification
[PASTE THE VERDICT FROM PHASE 5]

### Code Fixes (Recurrence Prevention)
- PPTX plan import creates rule_sets as draft, never auto-archives existing plans
- SCI entity pipeline deduplicates by external_id before inserting
- Assignment creation chunks at 200 (Supabase batch limit)
- Old plan import route redirects to /operate/import

### Root Cause (from OB-140)
PPTX plan import auto-archived the proven 6-component plan and activated a 4-component heuristic plan."
```

**Commit:** `OB-141 Phase 7: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Original rule_set status = active | Paste from Phase 1 |
| PG-02 | Imported rule_set status = archived | Paste from Phase 1 |
| PG-03 | Entity count ≤ 22 seed + any legitimate imports | Paste from Phase 2 |
| PG-04 | No SCI-created entities remain | Date filter confirms 0 entities after Feb 23 |
| PG-05 | Committed data cleaned | Before/after counts from Phase 3 |
| PG-06 | Stale periods removed | Before/after counts from Phase 4 |
| PG-07 | **Alpha benchmark: 719 entities** | From Phase 5 verification |
| PG-08 | **Alpha benchmark: MX$1,253,832 total** | From Phase 5 verification |
| PG-09 | **Alpha benchmark: 6 components match expected** | Component-level breakdown from Phase 5 |
| PG-10 | PPTX import creates draft, not active | grep evidence |
| PG-11 | SCI entity pipeline deduplicates by external_id | Code evidence |
| PG-12 | Assignment creation chunks at 200 | Code evidence |
| PG-13 | Old plan import route redirects | File content evidence |
| PG-14 | `npm run build` exits 0 | Build output |
| PG-15 | Auth files unchanged | git diff evidence |

**PG-07, PG-08, PG-09 are the gates that matter.** If those three pass, the Alpha benchmark is restored. If any fail, STOP and report — do not proceed to Phase 6.

---

## WHAT SUCCESS LOOKS LIKE

After OB-141:
- The database contains ~22 entities, not 22,237
- The active rule_set is the proven 6-component plan
- Committed data is clean — one batch, correct entity linkages
- Calculation produces MX$1,253,832 with 6 correct components
- Future PPTX imports cannot silently replace active plans
- Future SCI imports cannot create duplicate entities
- The old plan import route redirects to the unified SCI import

**The Alpha benchmark is the foundation. This OB restores it and prevents it from breaking again.**

---

*"Fix nothing until you can point to the exact row in the exact table that diverges."*
*"The benchmark is not a number. It's a contract. If the contract is broken, nothing above it holds."*
