# OB-140: DUAL-TRACE FORENSIC DIAGNOSTIC
## Architecture Trace + Calculation Trace — Restore the Alpha Benchmark
## Type: Diagnostic — NO feature work. NO UI changes. Evidence only.
## Estimated Duration: 3–4 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

**THIS IS NOT A FEATURE OB.** This OB writes zero application code. It runs diagnostic queries, traces data through every pipeline layer, and produces two reports: an Architecture Trace and a Calculation Trace. The output is evidence that identifies exactly where and why the Alpha benchmark broke.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference, paste it open while running queries
3. `CC_UAT_CALCULATION_TRACE.md` — the proven single-entity trace methodology
4. `CC_UAT_ARCHITECTURE_TRACE.md` — the proven architecture probe methodology
5. This entire prompt before executing anything

---

## CONTEXT — WHY THIS DIAGNOSTIC EXISTS

CLT-139 browser verification revealed the Alpha milestone is broken:

| What should happen | What actually happens |
|----|-----|
| 719 entities | 2,226 entities (3x — one per entity per period) |
| MX$1,253,832 total payout | MX$524,500 (58% deficit) |
| 6 components, all producing correct results | Unknown — per-component breakdown not visible |
| Plan name from AI interpretation | "Imported Plan" |
| PPTX plan import succeeds | Import shows "Failed" on ready state, but rule_set exists |

**The Alpha benchmark (67/67 entities, $0.00 delta, 100% accuracy) was proven on February 24, 2026.** Something between then and now broke it. This diagnostic traces the exact divergence.

**HYPOTHESIS (to be verified, not assumed):** The SCI entity pipeline creates one entity record per row instead of one per unique external_id. A file with 719 entities × 3 periods produces 2,226 entity records. The calculation engine processes some subset, producing partial results.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. **Commit this prompt to git as first action.**
3. **Git from repo root (spm-platform), NOT from web/.**
4. **DO NOT MODIFY ANY APPLICATION CODE.** This OB produces scripts and reports only.
5. **Evidence = paste SQL output. NOT "this was checked."**
6. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN.**

---

## PHASE 0: COMMIT PROMPT

```bash
cp OB-140_DUAL_TRACE_FORENSIC_DIAGNOSTIC.md web/prompts/
cd /path/to/spm-platform
git add -A
git commit -m "OB-140 Phase 0: Commit diagnostic prompt"
git push origin dev
```

---

## PHASE 1: ARCHITECTURE TRACE — DATABASE STATE INVENTORY

Create script: `web/scripts/ob140-architecture-trace.ts`

This script queries every relevant table and produces a complete inventory of the Óptica Luminar (PTC) tenant's database state. **Every query output must be pasted into the completion report.**

### 1A: Tenant Identification

```typescript
// Find all tenants
const { data: tenants } = await supabase
  .from('tenants')
  .select('id, name, slug, industry, country_code, created_at');
console.log('=== ALL TENANTS ===');
console.table(tenants);

// Identify the Óptica Luminar / PTC tenant
// Expected: the tenant with 719 entities and MX$ calculations
// PASTE the tenant_id — it's used in every subsequent query
```

### 1B: Entity Count and Duplication Analysis

```typescript
const TENANT_ID = '<paste from 1A>';

// Total entity count
const { count: totalEntities } = await supabase
  .from('entities')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', TENANT_ID);
console.log(`Total entities: ${totalEntities}`);
// EXPECTED: 719. If higher, entities are duplicated.

// Unique external_id count
const { data: entities } = await supabase
  .from('entities')
  .select('external_id')
  .eq('tenant_id', TENANT_ID);
const uniqueExternalIds = new Set(entities?.map(e => e.external_id));
console.log(`Unique external_ids: ${uniqueExternalIds.size}`);
// If totalEntities > uniqueExternalIds.size, we have duplicates

// Duplication factor
console.log(`Duplication factor: ${totalEntities}/${uniqueExternalIds.size} = ${(totalEntities! / uniqueExternalIds.size).toFixed(1)}x`);

// Sample duplicated entities (show first 5 that have >1 record)
const externalIdCounts: Record<string, number> = {};
entities?.forEach(e => { externalIdCounts[e.external_id] = (externalIdCounts[e.external_id] || 0) + 1; });
const duplicated = Object.entries(externalIdCounts)
  .filter(([_, count]) => count > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
console.log('Top 10 duplicated external_ids:');
console.table(duplicated.map(([id, count]) => ({ external_id: id, count })));

// For the top duplicated entity, show all records
if (duplicated.length > 0) {
  const topDupId = duplicated[0][0];
  const { data: dupRecords } = await supabase
    .from('entities')
    .select('id, external_id, display_name, entity_type, metadata, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('external_id', topDupId);
  console.log(`All records for external_id=${topDupId}:`);
  console.table(dupRecords);
  // KEY QUESTION: What differs between these records?
  // Are they identical? Do they have different metadata (period info)?
  // Do they have different created_at timestamps (multiple imports)?
}
```

### 1C: Entity Creation Source Analysis

```typescript
// When were entities created? (Import batches vs seed data)
const { data: entityDates } = await supabase
  .from('entities')
  .select('created_at')
  .eq('tenant_id', TENANT_ID)
  .order('created_at', { ascending: true });

// Group by date
const dateCounts: Record<string, number> = {};
entityDates?.forEach(e => {
  const date = new Date(e.created_at).toISOString().split('T')[0];
  dateCounts[date] = (dateCounts[date] || 0) + 1;
});
console.log('Entity creation by date:');
console.table(Object.entries(dateCounts).map(([date, count]) => ({ date, count })));
// This reveals: were 2,226 created in one batch? Or 719 + 719 + 719 across 3 imports?
// Or 719 original + 1,507 from SCI import?
```

### 1D: Rule Sets Inventory

```typescript
const { data: ruleSets } = await supabase
  .from('rule_sets')
  .select('id, name, status, version, created_at, updated_at')
  .eq('tenant_id', TENANT_ID);
console.log('=== RULE SETS ===');
console.table(ruleSets);
// EXPECTED: 1 rule set for the 6-component compensation plan
// KEY QUESTION: Is there a second rule_set from the PPTX import?
// If so, which one is the calculation using?

// For each rule_set, show component count and names
for (const rs of ruleSets || []) {
  const { data: fullRs } = await supabase
    .from('rule_sets')
    .select('components, input_bindings')
    .eq('id', rs.id)
    .single();
  
  const components = fullRs?.components;
  const componentNames = Array.isArray(components) 
    ? components.map((c: any) => c.name || c.component_name || 'unnamed')
    : Object.keys(components || {});
  console.log(`Rule set "${rs.name}" (${rs.id}):`);
  console.log(`  Components (${componentNames.length}): ${componentNames.join(', ')}`);
  console.log(`  input_bindings empty: ${JSON.stringify(fullRs?.input_bindings) === '{}'}`);
  console.log(`  Status: ${rs.status}, Version: ${rs.version}`);
}
```

### 1E: Rule Set Assignments

```typescript
const { count: assignmentCount } = await supabase
  .from('rule_set_assignments')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', TENANT_ID);
console.log(`Total assignments: ${assignmentCount}`);
// EXPECTED: 719 (one per entity per rule_set)
// If > 719, duplicated entities have duplicate assignments

// Assignments per rule_set
const { data: assignments } = await supabase
  .from('rule_set_assignments')
  .select('rule_set_id')
  .eq('tenant_id', TENANT_ID);
const perRuleSet: Record<string, number> = {};
assignments?.forEach(a => { perRuleSet[a.rule_set_id] = (perRuleSet[a.rule_set_id] || 0) + 1; });
console.log('Assignments per rule_set:');
console.table(Object.entries(perRuleSet).map(([id, count]) => ({ rule_set_id: id, count })));
```

### 1F: Periods Inventory

```typescript
const { data: periods } = await supabase
  .from('periods')
  .select('id, canonical_key, label, start_date, end_date, status, created_at')
  .eq('tenant_id', TENANT_ID)
  .order('start_date', { ascending: true });
console.log('=== PERIODS ===');
console.table(periods);
// EXPECTED: Periods for Enero/Febrero/Marzo 2024
// KEY QUESTION: Are there duplicate periods? Periods from different imports?
// How many total? CLT-111 found 28 periods when there should be 4.
```

### 1G: Committed Data Inventory

```typescript
// Total committed_data rows
const { count: cdTotal } = await supabase
  .from('committed_data')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', TENANT_ID);
console.log(`Total committed_data rows: ${cdTotal}`);

// Committed data by data_type (sheet/classification)
const { data: cdByType } = await supabase
  .from('committed_data')
  .select('data_type')
  .eq('tenant_id', TENANT_ID);
const typeCounts: Record<string, number> = {};
cdByType?.forEach(r => { typeCounts[r.data_type || 'null'] = (typeCounts[r.data_type || 'null'] || 0) + 1; });
console.log('Committed data by data_type:');
console.table(Object.entries(typeCounts).map(([type, count]) => ({ data_type: type, count })));

// Committed data by import_batch
const { data: cdByBatch } = await supabase
  .from('committed_data')
  .select('import_batch_id')
  .eq('tenant_id', TENANT_ID);
const batchCounts: Record<string, number> = {};
cdByBatch?.forEach(r => { batchCounts[r.import_batch_id || 'null'] = (batchCounts[r.import_batch_id || 'null'] || 0) + 1; });
console.log('Committed data by import_batch:');
console.table(Object.entries(batchCounts).map(([id, count]) => ({ import_batch_id: id, count })));
// KEY QUESTION: Are there rows from multiple imports? Old + new?
```

### 1H: Calculation State

```typescript
// Calculation batches
const { data: calcBatches } = await supabase
  .from('calculation_batches')
  .select('id, period_id, rule_set_id, entity_count, lifecycle_state, summary, created_at')
  .eq('tenant_id', TENANT_ID)
  .order('created_at', { ascending: false })
  .limit(10);
console.log('=== RECENT CALCULATION BATCHES ===');
for (const batch of calcBatches || []) {
  const totalPayout = batch.summary?.total_payout || batch.summary?.totalPayout || 'unknown';
  console.log(`  ${batch.id} | ${batch.entity_count} entities | ${totalPayout} | ${batch.lifecycle_state} | ${batch.created_at}`);
}

// Latest calculation results summary
const latestBatch = calcBatches?.[0];
if (latestBatch) {
  const { data: results } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('batch_id', latestBatch.id);
  const total = results?.reduce((s, r) => s + Number(r.total_payout), 0);
  const nonZero = results?.filter(r => Number(r.total_payout) > 0).length;
  console.log(`Latest batch: ${results?.length} results, ${nonZero} non-zero, total: MX$${total?.toLocaleString()}`);
  // EXPECTED: 719 results, all non-zero, total MX$1,253,832
}
```

### 1I: Convergence / Metric Derivation State

```typescript
// Check metric_derivations table (if exists)
const { data: derivations, error: derivError } = await supabase
  .from('metric_derivations')
  .select('*')
  .eq('tenant_id', TENANT_ID)
  .limit(20);
if (derivError) {
  console.log(`metric_derivations: ${derivError.message}`);
} else {
  console.log(`metric_derivations: ${derivations?.length || 0} rows`);
  console.table(derivations?.slice(0, 5));
}

// Check semantic_roles in committed_data
const { data: semanticSample } = await supabase
  .from('committed_data')
  .select('semantic_roles, data_type')
  .eq('tenant_id', TENANT_ID)
  .not('semantic_roles', 'is', null)
  .limit(5);
console.log(`Committed data with semantic_roles: ${semanticSample?.length || 0}`);
if (semanticSample?.length) console.log(JSON.stringify(semanticSample[0].semantic_roles, null, 2));
```

**Commit:** `OB-140 Phase 1: Architecture trace script — database state inventory`

---

## PHASE 2: RUN ARCHITECTURE TRACE

```bash
cd web
npx tsx scripts/ob140-architecture-trace.ts 2>&1 | tee ../OB-140_ARCHITECTURE_TRACE_OUTPUT.txt
```

**PASTE THE ENTIRE OUTPUT INTO THE COMPLETION REPORT.** Not a summary. Not excerpts. The full output.

**Commit:** `OB-140 Phase 2: Architecture trace output — raw evidence`

---

## PHASE 3: CALCULATION TRACE — SINGLE ENTITY FORENSIC

Create script: `web/scripts/ob140-calculation-trace.ts`

This script picks ONE entity that exists in the proven Feb 24 benchmark AND in the current state, and traces its calculation through every component.

### 3A: Find a trace entity

```typescript
// Find an entity that:
// 1. Has calculation results in the latest batch (current state)
// 2. Also has calculation results in a February batch (proven benchmark)
// This lets us compare: what the engine produces NOW vs what it produced at Alpha proof

const { data: calcBatches } = await supabase
  .from('calculation_batches')
  .select('id, created_at, entity_count, summary')
  .eq('tenant_id', TENANT_ID)
  .order('created_at', { ascending: false })
  .limit(20);

console.log('=== ALL CALCULATION BATCHES ===');
for (const b of calcBatches || []) {
  const payout = b.summary?.total_payout || b.summary?.totalPayout || '?';
  console.log(`  ${b.id} | ${b.entity_count} entities | $${payout} | ${b.created_at}`);
}

// Identify:
// - LATEST batch (the one producing $524,500)
// - BENCHMARK batch (the one closest to Feb 24 that produced ~$1,253,832)
const latestBatchId = calcBatches?.[0]?.id;

// Find benchmark batch (entity_count ~719, total ~1,253,832)
const benchmarkBatch = calcBatches?.find(b => 
  b.entity_count === 719 || 
  (b.summary?.total_payout && Math.abs(Number(b.summary.total_payout) - 1253832) < 10000)
);
const benchmarkBatchId = benchmarkBatch?.id;

console.log(`\nLATEST batch: ${latestBatchId}`);
console.log(`BENCHMARK batch: ${benchmarkBatchId || 'NOT FOUND — this is already a finding'}`);

// Pick a trace entity from the latest batch
const { data: latestResults } = await supabase
  .from('calculation_results')
  .select('entity_id, total_payout')
  .eq('batch_id', latestBatchId)
  .gt('total_payout', 0)
  .order('total_payout', { ascending: false })
  .limit(1);

const traceEntityId = latestResults?.[0]?.entity_id;
console.log(`\nTrace entity: ${traceEntityId} (highest payout in latest batch: $${latestResults?.[0]?.total_payout})`);

// Get entity details
const { data: traceEntity } = await supabase
  .from('entities')
  .select('id, external_id, display_name, entity_type, metadata, created_at')
  .eq('id', traceEntityId)
  .single();
console.log('Entity details:', JSON.stringify(traceEntity, null, 2));
```

### 3B: Compare latest vs benchmark for trace entity

```typescript
// Get component-level results from LATEST batch
const { data: latestComponents } = await supabase
  .from('calculation_results')
  .select('total_payout, components, metrics')
  .eq('batch_id', latestBatchId)
  .eq('entity_id', traceEntityId)
  .single();
console.log('\n=== LATEST CALCULATION ===');
console.log(`Total payout: MX$${latestComponents?.total_payout}`);
console.log('Components:', JSON.stringify(latestComponents?.components, null, 2));

// Get component-level results from BENCHMARK batch (if found)
if (benchmarkBatchId) {
  // The benchmark might use a different entity_id (if entities were recreated)
  // Find the benchmark entity by external_id
  const { data: benchmarkResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metrics')
    .eq('batch_id', benchmarkBatchId);
  
  // Find matching entity by external_id
  const { data: benchmarkEntities } = await supabase
    .from('entities')
    .select('id, external_id')
    .in('id', (benchmarkResults || []).map(r => r.entity_id).slice(0, 200));
  
  const traceExtId = traceEntity?.external_id;
  const matchingBenchEntity = benchmarkEntities?.find(e => e.external_id === traceExtId);
  
  if (matchingBenchEntity) {
    const benchResult = benchmarkResults?.find(r => r.entity_id === matchingBenchEntity.id);
    console.log('\n=== BENCHMARK CALCULATION ===');
    console.log(`Total payout: MX$${benchResult?.total_payout}`);
    console.log('Components:', JSON.stringify(benchResult?.components, null, 2));
    
    // COMPONENT-BY-COMPONENT COMPARISON
    console.log('\n=== COMPONENT COMPARISON ===');
    const latestComps = latestComponents?.components || {};
    const benchComps = benchResult?.components || {};
    const allCompNames = new Set([...Object.keys(latestComps), ...Object.keys(benchComps)]);
    for (const name of allCompNames) {
      const latest = latestComps[name]?.payout || latestComps[name]?.result || 0;
      const bench = benchComps[name]?.payout || benchComps[name]?.result || 0;
      const delta = Number(latest) - Number(bench);
      const status = delta === 0 ? '✅' : '❌';
      console.log(`  ${status} ${name}: Latest=$${latest} Benchmark=$${bench} Delta=$${delta}`);
    }
  } else {
    console.log(`\nBENCHMARK: No matching entity found for external_id=${traceExtId}`);
    console.log('This means entities were recreated with different UUIDs.');
  }
}
```

### 3C: Trace committed data for this entity

```typescript
// What data rows exist for this entity?
const { data: entityData } = await supabase
  .from('committed_data')
  .select('id, data_type, period_id, row_data, semantic_roles, import_batch_id, created_at')
  .eq('tenant_id', TENANT_ID)
  .eq('entity_id', traceEntityId)
  .order('data_type');

console.log(`\n=== COMMITTED DATA FOR TRACE ENTITY ===`);
console.log(`Total rows: ${entityData?.length || 0}`);

const byType: Record<string, number> = {};
entityData?.forEach(r => { byType[r.data_type || 'null'] = (byType[r.data_type || 'null'] || 0) + 1; });
console.log('By data_type:', JSON.stringify(byType));

// Show first row per data_type (field names reveal mapping)
const seenTypes = new Set<string>();
for (const row of entityData || []) {
  if (seenTypes.has(row.data_type)) continue;
  seenTypes.add(row.data_type);
  console.log(`\n  data_type: ${row.data_type}`);
  console.log(`  period_id: ${row.period_id}`);
  console.log(`  semantic_roles: ${JSON.stringify(row.semantic_roles)}`);
  console.log(`  fields: ${Object.keys(row.row_data || {}).join(', ')}`);
  console.log(`  sample values: ${JSON.stringify(row.row_data).slice(0, 300)}`);
}
```

### 3D: Trace metric resolution

```typescript
// What does the engine see when it tries to build metrics for this entity?
// Check: does buildMetricsForComponent find the data?

// Get the active rule_set's components
const { data: activeRuleSet } = await supabase
  .from('rule_sets')
  .select('id, name, components, input_bindings')
  .eq('tenant_id', TENANT_ID)
  .eq('status', 'active')
  .single();

if (activeRuleSet) {
  const components = Array.isArray(activeRuleSet.components) 
    ? activeRuleSet.components 
    : Object.values(activeRuleSet.components || {});
  
  console.log(`\n=== METRIC RESOLUTION TRACE ===`);
  console.log(`Rule set: ${activeRuleSet.name} (${activeRuleSet.id})`);
  console.log(`Components: ${components.length}`);
  console.log(`input_bindings empty: ${JSON.stringify(activeRuleSet.input_bindings) === '{}'}`);
  
  for (const comp of components) {
    const compName = comp.name || comp.component_name || 'unnamed';
    const metricSource = comp.metric_source || comp.metricSource || 'unknown';
    console.log(`\n  Component: ${compName}`);
    console.log(`  metric_source: ${metricSource}`);
    console.log(`  component_type: ${comp.component_type || comp.componentType || 'unknown'}`);
    
    // Check: does committed_data have rows matching this component's data needs?
    // The engine uses buildMetricsForComponent which pattern-matches data_type to component name
    const matchingData = entityData?.filter(r => {
      const dt = (r.data_type || '').toLowerCase();
      const cn = compName.toLowerCase();
      return dt.includes(cn) || cn.includes(dt) || 
        dt.split('_').some((w: string) => cn.includes(w));
    });
    console.log(`  Matching committed_data rows: ${matchingData?.length || 0}`);
    if (matchingData?.length) {
      console.log(`  First match data_type: ${matchingData[0].data_type}`);
      console.log(`  First match fields: ${Object.keys(matchingData[0].row_data || {}).join(', ')}`);
    }
  }
}
```

### 3E: Aggregate comparison

```typescript
// Total payout comparison across ALL entities, not just the trace entity
console.log('\n=== AGGREGATE COMPARISON ===');

// Latest batch totals
const { data: latestAll } = await supabase
  .from('calculation_results')
  .select('total_payout')
  .eq('batch_id', latestBatchId);
const latestTotal = latestAll?.reduce((s, r) => s + Number(r.total_payout), 0);
const latestNonZero = latestAll?.filter(r => Number(r.total_payout) > 0).length;
const latestZero = latestAll?.filter(r => Number(r.total_payout) === 0).length;
console.log(`Latest:    ${latestAll?.length} results, ${latestNonZero} non-zero, ${latestZero} zero, total: MX$${latestTotal?.toLocaleString()}`);

// Benchmark batch totals (if found)
if (benchmarkBatchId) {
  const { data: benchAll } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('batch_id', benchmarkBatchId);
  const benchTotal = benchAll?.reduce((s, r) => s + Number(r.total_payout), 0);
  const benchNonZero = benchAll?.filter(r => Number(r.total_payout) > 0).length;
  console.log(`Benchmark: ${benchAll?.length} results, ${benchNonZero} non-zero, total: MX$${benchTotal?.toLocaleString()}`);
  console.log(`Delta: MX$${(latestTotal! - benchTotal!).toLocaleString()} (${((latestTotal! / benchTotal! - 1) * 100).toFixed(1)}%)`);
}

// Expected benchmark values (hardcoded from proven Alpha milestone)
console.log('\nExpected Alpha benchmark:');
console.log('  719 entities, MX$1,253,832 total');
console.log('  Optical Sales: $748,600');
console.log('  Store Sales: $116,250');
console.log('  New Customers: $39,100');
console.log('  Collections: $283,000');
console.log('  Insurance: $10');
console.log('  Warranty: $66,872');
```

**Commit:** `OB-140 Phase 3: Calculation trace script — single entity forensic + aggregate comparison`

---

## PHASE 4: RUN CALCULATION TRACE

```bash
cd web
npx tsx scripts/ob140-calculation-trace.ts 2>&1 | tee ../OB-140_CALCULATION_TRACE_OUTPUT.txt
```

**PASTE THE ENTIRE OUTPUT INTO THE COMPLETION REPORT.**

**Commit:** `OB-140 Phase 4: Calculation trace output — raw evidence`

---

## PHASE 5: DIAGNOSIS REPORT

Based on the evidence from Phases 2 and 4, produce `OB-140_DIAGNOSIS.md` answering these questions with specific evidence:

### Entity Questions
1. How many entities exist? How many unique external_ids? What is the duplication factor?
2. When were the extra entities created? (One import? Multiple imports? Same timestamp?)
3. What differs between duplicate entity records? (metadata? display_name? entity_type?)
4. Is the duplication caused by: (a) SCI entity pipeline, (b) multiple imports, or (c) period-as-entity confusion?

### Rule Set Questions
5. How many rule_sets exist? Which one is being used for calculation?
6. Is there a PPTX-generated rule_set that differs from the original?
7. Do both rule_sets have the same 6 components? Do component definitions match?
8. Are input_bindings populated or empty?

### Data Questions
9. How many committed_data rows exist? From how many import batches?
10. Do old import rows coexist with new SCI import rows? (data contamination)
11. Are semantic_roles populated on SCI-imported data?
12. Do committed_data rows have correct entity_id linkages?

### Period Questions
13. How many periods exist? Are there duplicates?
14. Do periods from different imports overlap?

### Calculation Questions
15. Does a benchmark batch still exist? What total did it produce?
16. What is the exact delta between latest and benchmark at the component level?
17. Which components produce different amounts? Which are correct?
18. For the trace entity: which metrics resolved correctly and which didn't?
19. Is the calculation deficit caused by: (a) fewer entities matched, (b) wrong component amounts, (c) missing data for some components, or (d) wrong rule_set?

### Root Cause
20. State ONE root cause hypothesis supported by evidence from above.
21. State what would need to change to restore the Alpha benchmark.
22. State whether the restoration requires: (a) data cleanup only, (b) code fix, or (c) re-import.

**Format:**
```
## DIAGNOSIS

### Root Cause
[One sentence. Evidence reference.]

### Contributing Factors
1. [Factor with evidence]
2. [Factor with evidence]

### Restoration Path
[What to do, in what order, with expected result]

### Evidence Summary
[Table: question number, answer, evidence reference]
```

**Commit:** `OB-140 Phase 5: Diagnosis report with evidence-backed root cause`

---

## PHASE 6: COMPLETION REPORT + PR

Create `OB-140_COMPLETION_REPORT.md` containing:

1. The FULL output from Phase 2 (architecture trace)
2. The FULL output from Phase 4 (calculation trace)
3. The diagnosis from Phase 5
4. Proof gates below

```bash
gh pr create --base main --head dev \
  --title "OB-140: Dual-Trace Forensic Diagnostic — Alpha Benchmark Investigation" \
  --body "## Diagnostic Only — No Application Code Changed

### What This PR Contains
- Architecture trace script (database state inventory for Óptica Luminar tenant)
- Calculation trace script (single-entity forensic + aggregate benchmark comparison)
- Raw trace outputs
- Diagnosis report with evidence-backed root cause

### Why
CLT-139 revealed:
- 2,226 entities instead of 719 (3x — entity per row per period)
- MX\$524,500 instead of MX\$1,253,832 (58% deficit)
- Plan import showed 'Failed' but rule_set exists
- Alpha benchmark no longer reproducible

### Findings
[Insert root cause from diagnosis]"
```

**Commit:** `OB-140 Phase 6: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Architecture trace runs to completion | Script exits 0, output > 100 lines |
| PG-02 | Entity count documented | Exact count with duplication factor |
| PG-03 | Entity duplication source identified | When, how, why extra entities were created |
| PG-04 | Rule set inventory complete | All rule_sets listed with component counts |
| PG-05 | Committed data inventory complete | Row counts by data_type and import_batch |
| PG-06 | Period inventory complete | All periods listed with any duplicates flagged |
| PG-07 | Calculation trace runs to completion | Script exits 0, output > 50 lines |
| PG-08 | Benchmark batch identified (or confirmed missing) | Batch ID + total payout |
| PG-09 | Component-level comparison complete | Each component: latest vs benchmark vs expected |
| PG-10 | Root cause stated with evidence | One hypothesis, 3+ evidence references |
| PG-11 | Restoration path defined | Concrete steps to restore Alpha benchmark |
| PG-12 | ZERO application code modified | `git diff --name-only` shows only scripts/ and .md files |
| PG-13 | Full trace output in completion report | Not excerpts. Not summaries. Full paste. |

---

## CC FAILURE PATTERN WARNING

| Pattern | Risk | Prevention |
|---------|------|------------|
| Theory before evidence | CC hypothesizes root cause without running queries | Phases 1–4 run queries FIRST. Phase 5 diagnosis comes AFTER evidence. |
| Summarized evidence | CC pastes 3 lines instead of full output | PG-13: Full trace output mandatory. "Not excerpts." |
| Premature fix | CC starts writing application code | PG-12: Zero application code. Scripts and reports only. |
| Confirmation bias | CC finds one problem and stops looking | 22 diagnosis questions force comprehensive analysis. |

---

## WHAT HAPPENS AFTER OB-140

OB-140 produces evidence. It does NOT fix anything. Based on the diagnosis:

- If the root cause is **entity duplication from SCI**: draft OB-141 to fix the entity pipeline's dedup logic
- If the root cause is **stale rule_set from PPTX failure**: draft OB-141 to fix plan import error handling
- If the root cause is **data contamination from multiple imports**: draft OB-141 to clean data + add import isolation
- If the root cause is **multiple factors**: draft OB-141 with prioritized fix sequence

The diagnosis determines the fix. Not the other way around.

---

*"A total tells you what happened. A trace tells you why."*
*"Fix nothing until you can point to the exact row in the exact table that diverges."*
