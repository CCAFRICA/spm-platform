# DIAG-045: C5 Convergence Binding Failure Root Cause

**Type:** Read-only diagnostic (no modification)
**Predecessors:** DIAG-044 (import path unification), DIAG-043 (HF-223 surface verification), HF-222 (distinctEnoughToBind), HF-223 (conditional_gate intent shape)
**Purpose:** Determine why C5 convergence binding fails with `candidate distribution insufficient to bind (top=0.1000, n=8)` when C1-C4 bind successfully in the same convergence run, and when C5 bound successfully in March. Surface the actual data at each stage of the convergence pipeline for C5: metric requirement extraction from intent shape, candidate identification, candidate scoring, and binding admission decision.
**Output:** Single consolidated file at `docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md`

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. All rules apply.

Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Execute every phase sequentially. Commit after each phase. Push after each commit.

Schema-inspect-first: every tsx script reads the actual data shape before processing. Do not assume column names, JSONB structures, or array shapes. Inspect first, then query.

## Phase 0 -- Repo orientation and output file scaffold

Confirm working directory is VP repo root (`spm-platform`). Confirm on main.

```bash
pwd
git checkout main
git pull origin main
git log --oneline -5
git rev-parse HEAD
```

Create the output file scaffold at `docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md`:

```markdown
# DIAG-045 -- C5 Convergence Binding Failure Root Cause Output

**Date:** [CC inserts]
**Branch:** main
**HEAD commit:** [CC inserts]
**Scope:** Why does C5 convergence binding fail when C1-C4 succeed in the same run?

CC pastes verbatim code and data at every section. No interpretation. No PASS/FAIL. No design proposals.
```

```bash
git checkout -b diag-045-c5-convergence-binding-failure
git add docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
git commit -m "DIAG-045 Phase 0: output file scaffold"
git push origin diag-045-c5-convergence-binding-failure
```

Paste `git log -1 --oneline` verbatim.

## Phase 1 -- What metric requirements does convergence extract from C5's intent shape?

The convergence function `convergeBindings` calls `generateAllComponentBindings` which reads the rule_set's components and extracts metric requirements. We need to know what convergence sees when it reads C5's new conditional_gate-wrapped intent.

### 1.1 Locate the metric requirement extraction logic

```bash
grep -n "metric\|requirement\|sourceSpec\|numerator\|denominator\|source.*ratio\|extractMetric\|getMetric\|componentInput\|inputRequirement" web/src/lib/intelligence/convergence-service.ts | head -40
```

### 1.2 Read the function that extracts input requirements from a component's intent

From the grep results, identify the function that reads a component's calculationIntent and determines what data columns the component needs. Read the full function body verbatim. If the function name is not obvious from the grep, search more broadly:

```bash
grep -n "function.*component.*binding\|function.*generate.*binding\|function.*extract.*input\|function.*metric.*from" web/src/lib/intelligence/convergence-service.ts | head -20
```

Read the identified function in full. Paste verbatim.

### 1.3 Does the extraction traverse nested operations?

The C5 intent has this structure: `scalar_multiply { input: conditional_gate { condition: { left: ratio(...) } } }`. The metric requirements (`hub_total_loads`, `hub_total_capacity`) are inside the ratio sourceSpec, which is inside the conditional_gate condition's left operand. The extraction function must traverse from scalar_multiply -> input -> conditional_gate -> condition -> left -> ratio -> sourceSpec to find them.

```bash
grep -n "conditional_gate\|nested\|recursive\|traverse\|walk\|input\.operation\|input\.source\|deep" web/src/lib/intelligence/convergence-service.ts | head -20
```

Paste verbatim. This tells us whether the extraction logic handles nested operation trees or only reads top-level input specifications.

Append all findings under `## Phase 1 -- Metric requirement extraction` in the output file.

```bash
git add docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
git commit -m "DIAG-045 Phase 1: metric requirement extraction logic"
git push origin diag-045-c5-convergence-binding-failure
```

## Phase 2 -- What does convergence actually see for each component on the newest rule_set?

### 2.1 Read the convergence log output for C5 specifically

The import log showed `HF-222: Fleet Utilization - Senior:actual: candidate distribution insufficient to bind (top=0.1000, n=8)`. The convergence service emits log lines during binding. We need to see what convergence logged for C5 versus C1-C4.

Write a script to `web/scripts/diag045-convergence-trace.ts` that runs `convergeBindings` for the newest rule_set with enhanced logging to capture what happens at each stage for each component. BUT FIRST -- inspect the `convergeBindings` function signature to understand what arguments it takes:

```bash
grep -n "export.*function convergeBindings\|export.*convergeBindings\|async function convergeBindings" web/src/lib/intelligence/convergence-service.ts
```

Read the function signature and first 30 lines of the function body to understand setup.

### 2.2 Read the generateAllComponentBindings function

```bash
grep -n "function generateAllComponentBindings" web/src/lib/intelligence/convergence-service.ts
```

Read the full function. This is where component metric requirements are matched to data columns. Paste verbatim.

### 2.3 Read the distinctEnoughToBind function (HF-222 Phase 2)

```bash
grep -n "function distinctEnoughToBind\|distinctEnoughToBind" web/src/lib/intelligence/convergence-service.ts
```

Read the full function. This is the binding admission gate. Paste verbatim.

### 2.4 Read the candidate scoring function

Inside `generateAllComponentBindings`, identify the function or code block that scores candidates for a component. Read it verbatim. Key question: what produces the `top=0.1000` score for C5's candidates?

Append all under `## Phase 2 -- Convergence internals` in the output file.

```bash
git add docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
git commit -m "DIAG-045 Phase 2: convergence internals"
git push origin diag-045-c5-convergence-binding-failure
```

## Phase 3 -- What data columns exist in Meridian's committed_data?

### 3.1 Surface the actual column names in Meridian's committed_data

Write to `web/scripts/diag045-meridian-columns.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

  // Get a sample of committed_data rows to see actual column structure
  const { data: sample, error } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(5);

  if (error) { console.error('Error:', error); return; }

  console.log('=== committed_data sample row count:', sample?.length);
  if (sample && sample.length > 0) {
    const row = sample[0];
    console.log('=== Top-level keys:', Object.keys(row));
    
    // The actual column data is likely in a JSONB field. Inspect each field.
    for (const [key, value] of Object.entries(row)) {
      const t = typeof value;
      if (t === 'object' && value !== null) {
        const subKeys = Object.keys(value as object);
        console.log(`  ${key}: object with ${subKeys.length} keys: [${subKeys.join(', ')}]`);
      } else {
        console.log(`  ${key}: ${t} = ${JSON.stringify(value)?.substring(0, 100)}`);
      }
    }

    // If there's a 'data' or 'values' or 'row_data' JSONB field, dump its keys from multiple rows
    const dataField = Object.entries(row).find(([k, v]) => typeof v === 'object' && v !== null && !Array.isArray(v) && k !== 'id');
    if (dataField) {
      console.log(`\n=== Inspecting JSONB field "${dataField[0]}" across all sample rows:`);
      const allKeys = new Set<string>();
      for (const r of sample) {
        const obj = (r as any)[dataField[0]];
        if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach(k => allKeys.add(k));
        }
      }
      console.log('Union of all keys:', [...allKeys].sort());
    }
  }

  // Count rows by data_type and import_batch
  const { data: batches, error: batchErr } = await supabase
    .from('committed_data')
    .select('data_type, import_batch_id')
    .eq('tenant_id', tenantId);

  if (batches) {
    const byType = new Map<string, number>();
    const byBatch = new Map<string, number>();
    for (const b of batches) {
      byType.set(b.data_type, (byType.get(b.data_type) || 0) + 1);
      byBatch.set(b.import_batch_id, (byBatch.get(b.import_batch_id) || 0) + 1);
    }
    console.log('\n=== Rows by data_type:', Object.fromEntries(byType));
    console.log('=== Rows by import_batch_id:', Object.fromEntries(byBatch));
  }
}

main();
```

Run:

```bash
cd web && npx tsx scripts/diag045-meridian-columns.ts 2>&1
cd ..
```

Paste full output verbatim.

### 3.2 Surface the Fleet/Hub data columns specifically

From Phase 3.1, identify which JSONB field holds the actual data values. Then write a script to find all column names that contain "hub", "fleet", "load", "capacity", "utiliz" (case-insensitive) across all committed_data for this tenant:

```typescript
// In web/scripts/diag045-meridian-fleet-columns.ts
// Read ALL committed_data rows for this tenant
// For each row, inspect the JSONB data field
// Collect all column names that match hub/fleet/load/capacity/utiliz
// Report: column name, how many rows contain it, sample values
```

Run and paste full output verbatim.

Append under `## Phase 3 -- Meridian data columns`.

```bash
git add docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
git commit -m "DIAG-045 Phase 3: Meridian committed_data columns"
git push origin diag-045-c5-convergence-binding-failure
```

## Phase 4 -- What did convergence see for a successful component (C1) versus C5?

### 4.1 Read the existing convergence_bindings from the old rule_set that worked

The pre-HF-223 rule_set is `9ac467ba-bab4-4680-9453-5cb3deae02c6` (created 2026-05-13). Read its full `input_bindings.convergence_bindings` to see what bindings convergence produced when C5 was successfully bound:

```typescript
// In web/scripts/diag045-old-bindings.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const oldRsId = '9ac467ba-bab4-4680-9453-5cb3deae02c6';
  const newRsId = '6c98f209-6643-4242-96f5-174bdd034fa4';

  for (const rsId of [oldRsId, newRsId]) {
    const { data, error } = await supabase
      .from('rule_sets')
      .select('id, name, input_bindings, created_at')
      .eq('id', rsId)
      .single();

    if (error) { console.log(`${rsId}: ERROR`, error.message); continue; }

    console.log(`\n=== ${rsId} (created: ${data.created_at}) ===`);
    console.log('input_bindings:', JSON.stringify(data.input_bindings, null, 2));
  }
}

main();
```

Run and paste full output verbatim. This directly compares what the old rule_set had for C5 versus what the new rule_set has (partial or empty).

### 4.2 Read the classification_signals that convergence used for binding

Convergence reads `comprehension:plan_interpretation` signals and `comprehension:metric_comprehension` signals to understand what each component needs. Surface these for both rule_sets:

```typescript
// In web/scripts/diag045-convergence-signals.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const oldRsId = '9ac467ba-bab4-4680-9453-5cb3deae02c6';
  const newRsId = '6c98f209-6643-4242-96f5-174bdd034fa4';

  for (const rsId of [oldRsId, newRsId]) {
    const { data, error } = await supabase
      .from('classification_signals')
      .select('id, signal_type, signal_value, created_at')
      .eq('rule_set_id', rsId)
      .order('created_at', { ascending: true });

    if (error) { console.log(`${rsId}: ERROR`, error.message); continue; }

    console.log(`\n=== Signals for ${rsId} ===`);
    console.log(`Total: ${data.length}`);

    for (const s of data) {
      console.log('---');
      console.log(`signal_type: ${s.signal_type}`);
      console.log(`signal_value: ${JSON.stringify(s.signal_value, null, 2)}`);
    }
  }
}

main();
```

Run and paste full output verbatim.

Append under `## Phase 4 -- Old vs new rule_set comparison`.

```bash
git add docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
git commit -m "DIAG-045 Phase 4: old vs new rule_set comparison"
git push origin diag-045-c5-convergence-binding-failure
```

## Phase 5 -- Completion

Append to the output file:

```markdown
## Phase 5 -- DIAG-045 Complete

All four diagnostic phases executed. Output file contains:
- Metric requirement extraction logic from convergence-service.ts (does it traverse nested operations?)
- Convergence internals: generateAllComponentBindings, distinctEnoughToBind, candidate scoring
- Meridian committed_data column inventory (what columns exist, which contain fleet/hub data)
- Old rule_set (working) vs new rule_set (failing) comparison: input_bindings and classification_signals

CC does not interpret findings. Architect dispositions in architect channel.
```

```bash
git add docs/diagnostics/DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
git commit -m "DIAG-045 Phase 5: complete"
git push origin diag-045-c5-convergence-binding-failure
```

Paste `git log -5 --oneline` verbatim.

Create the PR:

```bash
gh pr create --base main --head diag-045-c5-convergence-binding-failure \
  --title "DIAG-045: C5 convergence binding failure root cause analysis" \
  --body "Read-only diagnostic. Surfaces metric extraction logic, convergence internals, Meridian data columns, and old vs new rule_set comparison to determine why C5 binding fails post-HF-223. No code changes."
```

Paste the PR URL verbatim.

Kill dev server. `rm -rf .next`. `npm run build`. `npm run dev`. Confirm localhost:3000.

End of diagnostic.
