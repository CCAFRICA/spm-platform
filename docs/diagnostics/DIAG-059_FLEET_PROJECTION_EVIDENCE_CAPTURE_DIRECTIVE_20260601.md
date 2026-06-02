# DIAG-059 — Fleet Projection & Hub Entity Evidence Capture

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root before executing any phase. This directive is governed by the standing rules throughout.

**Drafting discipline source:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Classification:** READ-ONLY diagnostic. No code changes, no SQL writes, no schema mutation, no PR. Every phase produces pasted evidence (Rule 27). Completion report is the sole artifact.

**Reconciliation-channel separation:** This diagnostic captures structural evidence only. No ground-truth values, no expected totals, no reconciliation verdicts. The architect channel holds the reference values and performs reconciliation interpretation.

---

## §1 — Problem Statement

Two defect classes identified via architect-channel reconciliation of Meridian Logistics Group (tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`):

**Class A — C5 (Utilización de Flota) = 0 across all entities and periods.** Convergence correctly binds fleet metric names (`cargas_totales_hub → Cargas_Totales`, `capacidad_total_hub → Capacidad_Total`). The intent tree is structurally sound (DIAG-58 harness proved formula correctness when data is present). The failure is in data resolution: `resolveColumnFromBatch` resolves by entity external_id; hub fleet data is keyed to hub entity names ("Monterrey Hub", etc.), not employee numbers. No projection mechanism exists to resolve hub-keyed reference data onto employee calculation contexts via a boundary field (e.g., `Hub_Asignado`).

**Class B — 12 hub reference entities calculated as standalone entities.** Hub entities (Monterrey Hub, Tijuana Hub, CDMX Hub, Querétaro Hub, Puebla Hub, Mérida Hub, Oaxaca Hub, Villahermosa Hub, Guadalajara Hub, Culiacán Hub, Acapulco Hub, Chihuahua Hub) are assigned and processed through the full calculation loop, receiving c3 (Seguridad) payouts. These are reference data sources, not calculable entities.

**Prior state:** DIAG-58 (`e85a7678`) confirmed Condition A (additive gap, not regression). AUD-0015 (`dede922b`) traced the ingestion path. This diagnostic captures the LIVE DATA STATE and CURRENT CODE STATE required before the remediation HF can be drafted. It answers five specific questions the architect needs.

---

## §2 — Substrate Discipline

**T1-E910 (Korean Test):** All queries use structural identifiers (UUIDs, column names from convergence bindings). No language-specific strings in query construction.

**T1-E902 (Carry Everything):** Capture full JSONB contents, do not summarize or elide fields.

**Decision 111 (convergence bindings):** The fleet component's `input_bindings` entry is the primary evidence surface for the binding shape.

**Decision 92 (source_date):** Note source_date values on hub fleet rows vs employee rows.

---

## §3 — Phase 1: Entity State Inspection

Determine what metadata and temporal_attributes Meridian entities carry. This answers: does the hub-assignment boundary survive entity creation?

**P1.1** — Record current HEAD SHA on branch `dev`. Record it in the completion report header. All code references in subsequent phases are against this SHA.

```bash
cd ~/spm-platform && git rev-parse HEAD
git log --oneline -3
```

**P1.2** — Query entity metadata for Meridian tenant. Retrieve ALL 79 entities with their `entity_type`, `external_id`, `display_name`, `metadata`, and `temporal_attributes`. Use Supabase service-role client.

Create and execute a script:

```bash
cat > /tmp/diag059_p1_entities.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  const { data, error } = await supabase
    .from('entities')
    .select('id, external_id, display_name, entity_type, metadata, temporal_attributes')
    .eq('tenant_id', TENANT)
    .order('external_id');

  if (error) { console.error('ERROR:', error); process.exit(1); }

  console.log(`Total entities: ${data.length}`);
  console.log('');

  // Classify: numeric external_id = employee, non-numeric = hub/reference
  const employees = data.filter(e => /^\d+$/.test(e.external_id || ''));
  const nonEmployees = data.filter(e => !/^\d+$/.test(e.external_id || ''));

  console.log(`Employees (numeric external_id): ${employees.length}`);
  console.log(`Non-employee entities: ${nonEmployees.length}`);
  console.log('');

  // Full dump of non-employee entities (hubs)
  console.log('=== NON-EMPLOYEE ENTITIES (full) ===');
  for (const e of nonEmployees) {
    console.log(JSON.stringify({
      id: e.id,
      external_id: e.external_id,
      display_name: e.display_name,
      entity_type: e.entity_type,
      metadata: e.metadata,
      temporal_attributes: e.temporal_attributes
    }, null, 2));
  }

  // Sample 5 employees with full metadata/temporal_attributes
  console.log('');
  console.log('=== SAMPLE EMPLOYEES (first 5, full) ===');
  for (const e of employees.slice(0, 5)) {
    console.log(JSON.stringify({
      id: e.id,
      external_id: e.external_id,
      display_name: e.display_name,
      entity_type: e.entity_type,
      metadata: e.metadata,
      temporal_attributes: e.temporal_attributes
    }, null, 2));
  }

  // Summary: how many employees have non-empty temporal_attributes?
  const withTA = employees.filter(e =>
    Array.isArray(e.temporal_attributes) && e.temporal_attributes.length > 0
  );
  console.log('');
  console.log(`Employees with temporal_attributes: ${withTA.length}/${employees.length}`);

  // Check for hub_asignado or similar in temporal_attributes keys
  const taKeys = new Set<string>();
  for (const e of employees) {
    if (Array.isArray(e.temporal_attributes)) {
      for (const attr of e.temporal_attributes as Array<{key: string}>) {
        taKeys.add(attr.key);
      }
    }
  }
  console.log(`Temporal attribute keys across all employees: ${JSON.stringify([...taKeys].sort())}`);

  // Check for hub-related keys in metadata
  const metaKeys = new Set<string>();
  for (const e of employees) {
    if (e.metadata && typeof e.metadata === 'object') {
      for (const k of Object.keys(e.metadata as Record<string, unknown>)) {
        metaKeys.add(k);
      }
    }
  }
  console.log(`Metadata keys across all employees: ${JSON.stringify([...metaKeys].sort())}`);
}

main().catch(console.error);
SCRIPT

cd ~/spm-platform && npx tsx /tmp/diag059_p1_entities.ts
```

Paste the FULL output into the completion report §P1.

**HALT-1:** If `temporal_attributes` for employees is universally empty AND `metadata` carries no hub-assignment field, record: "boundary field does NOT survive entity creation — the entity creation pipeline (processEntityUnit) does not capture Hub_Asignado." This does NOT halt the diagnostic — proceed to subsequent phases — but flag it as a critical finding for the HF.

---

## §4 — Phase 2: Committed Data Structure Inspection

Determine the data layout: are hub fleet metrics on employee-keyed rows or hub-keyed rows? What columns do they carry?

**P2.1** — Query committed_data for the Meridian tenant. Retrieve sample rows from EACH distinct `data_type` and `import_batch_id` combination, with row_data keys.

```bash
cat > /tmp/diag059_p2_committed.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  // Count rows by data_type and batch
  const { data: all, error } = await supabase
    .from('committed_data')
    .select('id, import_batch_id, entity_id, data_type, source_date, row_data, metadata')
    .eq('tenant_id', TENANT)
    .order('data_type')
    .order('import_batch_id');

  if (error) { console.error('ERROR:', error); process.exit(1); }

  console.log(`Total committed_data rows: ${all.length}`);

  // Group by data_type + batch
  const groups = new Map<string, typeof all>();
  for (const row of all) {
    const key = `${row.data_type}|${row.import_batch_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  console.log(`\nDistinct (data_type, batch) groups: ${groups.size}`);
  console.log('');

  for (const [key, rows] of groups) {
    const [dataType, batchId] = key.split('|');
    console.log(`=== data_type="${dataType}" batch="${batchId}" rows=${rows.length} ===`);

    // Row data keys from first row
    const sample = rows[0].row_data as Record<string, unknown>;
    const keys = Object.keys(sample).sort();
    console.log(`  row_data keys: ${JSON.stringify(keys)}`);

    // Check for fleet-related columns
    const fleetCols = keys.filter(k =>
      /carga|capacidad|flota|fleet|hub/i.test(k)
    );
    if (fleetCols.length > 0) {
      console.log(`  *** FLEET-RELATED COLUMNS: ${JSON.stringify(fleetCols)}`);
    }

    // Show 3 sample rows (full row_data)
    console.log('  Sample rows:');
    for (const r of rows.slice(0, 3)) {
      console.log(`    entity_id=${r.entity_id} source_date=${r.source_date} row_data=${JSON.stringify(r.row_data)}`);
    }

    // Check entity_id linkage
    const nullEntity = rows.filter(r => !r.entity_id).length;
    const withEntity = rows.filter(r => r.entity_id).length;
    console.log(`  entity_id: ${withEntity} linked, ${nullEntity} null`);
    console.log('');
  }
}

main().catch(console.error);
SCRIPT

cd ~/spm-platform && npx tsx /tmp/diag059_p2_committed.ts
```

Paste FULL output into the completion report §P2.

**P2.2** — Cross-reference: for rows that have fleet columns (`Cargas_Totales`, `Capacidad_Total`, or similar), what `entity_id` values do they carry? Map those entity_ids back to `entities.external_id` to confirm they are hub entities, not employee entities.

```bash
cat > /tmp/diag059_p2_fleet_rows.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  // Get all committed_data
  const { data: all } = await supabase
    .from('committed_data')
    .select('entity_id, row_data, data_type, source_date')
    .eq('tenant_id', TENANT);

  if (!all) { console.error('No data'); process.exit(1); }

  // Find rows with fleet columns
  const fleetRows = all.filter(r => {
    const rd = r.row_data as Record<string, unknown>;
    return Object.keys(rd).some(k => /Cargas_Total|Capacidad_Total|cargas_totales|capacidad_total/i.test(k));
  });

  console.log(`Rows with fleet columns: ${fleetRows.length} out of ${all.length}`);

  if (fleetRows.length === 0) {
    console.log('NO FLEET COLUMNS FOUND IN ANY committed_data ROW');
    // Also check: do employee rows carry Hub_Asignado or equivalent?
    const hubRefRows = all.filter(r => {
      const rd = r.row_data as Record<string, unknown>;
      return Object.keys(rd).some(k => /hub|Hub_Asignado/i.test(k));
    });
    console.log(`Rows with Hub-related columns: ${hubRefRows.length}`);
    if (hubRefRows.length > 0) {
      console.log('Sample:', JSON.stringify(hubRefRows[0].row_data, null, 2));
    }
    return;
  }

  // Map entity_ids to external_ids
  const entityIds = [...new Set(fleetRows.map(r => r.entity_id).filter(Boolean))];
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .in('id', entityIds as string[]);

  const entityMap = new Map((entities || []).map(e => [e.id, e]));

  console.log(`\nFleet rows belong to ${entityIds.length} distinct entities:`);
  for (const eid of entityIds) {
    const ent = entityMap.get(eid!);
    const rows = fleetRows.filter(r => r.entity_id === eid);
    console.log(`  entity_id=${eid} external_id=${ent?.external_id} name=${ent?.display_name} fleet_rows=${rows.length}`);
    // Show one sample
    console.log(`    sample: ${JSON.stringify(rows[0].row_data)}`);
  }

  // Also check: do employee rows carry Hub_Asignado?
  const empRows = all.filter(r => {
    const rd = r.row_data as Record<string, unknown>;
    return Object.keys(rd).some(k => /Hub_Asignado/i.test(k));
  });
  console.log(`\nRows with Hub_Asignado column: ${empRows.length}`);
  if (empRows.length > 0) {
    console.log('Sample:', JSON.stringify((empRows[0].row_data as Record<string, unknown>), null, 2));
  }
}

main().catch(console.error);
SCRIPT

cd ~/spm-platform && npx tsx /tmp/diag059_p2_fleet_rows.ts
```

Paste FULL output into the completion report §P2.2.

---

## §5 — Phase 3: Convergence Binding Shape Inspection

Determine the exact shape of the fleet component's convergence binding in `rule_sets.input_bindings`.

**P3.1** — Query `rule_sets.input_bindings` for the Meridian plan.

```bash
cat > /tmp/diag059_p3_bindings.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RULE_SET = '2fb555d4-53fe-42e8-9662-cae3d07da4f4';

async function main() {
  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings, components')
    .eq('id', RULE_SET)
    .single();

  if (error) { console.error('ERROR:', error); process.exit(1); }

  console.log(`Rule set: ${data.name}`);
  console.log(`Components count: ${Array.isArray(data.components) ? data.components.length : 'N/A'}`);
  console.log('');

  // Show input_bindings — the convergence binding shape
  console.log('=== input_bindings (full) ===');
  console.log(JSON.stringify(data.input_bindings, null, 2));

  // Show each component's name and calculationIntent type
  console.log('');
  console.log('=== components (name + intent type only) ===');
  if (Array.isArray(data.components)) {
    for (let i = 0; i < data.components.length; i++) {
      const c = data.components[i] as Record<string, unknown>;
      const intent = c.calculationIntent as Record<string, unknown> | undefined;
      console.log(`  c${i}: name="${c.name}" type="${intent?.type}" operation="${intent?.operation}"`);
      // For fleet component (c4), show full intent
      if (String(c.name || '').toLowerCase().includes('flota') ||
          String(c.name || '').toLowerCase().includes('fleet') ||
          i === 4) {
        console.log(`  c${i} FULL calculationIntent:`);
        console.log(JSON.stringify(intent, null, 2));
      }
    }
  }
}

main().catch(console.error);
SCRIPT

cd ~/spm-platform && npx tsx /tmp/diag059_p3_bindings.ts
```

Paste FULL output into the completion report §P3.

---

## §6 — Phase 4: Code Surface Inspection (Current HEAD)

Trace the three code surfaces that control fleet data resolution and entity assignment.

**P4.1 — `resolveColumnFromBatch`:** Paste the full function body from `web/src/app/api/calculation/run/route.ts`. Search for the function definition:

```bash
cd ~/spm-platform
grep -n 'function resolveColumnFromBatch' web/src/app/api/calculation/run/route.ts
```

Then view the complete function (use the line numbers from grep to define the range). Paste the full body into the completion report.

**P4.2 — Entity assignment (paginated fetch):** Find the code block that fetches entities for calculation (the "79 entities assigned" log line). Search:

```bash
grep -n 'entities assigned' web/src/app/api/calculation/run/route.ts
grep -n 'paginated fetch' web/src/app/api/calculation/run/route.ts
```

View 50 lines above the log line to capture the query that fetches entities. Does it filter by `entity_type`? Does it exclude reference/hub entities? Paste the full block.

**P4.3 — `allEntityRowsForPeriod` construction:** This is the context that the scope prime reads from. Search:

```bash
grep -n 'allEntityRows' web/src/app/api/calculation/run/route.ts
```

View the block where `allEntityRowsForPeriod` is built and where it's passed to the engine. Paste the full block.

**P4.4 — `buildEvalContext` in intent-executor:** This populates the evaluation context for the prime DAG engine.

```bash
grep -n 'buildEvalContext\|allEntityRows' web/src/lib/compensation/intent-executor.ts
```

View the function. Note whether `allEntityRows` is consumed. Paste the full body.

**P4.5 — Convergence binding shape handling in resolveMetricsFromConvergenceBindings:** This is where the binding is consumed to resolve metric values. Search:

```bash
grep -n 'resolveMetricsFromConvergenceBindings' web/src/app/api/calculation/run/route.ts
```

View the full function. Paste the complete body. Note: this function calls `resolveColumnFromBatch` — the chain is binding → metric resolution → column resolution → data lookup by entity external_id.

Paste ALL code surfaces into the completion report §P4 with file:line references.

---

## §7 — HALT Conditions

**HALT-1 (P1):** Boundary field absent from entity metadata AND temporal_attributes. Not a diagnostic halt — flag as critical finding, continue.

**HALT-2 (P2):** Fleet columns absent from ALL committed_data rows. If no row in `committed_data` carries `Cargas_Totales`/`Capacidad_Total` or equivalent, record: "fleet data not ingested — the SCI pipeline did not persist hub fleet metrics." Continue to §6 (code inspection) regardless.

**HALT-3 (P4):** If `resolveColumnFromBatch` at current HEAD differs materially from the version in AUD-005 `e85a7678` (e.g., HF-258 changed the function), record the diff. This is informational, not blocking.

---

## §8 — Reporting Discipline

**Completion report location:** `docs/diagnostics/DIAG-059_FLEET_PROJECTION_EVIDENCE_CAPTURE_20260601.md`

**Structure:**

```
# DIAG-059 — Fleet Projection & Hub Entity Evidence Capture — COMPLETION REPORT
## Classification: READ-ONLY diagnostic. No code, no SQL, no state mutation.
## HEAD SHA: <from P1.1>
## Date: 2026-06-01

## §P1 — Entity State
<paste P1.2 output verbatim>
### Finding P1-F1: [boundary field present/absent]

## §P2 — Committed Data Structure
<paste P2.1 output verbatim>
<paste P2.2 output verbatim>
### Finding P2-F1: [fleet data on hub-keyed rows / employee rows / absent]
### Finding P2-F2: [Hub_Asignado column presence in employee rows]

## §P3 — Convergence Binding Shape
<paste P3.1 output verbatim>
### Finding P3-F1: [fleet binding shape — source_batch, column, entity_identifier]

## §P4 — Code Surfaces at HEAD
### P4.1 resolveColumnFromBatch <file:line>
<paste function body>
### P4.2 Entity assignment <file:line>
<paste query block>
### P4.3 allEntityRowsForPeriod <file:line>
<paste construction block>
### P4.4 buildEvalContext <file:line>
<paste function body>
### P4.5 resolveMetricsFromConvergenceBindings <file:line>
<paste function body>

## §SUMMARY — Evidence Inventory for HF Drafting
1. Boundary field survives entity creation: [YES/NO]
2. Fleet data location: [hub-keyed rows / employee rows / absent]
3. Employee rows carry Hub_Asignado: [YES/NO]
4. Convergence binding source_batch points to: [hub fleet batch / employee batch]
5. resolveColumnFromBatch has boundary-join fallback: [YES/NO]
6. Entity assignment filters by entity_type: [YES/NO]
7. allEntityRowsForPeriod includes hub entities: [YES/NO]
```

Rules 25–28: every finding cites pasted evidence. No self-attestation.

Commit the completion report with message: `DIAG-059: Fleet projection & hub entity evidence capture (read-only)`.

Push.

---

## §9 — Out of Scope

- No code changes. No schema changes. No SQL writes.
- No HF drafting — the HF follows this diagnostic's evidence.
- No convergence modification — the binding shape is READ here, not modified.
- No reconciliation interpretation — architect channel performs reconciliation.
- No AUD-005 refresh — that is a separate artifact if HEAD has changed since `e85a7678`.
- No modification to HF-259 scope — that deliverable is independent (ingestion path, not calc engine).

## §9A — Residuals

- **AUD-005 refresh:** If P4 reveals that `resolveColumnFromBatch` or entity assignment have changed since `e85a7678`, a separate AUD-005 refresh is warranted. DIAG-059 captures the current state; AUD-005 refresh captures the full execution trace.
- **Variant base amounts (450 / 800):** The fleet formula's per-variant base payout amounts are known to the architect from GT analysis. They appear in the fleet component's `calculationIntent` parameters, captured in §P3. No separate inspection needed.
- **DIAG-58 `undefined===undefined` footgun:** Hub entities with empty metadata matching other empty-metadata entities in the scope prime. Recorded in DIAG-58 §4 as a hardening candidate. This diagnostic's P4.3/P4.4 evidence may further characterize it.
