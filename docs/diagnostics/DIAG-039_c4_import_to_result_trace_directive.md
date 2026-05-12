# DIAG-039 — c4 Fleet Utilization Import-to-Result Trace

**Branch:** new branch `diag-039-c4-import-to-result-trace` from `main` post-OB-199 merge
**Discipline:** read-only. CC produces verbatim code evidence and verbatim DB values only. No fixes, no proposals, no architectural dispositions. CC does NOT classify the defect locus. Korean Test compliant in all code citations.
**Predecessor:** DIAG-035 (c4 magnitude probe `c4627a56`), DIAG-036 (metric population path `8716618d`), DIAG-037 (comprehension write failure, prior session), DIAG-038 (HF-214 Phase 2 audit `a32fcd48`). DIAG-039 is the missing-aperture diagnostic: end-to-end import→result for c4 with no pre-narrative about where the defect lives.

## Discipline framing

Prior c4 diagnostics scoped narrowly to one surface each. The aggregate effect: no probe had aperture wide enough to detect cross-cutting interactions. DIAG-039 carries no assumption about which function, which line, which transformation produces the empirical c4 = $2 collapse. CC traces the actual data path the code traverses for one (entity, period) on Meridian and surfaces every value at every function boundary. The architect reads where the value collapses; CC does not pre-classify.

## Empirical anchor

| Property | Value |
|---|---|
| Batch totals (pre-wipe AUD-006 §6.3) | $55,909 / $53,559 / $57,534 |
| Ground truth (entity total) | ~MX$185,063 |
| c4 component resolved value | $2 uniformly across all entities × periods |
| Tenant | `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (Meridian) |
| Entity count | 79 |
| Period count | 3 |
| Component | c4 (Fleet Utilization) |

Note: post-OB-199 Phase 5 wipe, `classification_signals` is empty. `committed_data`, `rule_sets`, `calculation_results`, `entities`, `periods`, `entity_period_outcomes` retain pre-wipe state. The next Meridian calculation run will produce fresh values. CC surfaces post-wipe-deploy values; if a fresh calculation has not yet run on this branch, CC notes and architect dispositions whether to trigger one.

---

## Evidence sections — verbatim only, no analysis

### E1 — Calculation entry point and execution graph

CC produces the actual code path a c4 calculation traverses without assuming what's in it.

**E1.1** Locate the calculation entry point:
```bash
grep -rn "POST\|export async function" web/src/app/api/calculation/ --include="*.ts" | head -20
```
Surface every match.

**E1.2** Surface verbatim `web/src/app/api/calculation/run/route.ts` from start of file through end of the POST handler. Do not slice. If the file is >2000 lines, surface in sequential chunks of 500 lines each as separate evidence files (`E1.2.a`, `E1.2.b`, ...). The full handler must be visible.

**E1.3** Within `route.ts`, identify every function call out of the file (any `import` that is invoked inside the POST handler body). Surface verbatim the import statements at the top of `route.ts`. CC produces a list of imported-symbol → source-file for every symbol invoked inside POST.

**E1.4** For each invoked function from E1.3, surface verbatim the full function body from its source file. Do not skip any function that participates in the calculation pipeline. Do not pre-classify which functions are c4-relevant — surface all functions invoked from the POST handler's execution path.

**E1.5** Surface verbatim every site in the full E1.2 + E1.4 set that performs arithmetic (`*`, `/`, `+`, `-`, `Math.*`) on any variable whose name contains `c4`, `fleet`, `utilization`, `component`, `value`, `actual`, `expected`, `rate`, `amount`, `total`, `result`, or that operates on the result of any function call related to component evaluation. Format: `file:line — operation — verbatim line`.

---

### E2 — Component c4 declaration

**E2.1** Discover where components are declared. CC runs the following discovery queries and surfaces verbatim:

```sql
-- a) Database table inventory for anything component-related
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE '%metric%' OR table_name LIKE '%component%' OR table_name LIKE '%derivation%' OR table_name LIKE '%rule%');

-- b) Surface schemas of every table returned by (a) via information_schema.columns
```

**E2.2** For every table from E2.1 that could carry c4's declaration:
```sql
SELECT * FROM <table>
WHERE <columns-that-could-be-name-or-id> ILIKE ANY (ARRAY['%c4%','%fleet%','%utilization%']);
```
Surface every row verbatim.

**E2.3** Locate any TypeScript constant that declares c4:
```bash
grep -rni "c4\|fleet.utilization\|fleet_utilization\|FleetUtilization" web/src/ --include="*.ts"
```
Surface every match with ±15 lines.

**E2.4** From E2.2 and E2.3 evidence, surface the complete declaration of c4: every field, every property, every binding configuration, every intent specifier, every scaling factor, every formula component. **CC produces the full declaration object/row, not selected fields.**

---

### E3 — One-(entity, period) end-to-end value trace

CC picks one (entity_id, period_id) pair on Meridian. Selection: first entity_id alphabetically × earliest period_id chronologically. CC surfaces both IDs verbatim before proceeding.

**E3.1** Surface `committed_data` for this entity × period:
```sql
SELECT * FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND entity_id = '<selected_entity_id>'
  AND (period_id = '<selected_period_id>' OR period_id IS NULL OR source_date IS NULL);
```
Every row verbatim, no column omission.

**E3.2** Identify the `rule_set` active for this Meridian calculation:
```sql
SELECT id, tenant_id, name, input_bindings, output_binding, status, created_at
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY created_at DESC;
```
Surface verbatim. Architect dispositions which rule_set was active for the AUD-006 §6.3 reading if multiple exist.

**E3.3** Surface verbatim the `input_bindings` JSONB for c4 from the active rule_set. Every field of c4's binding entry.

**E3.4** Trigger one calculation run for this (entity, period) — OR — if a recent run exists on this branch post-deploy, surface verbatim from result tables:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE '%result%' OR table_name LIKE '%outcome%' OR table_name LIKE '%payout%');

-- For each table found:
SELECT * FROM <result_table>
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND entity_id = '<selected_entity_id>'
  AND period_id = '<selected_period_id>'
ORDER BY created_at DESC LIMIT 10;
```
Every row verbatim.

**E3.5** If application logs are surfaceable for the calculation run (Vercel logs, Supabase logs, console.log instrumentation already present), surface verbatim every log line emitted during the c4 calculation for this entity × period. CC does not add new instrumentation; surfaces only what already exists.

---

### E4 — Value-at-every-boundary table (load-bearing artifact)

CC produces a single table tracing the c4 value through every function boundary in the actual execution path identified in E1, for the (entity, period) selected in E3.

| Step | Code location (file:line) | Function/block | Input shape and values | Operation (verbatim code) | Output shape and values |
|---|---|---|---|---|---|

Population discipline:
- Step 0: committed_data row from E3.1 — Input "raw row"; Operation "DB read"; Output verbatim row values
- Step 1+: one row per function boundary in execution order, POST entry through final result emission
- Input/Output cells: verbatim runtime values where surfaceable (from existing logs or directly inferable from DB state); `<unrecoverable without runtime trace>` where not
- Operation cell: verbatim code line(s) at that boundary, literal copy not paraphrase
- CC does NOT classify which step produces the collapse to $2

If runtime values are unrecoverable without adding instrumentation, CC adds zero instrumentation. CC marks cells unrecoverable and architect dispositions whether to authorize one targeted log statement in a subsequent DIAG iteration.

---

### E5 — Arithmetic site inventory

From E1.5:

| File:line | Variables | Operator | Verbatim line |
|---|---|---|---|

Every arithmetic site touching c4-relevant variables on the execution path. Architect compares against E4 to determine which sites are on the actual c4 path and which are dormant.

---

### E6 — Schema cross-reference

**E6.1** Verbatim `information_schema.columns` for every table E2/E3/E4 reads from.

**E6.2** Foreign-key relationships:
```sql
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('committed_data', 'rule_sets', 'entities', 'periods', '<other tables from E2/E3/E4>');
```

---

## Halt conditions

CC halts and surfaces evidence-of-halt rather than fabricating when:

- Any discovery query returns 0 rows where >0 was expected — surface the empty result + the verbatim query, do not retry with assumed alternatives
- A function in E1.4 cannot be resolved — surface the import statement + the resolution failure
- A table in E2.1/E2.2 has a column that wasn't anticipated — surface the actual schema, do not coerce to assumed
- The c4 declaration in E2.4 does not include `calculationIntent`, `input_bindings`, or any field the session handoff narrative referenced — surface the actual declaration verbatim
- The execution path in E1 does not pass through `route.ts:1793` or `:1798` for c4 — surface what path it does pass through
- The selected `(entity, period)` has no `committed_data` rows — surface the empty result, CC picks the next pair and notes the substitution
- Runtime values at E4 are universally unrecoverable from existing logs and DB state alone — surface the unrecoverable-cell pattern, architect dispositions whether to authorize one instrumentation statement in DIAG-039.1

CC executes mechanically against these halt conditions. CC does not guess past a halt.

---

## Output

Single artifact at `docs/diagnostics/DIAG-039_c4_import_to_result_trace.md` containing E1–E6 verbatim evidence. Companion evidence files for any section that exceeds 500 lines (`E1.2.a.md`, `E1.4.a.md`, etc.) under `docs/diagnostics/DIAG-039_evidence/`.

Commit message: `DIAG-039: c4 Fleet Utilization import-to-result trace (read-only)`.

PR opens against `main` with title `DIAG-039: c4 import-to-result trace (read-only)`.

**Architect reads E4 transformation table.** The step where the value collapses to $2 is structurally visible in the Output column. The architect then dispositions HF-216 scope from code evidence. CC does not propose a fix from DIAG-039.
