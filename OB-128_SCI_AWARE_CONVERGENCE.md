# OB-128: SCI-AWARE CONVERGENCE + DG ATTAINMENT RESOLUTION
## Semantic Role Convergence + Composed Intent Generation + F-04 Closure
## Date: 2026-03-01
## Type: Overnight Batch
## Estimated Duration: 12-16 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture (Decision 77)
4. `OB-127_COMPLETION_REPORT.md` — what SCI built, why F-04 remains open
5. `OB-127_ARCHITECTURE_DECISION.md` — SCI service architecture
6. `web/src/lib/sci/sci-types.ts` — SCI type definitions including SemanticRole
7. `web/src/lib/calculation/intent-executor.ts` — intent composability (OB-78), ratio operation exists
8. `web/src/lib/convergence/convergence-service.ts` — current convergence logic

---

## WHAT THIS OB DOES

OB-127 built SCI and proved agents correctly classify content. But F-04 (DG uniform $30K) remains open because convergence doesn't understand semantic roles. When the Target Agent commits data with `performance_target` semantic role, convergence must:

1. Recognize that `performance_target` data creates a **goal metric** (not a duplicate of the actuals metric)
2. Generate a **composed intent** that computes attainment: `ratio(actuals / target) → bounded_lookup_1d → payout`
3. Update the plan component's `calculationIntent` to use both metrics

**The engine already supports this.** OB-78 proved three-level composition: `scalar_multiply(bounded_lookup_1d(ratio(actual, target)))`. The gap is in convergence — it doesn't know how to generate composed intents from semantic role pairs.

**After OB-128:**
- Convergence reads `semantic_roles` from `committed_data` metadata
- When it finds `performance_target` data paired with actuals data for the same plan, it generates a composed intent using `ratio`
- DG recalculation produces **variable payouts** based on per-entity targets
- F-04 is RESOLVED

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-128: SCI-Aware Convergence — F-04 Resolution" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary in convergence changes.** Korean Test applies.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND THE GAP

### 0A: Current convergence merge logic

```bash
echo "=== CONVERGENCE SERVICE — FULL FILE ==="
cat web/src/lib/convergence/convergence-service.ts

echo ""
echo "=== SPECIFICALLY THE MERGE/DEDUP LOGIC ==="
grep -n "merge\|dedup\|existing\|skip\|metric" web/src/lib/convergence/convergence-service.ts
```

**What to look for:** The line that skips duplicate metrics: `!merged.some(e => e.metric === d.metric)`. This is why the target derivation was dropped — the actuals metric already existed.

### 0B: Current DG plan component and intent

```bash
echo "=== DG RULE SET ==="
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', 'a630404c-0777-4f6d-b760-b8a190ecd63c')
    .ilike('name', '%Deposit Growth%')
    .single();
  console.log('Rule Set:', data?.name);
  console.log('Components:', JSON.stringify(data?.components, null, 2));
  console.log('Input Bindings:', JSON.stringify(data?.input_bindings, null, 2));
}
main();
"
```

**What to look for:** The DG component's `calculationIntent` — what operation it uses, what metrics it references, and how the current derivation maps.

### 0C: SCI target data in committed_data

```bash
echo "=== TARGET DATA FROM OB-127 ==="
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase
    .from('committed_data')
    .select('data_type, raw_data, metadata')
    .eq('tenant_id', 'a630404c-0777-4f6d-b760-b8a190ecd63c')
    .ilike('data_type', '%growth_target%')
    .limit(3);
  console.log('Target rows:', JSON.stringify(data, null, 2));
}
main();
"
```

**What to look for:** The `semantic_roles` in metadata, the data_type name, the target dollar amounts per entity.

### 0D: Intent executor — verify ratio operation exists

```bash
echo "=== INTENT EXECUTOR — RATIO SUPPORT ==="
grep -n "ratio\|Ratio\|numerator\|denominator" web/src/lib/calculation/intent-executor.ts

echo ""
echo "=== INTENT TYPES — RATIO DEFINITION ==="
grep -n "ratio\|Ratio\|numerator\|denominator" web/src/lib/calculation/intent-types.ts
```

**What to look for:** The `ratio` operation exists and accepts numerator/denominator as IntentSource or IntentOperation. This was built in OB-78.

**Commit:** `OB-128 Phase 0: Diagnostic — convergence merge logic, DG component, target data, ratio executor`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-128
=====================================

Problem: Convergence skips target-derived metrics because the actuals metric already exists.
  The engine needs BOTH an actuals metric and a target metric to compute attainment as a ratio.

Option A: Modify convergence merge logic to NOT skip when semantic roles differ
  - The existing metric (from deposit_balances) has semantic role: transaction_amount (actuals)
  - The new metric (from growth_targets) has semantic role: performance_target (goal)
  - Different semantic roles = different metrics, even if they share a component
  - Convergence generates TWO derivations per component when target data exists
  - Then generates a composed intent: ratio(actuals / target) → lookup → payout
  - Scale: YES. AI-first: YES. Atomic: YES.

Option B: Create a separate "target metric" naming convention
  - Actuals metric: deposit_growth_attainment
  - Target metric: deposit_growth_target
  - Different names bypass the dedup
  - Then manually compose the intent
  - Scale: YES but fragile naming dependency. AI-first: NO — relies on naming.

Option C: Store targets in a different table (not committed_data)
  - Separate reference_data table for targets
  - Convergence reads from both tables
  - Scale: YES. AI-first: YES. Atomic: adds schema complexity.

CHOSEN: Option A — semantic role-aware convergence. The merge logic checks semantic roles,
  not just metric names. When actuals AND targets exist for the same component, convergence
  generates a composed intent using the ratio primitive. This is the most AI-native approach
  and requires no naming conventions or schema changes.

REJECTED: Option B — naming conventions are hardcoded patterns (Rule 1 violation).
REJECTED: Option C — unnecessary schema complexity when semantic_roles already exist.
```

**Commit:** `OB-128 Phase 1: Architecture decision — semantic role-aware convergence`

---

## PHASE 2: CONVERGENCE SEMANTIC ROLE AWARENESS

Modify the convergence service to read `semantic_roles` from `committed_data` metadata and generate role-aware derivations.

### File: `web/src/lib/convergence/convergence-service.ts` (MODIFY — fix in place, Pattern 21)

**Changes required:**

### 2.1: Read semantic_roles during data inventory

When convergence inventories available data for a tenant, it must now also check for `semantic_roles` in the metadata of committed_data rows.

```typescript
// EXISTING: convergence reads data_types from committed_data
// NEW: also read semantic_roles to identify target vs actuals data

interface DataInventoryItem {
  dataType: string;
  rowCount: number;
  fields: string[];
  semanticRoles?: Record<string, string>;  // fieldName → semanticRole
  hasTargetData: boolean;                   // true if any field has 'performance_target' role
}
```

Query committed_data grouped by data_type, extract semantic_roles from metadata:

```sql
SELECT data_type, COUNT(*) as row_count, metadata
FROM committed_data
WHERE tenant_id = $1
GROUP BY data_type, metadata
```

### 2.2: Identify actuals-target pairs

After inventorying data, identify pairs where:
- One data_type has fields with semantic role `transaction_amount` or `baseline_value` (actuals source)
- Another data_type has fields with semantic role `performance_target` (target source)
- Both share a field with semantic role `entity_identifier` (the join key)
- Both are associated with the same plan component (via token overlap matching)

```typescript
interface ActualsTargetPair {
  componentName: string;
  actualsDataType: string;
  actualsField: string;           // the field containing actual values
  actualsOperation: string;       // 'sum', 'count', 'max', etc.
  targetDataType: string;
  targetField: string;            // the field containing target values
  entityIdField: string;          // shared entity identifier
}
```

### 2.3: Modify the merge logic

The current merge logic:
```typescript
// CURRENT (blocks target derivation):
if (!merged.some(e => e.metric === d.metric)) {
  merged.push(d);
}
```

Change to:
```typescript
// NEW (allows target derivation alongside actuals):
const existingMetric = merged.find(e => e.metric === d.metric);
if (!existingMetric) {
  merged.push(d);
} else {
  // Check if this is a different semantic role for the same metric
  // If existing is actuals and new is target (or vice versa), keep BOTH
  // with distinct metric names: {metric}_actuals and {metric}_target
  if (d.semanticRole !== existingMetric.semanticRole) {
    d.metric = `${d.metric}_target`;  // rename to avoid collision
    merged.push(d);
  }
}
```

### 2.4: Generate composed intent for actuals-target pairs

When convergence identifies an actuals-target pair, generate a composed `calculationIntent`:

```typescript
function generateAttainmentIntent(pair: ActualsTargetPair, existingIntent: any): ComponentIntent {
  // The attainment pattern:
  // 1. Compute ratio: actuals_value / target_value per entity
  // 2. Feed ratio into existing tier lookup (bounded_lookup_1d)
  // 3. Tier lookup produces payout amount or rate
  // 4. If rate: multiply by actuals to get payout

  // Read existing intent to determine what lookup structure exists
  const existingLookup = existingIntent?.intent || existingIntent;

  return {
    // Preserve existing component structure
    ...existingIntent,
    intent: {
      operation: existingLookup.operation,  // e.g., 'bounded_lookup_1d'
      input: {
        operation: 'ratio',
        numerator: {
          source: 'metric',
          sourceSpec: { field: `metric:${pair.actualsField}` }
        },
        denominator: {
          source: 'metric',
          sourceSpec: { field: `metric:${pair.targetField}` }
        },
        zeroDenominatorBehavior: 'zero'
      },
      boundaries: existingLookup.boundaries,
      outputs: existingLookup.outputs,
      noMatchBehavior: existingLookup.noMatchBehavior || 'zero'
    }
  };
}
```

### 2.5: Generate target metric derivation

When target data exists, generate a derivation that extracts the target value per entity:

```typescript
{
  metric: `${componentMetric}_target`,
  operation: 'sum',              // or 'first' — target is one value per entity
  source_pattern: targetDataType,
  source_field: targetField,
  filters: []
}
```

### 2.6: Update input_bindings with both derivations

The plan's `input_bindings.metric_derivations` array must contain BOTH:
- The existing actuals derivation (e.g., `deposit_growth_attainment` from `deposit_balances`)
- The new target derivation (e.g., `deposit_growth_attainment_target` from `deposit_growth_incentive__growth_targets`)

### 2.7: Update the plan component's calculationIntent

When an actuals-target pair is found, update the component's `calculationIntent` in `rule_sets.components` to use the composed ratio intent generated in step 2.4.

**CRITICAL:** This modifies the rule_set's components JSONB. Use service role. Verify the update with a read-back query.

**Tests:** Create `web/scripts/ob128-test-convergence.ts`:
- Test 1: Convergence reads semantic_roles from committed_data metadata
- Test 2: Actuals-target pair detected for DG (deposit_balances + growth_targets)
- Test 3: Merge logic keeps both derivations (actuals + target) instead of skipping
- Test 4: Composed intent generated with ratio(actuals/target) → bounded_lookup_1d
- Test 5: Input bindings updated with both metric derivations
- Test 6: Plan component calculationIntent updated with composed ratio
- Test 7: Korean Test — zero domain vocabulary in convergence changes

**Commit:** `OB-128 Phase 2: Semantic role-aware convergence — actuals-target pairs, composed intents`

---

## PHASE 3: METRIC RESOLUTION FOR TARGET DATA

The calculation engine resolves metrics from committed_data via derivations. The target derivation must produce a per-entity value.

### 3.1: Verify existing metric resolution handles the target data_type

```bash
echo "=== METRIC RESOLUTION / DERIVATION EXECUTOR ==="
grep -rn "derivation\|resolveMetric\|computeMetric\|metric_derivations" \
  web/src/app/api/calculation/ --include="*.ts" | head -30

echo ""
echo "=== HOW DERIVATIONS QUERY COMMITTED DATA ==="
grep -rn "committed_data\|source_pattern\|source_field" \
  web/src/app/api/calculation/ --include="*.ts" | head -20
```

### 3.2: Check if derivation executor can find target rows

The target data has:
- `data_type`: `deposit_growth_incentive__growth_targets` (from OB-127 SCI)
- Rows with entity-specific target amounts
- An entity identifier field that matches entity IDs in assignments

The derivation executor must be able to:
1. Find rows in `committed_data` where `data_type` matches the `source_pattern`
2. Filter by entity (the derivation runs per-entity)
3. Extract the target amount from the `source_field`

**If the existing derivation executor already handles this:** No changes needed. The target derivation is structurally identical to existing derivations — just pointing at a different data_type and field.

**If the existing executor cannot find the target rows:** Diagnose why (data_type format, field name resolution from raw_data vs field_mappings) and fix.

**Tests:** Create `web/scripts/ob128-test-metric-resolution.ts`:
- Test 1: Target derivation resolves a value for Officer 1001 (should be 945149 from CLT-126 data)
- Test 2: Target derivation resolves a different value for Officer 1003 (should differ from 1001)
- Test 3: Actuals derivation still resolves correctly (deposit_balances unchanged)
- Test 4: Both metrics available to intent executor in same entity context

**Commit:** `OB-128 Phase 3: Metric resolution for target data — verify derivation executor handles target data_type`

---

## PHASE 4: DG END-TO-END — F-04 RESOLUTION

### 4.1: Clean state

```sql
-- Delete any stale DG committed_data from previous attempts (HF-083 already cleaned,
-- but verify no artifacts from OB-127 Phase 7 remain)
-- Then re-import target data via SCI execute API to ensure clean semantic_roles
```

### 4.2: Run convergence for DG

Trigger convergence for the DG plan. Convergence should now:
1. See deposit_balances (actuals, semantic role: transaction_amount)
2. See deposit_growth_incentive__growth_targets (targets, semantic role: performance_target)
3. Generate two derivations (actuals + target)
4. Generate composed intent: ratio(actuals/target) → bounded_lookup_1d
5. Update DG component's calculationIntent

### 4.3: Verify convergence output

```bash
npx tsx -e "
// Read DG plan after convergence
// Verify: input_bindings has 2 derivations
// Verify: calculationIntent uses ratio operation
// Verify: ratio references both actuals and target metrics
"
```

### 4.4: Delete stale DG results and recalculate

```sql
-- Rule 25: DELETE before INSERT
DELETE FROM calculation_results
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND rule_set_id = (SELECT id FROM rule_sets WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c' AND name LIKE '%Deposit Growth%');

-- Delete corresponding batches
DELETE FROM calculation_batches
WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND rule_set_id = (SELECT id FROM rule_sets WHERE tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c' AND name LIKE '%Deposit Growth%');
```

Recalculate DG for all 4 periods via `POST /api/calculation/run`.

### 4.5: F-04 Verdict

```bash
npx tsx -e "
// Query DG results
// For each entity: record payout amount
// KEY TEST: Do payouts VARY by entity?
// If Officer 1001 target is 945149 and Officer 1003 target differs,
// then payout amounts should differ based on individual attainment
"
```

**If payouts vary:** F-04 = RESOLVED. Record all per-entity payouts. Compare against expected attainment tiers from the DG plan.

**If payouts still uniform:** Document exactly what convergence produced, what the intent looks like, what metrics the executor received, and where the value fell to uniform. This becomes the next diagnostic target.

**Commit:** `OB-128 Phase 4: DG end-to-end — F-04 resolution attempt`

---

## PHASE 5: REGRESSION

### 5.1: CL, MO, IR unchanged

```sql
SELECT rs.name, COUNT(*) as results, SUM(cr.payout_amount) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = 'a630404c-0777-4f6d-b760-b8a190ecd63c'
  AND rs.name NOT LIKE '%Deposit Growth%'
GROUP BY rs.name;
```

Expected:
- Consumer Lending: 100 results, $6,540,774.36
- Mortgage Origination: 56 results, $989,937.41
- Insurance Referral: 64 results, $366,600.00

### 5.2: MBC unchanged

```sql
SELECT COUNT(*) as results, SUM(payout_amount) as total
FROM calculation_results
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
```

Expected: 240 results, $3,245,212.66 ± $0.10

### 5.3: Other tenants unaffected

Verify convergence changes didn't modify any other tenant's rule_sets or input_bindings.

**Commit:** `OB-128 Phase 5: Regression — CL/MO/IR/MBC all unchanged`

---

## PHASE 6: KOREAN TEST + BUILD CLEAN

### 6.1: Korean Test on all modified files

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/lib/convergence/ --include="*.ts"

# Also check SCI files weren't polluted
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/lib/sci/ --include="*.ts"

# Expected: 0 matches in both
```

### 6.2: Build clean

```bash
cd web && rm -rf .next && npm run build
```

**Commit:** `OB-128 Phase 6: Korean Test PASS + build clean`

---

## PHASE 7: COMPLETION REPORT + PR

Create `OB-128_COMPLETION_REPORT.md` at project root.

### Proof Gates — Hard

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | npm run build clean |
| PG-02 | Convergence reads semantic_roles | Target data detected with performance_target role |
| PG-03 | Actuals-target pair identified | DG pair: deposit_balances (actuals) + growth_targets (target) |
| PG-04 | Merge logic keeps both derivations | input_bindings has 2+ metric_derivations for DG |
| PG-05 | Composed intent generated | DG calculationIntent uses ratio(actuals/target) → lookup |
| PG-06 | Target metric resolves per-entity | Officer 1001 target ≠ Officer 1003 target |
| PG-07 | DG recalculation produces results | 48 results for DG (12 entities × 4 periods) |
| PG-08 | **F-04 verdict** | **Document whether payouts vary or remain uniform** |
| PG-09 | CL unchanged | 100 results, $6,540,774.36 |
| PG-10 | Mortgage unchanged | 56 results, $989,937.41 |
| PG-11 | IR unchanged | 64 results, $366,600.00 |
| PG-12 | MBC regression | 240 results, $3,245,212.66 ± $0.10 |
| PG-13 | Korean Test | 0 domain vocabulary in convergence + SCI files |
| PG-14 | No auth files modified | Middleware unchanged |

### Proof Gates — Soft

| # | Gate | Criterion |
|---|------|-----------|
| SPG-01 | Composed intent structure correct | ratio has numerator (actuals) and denominator (target) |
| SPG-02 | Target derivation per-entity | Different entities resolve different target values |
| SPG-03 | Other tenants unaffected | No convergence changes to MBC or other tenants |

**Create PR:** `gh pr create --base main --head dev --title "OB-128: SCI-Aware Convergence — Semantic Role Matching + F-04 Resolution" --body "Convergence reads semantic_roles from SCI-committed data. When actuals and target data exist for the same component, generates composed ratio intent. F-04 status: [RESOLVED/OPEN]."`

**Commit:** `OB-128 Phase 7: Completion report + PR`

---

## FILES MODIFIED/CREATED (Expected)

| File | Change |
|------|--------|
| `web/src/lib/convergence/convergence-service.ts` | **MODIFIED** — semantic role awareness, merge logic, composed intent generation |
| `web/scripts/ob128-test-convergence.ts` | **NEW** — convergence semantic role tests |
| `web/scripts/ob128-test-metric-resolution.ts` | **NEW** — target metric resolution tests |
| `web/scripts/ob128-phase4-f04-proof.ts` | **NEW** — DG end-to-end proof |
| `OB-128_COMPLETION_REPORT.md` | **NEW** — completion report |

---

## WHAT SUCCESS LOOKS LIKE

After OB-128, the full SCI pipeline works end-to-end:
1. A file is analyzed by SCI agents (OB-127) — Tab 1 goes to Plan, Tab 2 goes to Target
2. Target data is committed with semantic roles (OB-127)
3. Convergence recognizes the actuals-target pair and generates a composed ratio intent (OB-128)
4. The engine computes per-entity attainment (actual growth / target) and looks up the appropriate tier payout (OB-128)
5. DG payouts vary by entity based on individual targets

This is the first demonstration of SCI delivering calculation accuracy that the old two-path import could not achieve.

---

*"The data told the platform what it was. The platform figured out what to do with it. The engine computed the right answer. No human selected a path, a plan, or a pipeline."*
