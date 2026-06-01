# DIAG-046: CRP Plan 1 Capital Equipment Convergence Binding and Intent Shape Diagnostic

**Type:** Read-only diagnostic (no modification)
**Predecessors:** DIAG-045 (C5 convergence binding failure), HF-225 (composition principle + period fix)
**Purpose:** CRP Plan 1 (Capital Equipment) produces $84,933.50 for Jan 1-15 against GT $73,142.72 (15% over). In March 2026, the same plan reconciled at $73,142.72 exact. The plan was re-imported post-HF-223/225. This diagnostic surfaces what the LLM emitted as the calculationIntent, what convergence bound as input_bindings, whether the product_category filter is present in the convergence derivation, and what data the engine actually resolved for reference entity Tyler Morrison (CRP-6007).
**Output:** Single consolidated file at `docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md`

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. All rules apply.

Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Execute every phase sequentially. Commit after each phase. Push after each commit.

Schema-inspect-first: every tsx script inspects the actual data shape before processing. Do not assume JSONB structures.

## Phase 0 -- Repo orientation and output file scaffold

Confirm working directory is VP repo root (`spm-platform`). Confirm on main.

```bash
pwd
git checkout main
git pull origin main
git log --oneline -5
git rev-parse HEAD
```

Create the output file scaffold at `docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md`:

```markdown
# DIAG-046 -- CRP Plan 1 Convergence Binding and Intent Shape Diagnostic Output

**Date:** [CC inserts]
**Branch:** [CC inserts]
**HEAD commit:** [CC inserts]
**Scope:** Why does CRP Plan 1 produce $84,933.50 instead of GT $73,142.72 for Jan 1-15?

CC pastes verbatim data at every section. No interpretation. No PASS/FAIL. No design proposals.
```

```bash
git checkout -b diag-046-crp-plan1-binding
mkdir -p docs/diagnostics
git add docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md
git commit -m "DIAG-046 Phase 0: output file scaffold"
git push origin diag-046-crp-plan1-binding
```

Paste `git log -1 --oneline` verbatim.

## Phase 1 -- Plan 1 calculationIntent shape

Read the current Capital Equipment Commission Plan rule_set. Inspect the components shape first (schema-inspect-first), then navigate to the component's calculationIntent.

Write to `web/scripts/diag046-plan1-intent.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  const { data: ruleSets, error } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }

  // Find Capital Equipment plan
  const plan1 = ruleSets?.find(rs => rs.name?.toLowerCase().includes('capital equipment'));
  if (!plan1) { console.log('Capital Equipment plan not found'); return; }

  console.log('=== PLAN 1: Capital Equipment ===');
  console.log('rule_set_id:', plan1.id);
  console.log('name:', plan1.name);
  console.log('created_at:', plan1.created_at);

  // Inspect components shape
  const comp = plan1.components as any;
  console.log('\n=== COMPONENTS SHAPE ===');
  console.log('typeof:', typeof comp);
  console.log('isArray:', Array.isArray(comp));
  if (typeof comp === 'object' && comp !== null) {
    console.log('top-level keys:', Object.keys(comp));
  }

  // Navigate to variants and components
  const variants = comp?.variants || [comp];
  if (Array.isArray(variants)) {
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      const vName = v.variantName || v.name || `variant_${vi}`;
      console.log(`\n=== Variant ${vi}: ${vName} ===`);

      const components = v.components || [];
      for (let ci = 0; ci < components.length; ci++) {
        const c = components[ci];
        const cName = c.name || c.label || `component_${ci}`;
        console.log(`\n  Component ${ci}: ${cName}`);
        console.log('  calculationIntent:', JSON.stringify(c.calculationIntent, null, 2));
        console.log('  metadata.calcMethod:', JSON.stringify(c.metadata?.calcMethod, null, 2));
      }
    }
  }

  // Input bindings
  console.log('\n=== INPUT BINDINGS ===');
  console.log(JSON.stringify(plan1.input_bindings, null, 2));
}

main();
```

Run:

```bash
cd web && npx tsx scripts/diag046-plan1-intent.ts 2>&1
cd ..
```

Paste full output verbatim. Append under `## Phase 1 -- Plan 1 calculationIntent` in the output file.

```bash
git add docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md web/scripts/diag046-plan1-intent.ts
git commit -m "DIAG-046 Phase 1: Plan 1 calculationIntent and input_bindings"
git push origin diag-046-crp-plan1-binding
```

## Phase 2 -- Tyler Morrison data resolution

What data does the engine actually see for Tyler Morrison (CRP-6007) in the Jan 1-15 period? Surface all committed_data rows, their total_amount values, and their product_category values. This answers whether the engine is summing ALL categories or only Capital Equipment.

Write to `web/scripts/diag046-tyler-data.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Find Tyler Morrison entity
  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', tenantId)
    .or('external_id.eq.CRP-6007,display_name.ilike.%Tyler Morrison%')
    .limit(5);

  if (entErr || !entities?.length) { console.error('Entity not found:', entErr); return; }

  const entity = entities[0];
  console.log('=== ENTITY ===');
  console.log(`${entity.display_name} (${entity.external_id}, id=${entity.id})`);

  // All committed_data rows for this entity in Jan 1-15
  const { data: rows, error: rowErr } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entity.id)
    .gte('source_date', '2026-01-01')
    .lte('source_date', '2026-01-15');

  if (rowErr) { console.error('Data error:', rowErr); return; }

  console.log(`\n=== COMMITTED_DATA for Jan 1-15 (${rows?.length} rows) ===`);

  // Inspect first row shape
  if (rows && rows.length > 0) {
    const r = rows[0];
    console.log('Row top-level keys:', Object.keys(r));

    // Find the JSONB data field
    let dataFieldName = '';
    for (const [key, value] of Object.entries(r)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const subKeys = Object.keys(value as object);
        if (subKeys.length > 3 && key !== 'id') {
          dataFieldName = key;
          console.log(`\nJSONB field "${key}" keys:`, subKeys);
        }
      }
    }

    // Dump all rows with total_amount and product_category
    let totalAll = 0;
    let totalEquipment = 0;
    let totalConsumables = 0;
    let totalOther = 0;

    console.log('\n=== PER-ROW DETAIL ===');
    for (const r of rows) {
      const data = dataFieldName ? (r as any)[dataFieldName] : r;
      const amt = Number(data?.total_amount || 0);
      const cat = String(data?.product_category || data?.productCategory || 'MISSING');
      const orderType = String(data?.order_type || data?.orderType || 'MISSING');
      const productName = String(data?.product_name || data?.productName || 'MISSING');

      totalAll += amt;
      if (cat.toLowerCase().includes('capital') || cat.toLowerCase().includes('equipment')) {
        totalEquipment += amt;
      } else if (cat.toLowerCase().includes('consumab')) {
        totalConsumables += amt;
      } else {
        totalOther += amt;
      }

      console.log(`  date=${r.source_date} | amt=${amt} | cat="${cat}" | order="${orderType}" | product="${productName}"`);
    }

    console.log('\n=== TOTALS ===');
    console.log(`All categories: ${totalAll}`);
    console.log(`Capital Equipment only: ${totalEquipment}`);
    console.log(`Consumables only: ${totalConsumables}`);
    console.log(`Other/Missing: ${totalOther}`);
    console.log(`GT Equipment Revenue for Tyler Jan 1-15: 179527`);
    console.log(`GT Commission: 0.06 * 179527 + 200 = ${0.06 * 179527 + 200}`);
    console.log(`Engine output for Tyler Jan 1-15: 12352.52`);
  }

  // Also check: does Tyler have rows WITHOUT source_date (period-agnostic)?
  const { data: agnosticRows, error: agErr } = await supabase
    .from('committed_data')
    .select('id, source_date, data_type')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entity.id)
    .is('source_date', null);

  console.log(`\n=== PERIOD-AGNOSTIC ROWS (source_date IS NULL): ${agnosticRows?.length} ===`);
  for (const r of agnosticRows || []) {
    console.log(`  id=${r.id}, data_type=${r.data_type}`);
  }
}

main();
```

Run:

```bash
cd web && npx tsx scripts/diag046-tyler-data.ts 2>&1
cd ..
```

Paste full output verbatim. Append under `## Phase 2 -- Tyler Morrison data` in the output file.

```bash
git add docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md web/scripts/diag046-tyler-data.ts
git commit -m "DIAG-046 Phase 2: Tyler Morrison data resolution detail"
git push origin diag-046-crp-plan1-binding
```

## Phase 3 -- March vs current convergence comparison

In March, convergence produced: `Pass 4 derivation: period_equipment_revenue → sum(total_amount) filters=[product_category=Capital Equipment]`. The filter on product_category was present. Read the current convergence derivation rules from input_bindings to check whether the product_category filter exists.

Write to `web/scripts/diag046-convergence-comparison.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // All CRP rule_sets with input_bindings
  const { data: ruleSets, error } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }

  for (const rs of ruleSets || []) {
    console.log(`\n=== ${rs.name} (${rs.id}, created: ${rs.created_at}) ===`);

    const bindings = rs.input_bindings as any;
    if (!bindings) { console.log('  No input_bindings'); continue; }

    // Look for convergence_bindings
    const cb = bindings.convergence_bindings;
    if (cb) {
      console.log('  convergence_bindings:', JSON.stringify(cb, null, 2));
    }

    // Look for metric_derivations
    const md = bindings.metric_derivations;
    if (md) {
      console.log('  metric_derivations:', JSON.stringify(md, null, 2));
    }

    // Look for filters anywhere in the bindings
    const bindingsStr = JSON.stringify(bindings);
    if (bindingsStr.includes('filter') || bindingsStr.includes('product_category') || bindingsStr.includes('Capital Equipment')) {
      console.log('  CONTAINS FILTER REFERENCE: yes');
    } else {
      console.log('  CONTAINS FILTER REFERENCE: no');
    }
  }
}

main();
```

Run:

```bash
cd web && npx tsx scripts/diag046-convergence-comparison.ts 2>&1
cd ..
```

Paste full output verbatim. Append under `## Phase 3 -- Convergence derivation comparison` in the output file.

```bash
git add docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md web/scripts/diag046-convergence-comparison.ts
git commit -m "DIAG-046 Phase 3: convergence derivation filter comparison"
git push origin diag-046-crp-plan1-binding
```

## Phase 4 -- Completion

Append to the output file:

```markdown
## Phase 4 -- DIAG-046 Complete

All three diagnostic phases executed. Output file contains:
- Plan 1 calculationIntent shape (what operation, what rate, what intercept the LLM emitted)
- Input bindings (convergence derivation rules including any product_category filters)
- Tyler Morrison per-row data (total_amount per category, equipment-only vs all-category sum)
- Convergence derivation comparison (filter presence across all CRP rule_sets)

CC does not interpret findings. Architect dispositions in architect channel.
```

```bash
git add docs/diagnostics/DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md
git commit -m "DIAG-046 Phase 4: complete"
git push origin diag-046-crp-plan1-binding
```

Paste `git log -4 --oneline` verbatim.

Create the PR:

```bash
gh pr create --base main --head diag-046-crp-plan1-binding \
  --title "DIAG-046: CRP Plan 1 convergence binding and intent shape diagnostic" \
  --body "Read-only diagnostic. Surfaces Plan 1 calculationIntent, convergence bindings (product_category filter presence), Tyler Morrison per-row data resolution, and convergence derivation comparison. No code changes."
```

Paste the PR URL verbatim.

Kill dev server. `rm -rf .next`. `npm run build`. `npm run dev`. Confirm localhost:3000.

End of diagnostic.
