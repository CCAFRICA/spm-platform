# CC-UAT-06: ÓPTICA LUMINAR FULL DIAGNOSTIC
## One Script. Complete Picture. No Back-and-Forth.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE.md`
3. `ENGINE_CONTRACT.md`
4. `ENGINE_CONTRACT_BINDING.sql`
5. `web/src/lib/calculation/run-calculation.ts` — THE calculation engine

**Read all five before writing any code.**

---

## PURPOSE

OB-143 fixed the "Rule set has no components" bug. The engine now reads 6 components and runs. But it produces **MX$0.00 for all 741 entities.** We need to understand why.

Known facts:
- 741 entities, 4 periods, 6 components, 741 assignments — Engine Contract fulfilled
- 119,147 total committed_data rows
- 4,340 rows have BOTH entity_id AND period_id (bound)
- 114,807 rows have NULL entity_id or period_id (orphaned)
- 22,137 unique `num_empleado` values in committed_data, but only 741 entities
- The 741 entities correspond to ~719 unique employees from the original plan scope
- Calculation processed 741 entities and returned MX$0.00 for every single one

**This diagnostic must answer:**
1. Why does MX$0.00 come back? Is the engine receiving data and computing zero, or receiving NO data?
2. What does the data look like for bound rows? Which sheets/periods do they cover?
3. For ONE specific entity with bound data — trace every component's calculation path
4. What would it take to get the correct MX$1,253,832 benchmark?

---

## WHAT TO BUILD

Create `web/scripts/cc-uat-06-optica-diagnostic.ts` that connects to Supabase and outputs a complete diagnostic report. The script runs via `npx ts-node --project tsconfig.json web/scripts/cc-uat-06-optica-diagnostic.ts` or equivalent.

**The script must output ALL sections below in a single run. No manual steps. No browser required.**

---

## SECTION 1: ENGINE CONTRACT STATUS

```typescript
// Run the 7-value Engine Contract verification query
// Output:
//   entity_count: 741
//   period_count: 4
//   active_plans: 1
//   component_count: 6
//   assignment_count: 741
//   bound_data_rows: X
//   orphaned_data_rows: Y
```

---

## SECTION 2: DATA LANDSCAPE — WHAT'S IN committed_data?

```typescript
// 2A: Row counts by binding status
// SELECT 
//   COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NOT NULL) as fully_bound,
//   COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NULL) as entity_only,
//   COUNT(*) FILTER (WHERE entity_id IS NULL AND period_id IS NOT NULL) as period_only,
//   COUNT(*) FILTER (WHERE entity_id IS NULL AND period_id IS NULL) as fully_orphaned,
//   COUNT(*) as total

// 2B: Bound rows by period
// SELECT p.canonical_key, p.label, COUNT(cd.id) as bound_rows, COUNT(DISTINCT cd.entity_id) as unique_entities
// FROM committed_data cd
// JOIN periods p ON cd.period_id = p.id
// WHERE cd.tenant_id = ? AND cd.entity_id IS NOT NULL AND cd.period_id IS NOT NULL
// GROUP BY p.canonical_key, p.label ORDER BY p.canonical_key

// 2C: Bound rows by sheet name (from row_data->>'_sheetName')
// SELECT row_data->>'_sheetName' as sheet, COUNT(*) as rows, 
//   COUNT(DISTINCT entity_id) as unique_entities,
//   COUNT(DISTINCT period_id) as unique_periods
// FROM committed_data 
// WHERE tenant_id = ? AND entity_id IS NOT NULL AND period_id IS NOT NULL
// GROUP BY sheet ORDER BY rows DESC

// 2D: ALL rows by sheet name (regardless of binding)
// SELECT row_data->>'_sheetName' as sheet, COUNT(*) as total_rows,
//   COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NOT NULL) as bound,
//   COUNT(*) FILTER (WHERE entity_id IS NULL OR period_id IS NULL) as unbound,
//   COUNT(DISTINCT row_data->>'num_empleado') FILTER (WHERE row_data->>'num_empleado' IS NOT NULL) as unique_employees
// FROM committed_data WHERE tenant_id = ?
// GROUP BY sheet ORDER BY total_rows DESC

// 2E: Unique num_empleado coverage
// How many of the 741 entity external_ids actually appear in committed_data?
// SELECT COUNT(DISTINCT e.external_id) as entities_with_data
// FROM entities e
// WHERE e.tenant_id = ?
//   AND EXISTS (
//     SELECT 1 FROM committed_data cd 
//     WHERE cd.tenant_id = e.tenant_id 
//       AND cd.row_data->>'num_empleado' = e.external_id
//   )

// 2F: For the BOUND rows — what fields exist in row_data?
// Pick 5 bound rows and output ALL their row_data keys + sample values
```

---

## SECTION 3: RULE SET ANATOMY

```typescript
// 3A: Full component list with calculation structure
// For each of the 6 components, output:
//   - name, type/componentType
//   - tierConfig (metric name, tier boundaries, tier values)
//   - calculationIntent (operation, operands, boundaries, outputs)
//   - postProcessing (if exists)
//   - input_bindings relevant to this component

// 3B: Input bindings
// Output the FULL input_bindings JSON from the rule_set
// For each binding: source metric name → derivation rule → which data_type + field it resolves from

// 3C: Component-to-data mapping
// For each component, trace: 
//   component needs metric X → input_binding says X comes from data_type Y field Z
//   → does committed_data have data_type Y? How many rows? How many bound?
```

---

## SECTION 4: SINGLE-ENTITY CALCULATION TRACE

```typescript
// Pick the entity with the MOST bound committed_data rows
// If no entity has bound rows for the target period (Enero 2024), document that.

// 4A: Entity identity
// Output: entity UUID, external_id, display_name, entity_type

// 4B: What committed_data rows exist for this entity?
// For each period:
//   - How many rows?
//   - What sheets are they from?
//   - What are the key numeric fields and their values?
//     (Venta_Individual, Meta_Individual, Cumplimiento, Real_Venta_Tienda, 
//      Meta_Venta_Tienda, Clientes_Actuales, Clientes_Meta, etc.)
//   - Show the ACTUAL row_data for 2-3 rows (full JSON, not summarized)

// 4C: What calculation_results exist for this entity?
// SELECT total_payout, components, metrics, attainment, metadata
// FROM calculation_results
// WHERE entity_id = ? AND period_id = ?
// Show the FULL components JSON — every component's individual payout

// 4D: Trace each component
// For each of the 6 components:
//   1. What metric does this component need? (from tierConfig.metric or calculationIntent)
//   2. What does the input_binding say about resolving this metric?
//   3. Does the committed_data for this entity+period have the required field?
//   4. What value does the field have?
//   5. What should the calculation produce given this input?
//   6. What did the calculation actually produce?
//   7. If $0: WHY? (no data? no metric resolution? no tier match? calculation logic gap?)
```

---

## SECTION 5: THE $0 ROOT CAUSE ANALYSIS

```typescript
// Based on Sections 2-4, output a structured root cause analysis:

// HYPOTHESIS A: No bound data for the calculated period
//   Evidence: [bound row count for Enero 2024]

// HYPOTHESIS B: Data is bound but engine can't resolve metrics
//   Evidence: [which metrics the engine looks for vs what fields exist in row_data]

// HYPOTHESIS C: Metrics resolve but tier/matrix lookup returns 0
//   Evidence: [actual metric values vs tier boundaries]

// HYPOTHESIS D: Components use legacy path (tierConfig.metric) but data uses new path
//   Evidence: [component types, metric resolution path in code]

// HYPOTHESIS E: The bound 4,340 rows are from wrong sheet/period
//   Evidence: [which sheets the bound rows come from, which period they're in]

// HYPOTHESIS F: data_type mismatch — engine expects specific data_type but committed_data uses different
//   Evidence: [data_types in committed_data vs data_types referenced in input_bindings]

// CONCLUSION: [which hypothesis is correct, with supporting evidence]
```

---

## SECTION 6: REMEDIATION ROADMAP

```typescript
// Based on the root cause, output specific next steps:

// If the problem is binding (entity_id/period_id):
//   - Exactly which rows need binding
//   - What identifier/date field to use
//   - Estimated impact (how many rows would be bound)

// If the problem is metric resolution:
//   - Which metrics can't resolve
//   - What's in the data vs what the engine expects
//   - Whether input_bindings need updating or if the engine needs a code fix

// If the problem is component structure:
//   - What format the components are in vs what the engine reads
//   - Specific fields missing or misnamed

// Output as a NUMBERED ACTION LIST with estimated effort per item
```

---

## IMPLEMENTATION NOTES

### Connection
Use Supabase service role client (same pattern as existing scripts in `web/scripts/`):
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### Tenant Resolution
```typescript
const { data: tenant } = await supabase
  .from('tenants')
  .select('id, name, slug')
  .ilike('slug', '%optica%')
  .limit(1)
  .single();
```

### Output Format
Print to stdout with clear section headers. Use tables where appropriate. Every section header prefixed with `══════` for easy scanning. Example:
```
══════════════════════════════════════════════════
SECTION 1: ENGINE CONTRACT STATUS
══════════════════════════════════════════════════
entity_count:        741
period_count:        4
active_plans:        1
component_count:     6
assignment_count:    741
bound_data_rows:     4,340
orphaned_data_rows:  114,807
══════════════════════════════════════════════════
```

### Error Handling
If any query fails, log the error and continue to next section. Do not abort the entire diagnostic because one query errored.

### Size Limits
For large JSON outputs (like full row_data), truncate to first 500 characters with `[TRUNCATED]` marker. But for the traced entity's component calculations, show EVERYTHING — that's the forensic evidence.

---

## PROOF GATES

| Gate | What It Proves |
|------|----------------|
| PG-01 | Script runs end-to-end without errors |
| PG-02 | All 6 sections produce output |
| PG-03 | Root cause analysis identifies the specific reason for MX$0.00 |
| PG-04 | Remediation roadmap provides actionable next steps |

---

## COMMIT + OUTPUT

1. Commit the script: `CC-UAT-06: Óptica Luminar full diagnostic`
2. Run the script
3. **Paste the ENTIRE output into the completion report** — this IS the completion report
4. Push

The output of this script replaces the need for 20 back-and-forth SQL queries. One run. Complete picture.

---

*"A total tells you what happened. A trace tells you why."*
