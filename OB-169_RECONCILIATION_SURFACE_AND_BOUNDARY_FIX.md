# OB-169: RECONCILIATION SURFACE + BOUNDARY FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference for every Supabase query
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md` — the 10-gate checklist applies to every phase

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS OB EXISTS

Patricia Zambrano (BCL tenant admin) completed the full browser journey: import plan → import data → calculate. The engine produced **$44,530** against a ground truth of **$44,590**. That's 99.87% — and 99.87% is NOT 100%. $60 wrong is $60 wrong.

The $60 delta has been traced to a C1 Credit Placement matrix boundary resolution for ONE entity. The AI-extracted boundaries use `.999` as an approximation for exclusive upper bounds:

```json
{"max": 79.999, "min": 70, "maxInclusive": true, "minInclusive": true}
```

When an entity's metric falls exactly at a boundary (e.g., 80.0%), the `.999` approximation resolves to the wrong cell.

Two things must happen in this OB as a single vertical slice:

1. **Fix the boundary representation** — the engine must use true exclusive comparison, not `.999` approximation
2. **Build the reconciliation surface** — Patricia uploads her GT file, the platform compares per-entity per-component, and renders findings with intelligence explaining the root cause

The vertical slice test: Patricia uploads `BCL_Resultados_Esperados.xlsx` → platform compares → shows 85/85 exact match → $44,590 → 100.00%.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
7. **Domain-agnostic always.** The reconciliation surface works for any domain, not just ICM.
8. **Reconciliation canonical route: `/operate/reconciliation`** (Standing Rule 24 from HF-058).
9. **Zero data-modifying SQL in production verification.** Every verification step is read-only.
10. **100% reconciliation is the ONLY gate.** Any non-exact result is wrong, not "close." (FP-75)

---

## CRITICAL CONTEXT

### BCL Tenant
- Tenant ID: `b1c2d3e4-aaaa-bbbb-cccc-111111111111`
- 85 entities: 13 Ejecutivo Senior, 72 Ejecutivo
- 6 periods: October 2025 – March 2026
- 4 components: C1 (2D matrix), C2 (1D tier), C3 (scalar multiply), C4 (conditional gate)
- October 2025 GT: **$44,590**
- Platform current result: **$44,530** ($60 delta)

### BCL GT File Structure (BCL_Resultados_Esperados.xlsx)

**Sheet 1: "Detalle por Entidad"** — 512 rows (85 entities × 6 periods + header)

| Column | Header | Example |
|--------|--------|---------|
| A | ID_Empleado | BCL-5001 |
| B | Nombre | Adriana Reyes Molina |
| C | Nivel | Ejecutivo Senior |
| D | Periodo | 2025-10-01 |
| E | C1_Raw | 180 |
| F | C1_Redondeado | 180 |
| G | C2_Raw | 400 |
| H | C2_Redondeado | 400 |
| I | C3_Raw | 250 |
| J | C3_Redondeado | 250 |
| K | C4_Raw | 150 |
| L | C4_Redondeado | 150 |
| M | Total_Redondeado | 980 |

**Sheet 2: "Resumen"** — summary totals

### Verification Anchors (October 2025)

| Entity | ID | Variant | C1 | C2 | C3 | C4 | Total |
|--------|-----|---------|-----|-----|-----|-----|-------|
| Valentina Salazar | BCL-5012 | Ejecutivo | $80 | $0 | $18 | $100 | **$198** |
| Gabriela Vascones | BCL-5003 | Ejecutivo Senior | $600 | $400 | $250 | $150 | **$1,400** |
| Fernando Hidalgo | BCL-5002 | Ejecutivo Senior | $80 | $0 | $150 | $0 | **$230** |

### Existing Schema

`reconciliation_sessions` table EXISTS in production:

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| tenant_id | uuid | NO | |
| period_id | uuid | YES | |
| batch_id | uuid | YES | |
| status | text | NO | pending |
| config | jsonb | NO | |
| results | jsonb | NO | |
| summary | jsonb | NO | |
| created_by | uuid | YES | |
| created_at | timestamptz | NO | now() |
| completed_at | timestamptz | YES | |

### Existing Routes & Capabilities

- Canonical route: `/operate/reconciliation` (Standing Rule 24)
- The `/operate/reconciliation/page.tsx` may or may not exist — check and create/update as needed
- OB-168 established `permissions.ts` as single source of truth for capabilities
- The `RequireCapability` middleware gates access

### Key Schema References (from SCHEMA_REFERENCE_LIVE.md)

- `calculation_results`: `id`, `tenant_id`, `batch_id`, `entity_id`, `rule_set_id`, `period_id`, `total_payout` (numeric), `components` (jsonb), `metrics` (jsonb), `attainment` (jsonb), `metadata` (jsonb)
- `entities`: `id`, `tenant_id`, `external_id`, `display_name`, `metadata` (jsonb)
- `calculation_batches`: `id`, `tenant_id`, `period_id`, `lifecycle_state`, `entity_count`, `summary` (jsonb)
- `periods`: `id`, `tenant_id`, `label`, `canonical_key`, `start_date`, `end_date`

---

## PHASE 0: DIAGNOSTIC — TRACE THE $60 (Zero Code Changes)

**This phase produces ZERO code changes. Diagnosis only.**

### 0A: Identify the Entity with the $60 Delta

Run this query in the Supabase SQL editor against BCL tenant. Paste the FULL output.

```sql
-- Get the latest calculation batch for BCL October 2025
WITH bcl_tenant AS (
  SELECT id FROM tenants WHERE id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
),
oct_period AS (
  SELECT p.id FROM periods p, bcl_tenant t
  WHERE p.tenant_id = t.id
  AND p.start_date = '2025-10-01'
  LIMIT 1
),
latest_batch AS (
  SELECT cb.id FROM calculation_batches cb, bcl_tenant t, oct_period op
  WHERE cb.tenant_id = t.id
  AND cb.period_id = op.id
  ORDER BY cb.created_at DESC
  LIMIT 1
)
SELECT
  e.external_id,
  e.display_name,
  cr.total_payout,
  cr.components,
  cr.attainment
FROM calculation_results cr
JOIN entities e ON cr.entity_id = e.id
JOIN latest_batch lb ON cr.batch_id = lb.id
ORDER BY e.external_id;
```

### 0B: Identify Which Entity Has the C1 Delta

From the query results, compare each entity's component values against the GT file anchors. The entity with a C1 difference of exactly $60 is the boundary case.

Check specifically:
- Which entity's C1 value differs from GT by $60?
- What attainment/metric values does that entity have for C1?
- What matrix cell did the engine assign?
- What matrix cell should it have been?

### 0C: Examine the Rule Set Boundary Representation

```sql
-- Get the active rule_set components for BCL
SELECT
  rs.id,
  rs.name,
  rs.status,
  rs.components
FROM rule_sets rs
WHERE rs.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND rs.status = 'active'
ORDER BY rs.created_at DESC
LIMIT 1;
```

Paste the `components` JSONB. Find the C1 matrix definition. Identify the boundary representation — specifically, look for `.999` values in `max` fields.

### 0D: Confirm the Root Cause

Document in the completion report:
1. **Which entity** — external_id, display_name
2. **Which component** — C1
3. **Engine value** vs **GT value** — the $60 delta
4. **Engine attainment** — what metric value produced the wrong cell
5. **Boundary representation** — the `.999` max value that caused the misresolution
6. **Correct cell** — what value the GT expects
7. **Root cause** — `.999` approximation places the entity in Band N when it should be Band N+1

**Commit:** `git add -A && git commit -m "OB-169 Phase 0: Diagnostic — $60 delta traced to exact entity" && git push origin dev`

---

## PHASE 1: FIX BOUNDARY REPRESENTATION IN CALCULATION ENGINE (Code Change)

### Architecture Decision

**Problem:** AI-extracted plan boundaries use `.999` as a proxy for exclusive upper bounds (e.g., `max: 79.999` instead of `max: 80, exclusive: true`). This causes boundary misresolution when an entity's metric falls exactly at a tier/matrix boundary.

**Decision:** The calculation engine's band/tier/matrix resolution logic must treat boundary comparisons correctly regardless of how the AI represented them.

Two approaches:

**Option A: Fix at resolution time (engine change)**
- The engine's band resolution function checks if `max` ends in `.999` and treats it as `< ceil(max)` instead of `<= max`
- Minimal change, surgical
- Risk: other `.999` values that are genuine (unlikely in financial contexts)

**Option B: Fix at AI extraction time (SCI change)**
- The SCI plan interpreter outputs `{ max: 80, maxInclusive: false }` instead of `{ max: 79.999, maxInclusive: true }`
- Cleaner representation
- Risk: requires re-import of plan (reimport blocked by storage RLS issues)

**Choose Option A.** It fixes the problem for all existing rule_sets without re-import. The engine becomes resilient to `.999` approximations. Future plan imports will also benefit.

### Implementation

1. **Find the band/tier/matrix resolution function.** This is the function that takes an entity's metric value and resolves it to a matrix cell or tier band. It will be in the calculation engine — likely in a file like `calculation-engine.ts`, `evaluators/`, or similar.

2. **Identify the comparison logic.** Look for code that does:
   ```
   value >= band.min && value <= band.max
   ```
   or similar inclusive comparison.

3. **Fix the boundary resolution.** The fix must handle this case:
   - If `band.max` has a fractional part within 0.01 of an integer (e.g., 79.999, 89.999), treat the comparison as `value < Math.ceil(band.max)` instead of `value <= band.max`.
   - Alternatively, if `maxInclusive` is present and `false`, use strict less-than.
   - The fix should be in ONE place — the band resolution utility function, not scattered across evaluators.

4. **Verify the fix works for BCL.** After fixing, the entity identified in Phase 0 should resolve to the correct cell, producing a $60 increase that closes the delta.

### Anti-Pattern Check
- **FP-69 (Fix one, leave others):** The fix must be in the shared band resolution function, not in a C1-specific path. All component types (matrix_lookup, tier_lookup) that use band resolution must benefit.
- **FP-21 (Dual code path):** There must be ONE band resolution function, not separate implementations per evaluator.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Band resolution function identified | File path and function name documented |
| PG-2 | `.999` handling added | Code change pasted in completion report |
| PG-3 | Change is in ONE shared location | grep confirms no duplicate resolution logic |
| PG-4 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-169 Phase 1: Fix boundary resolution — .999 to true exclusive" && git push origin dev`

---

## PHASE 2: RECALCULATE BCL AND VERIFY $44,590

### 2A: Trigger Recalculation

In the browser as Patricia (BCL admin):
1. Navigate to `/operate/calculate`
2. Select October 2025 period
3. Click Calculate
4. Wait for completion

### 2B: Verify Result

The calculate page should now show **$44,590** (not $44,530).

If it does NOT show $44,590:
- Run the Phase 0 query again
- Identify which entity still has a delta
- The fix was incomplete — diagnose further before proceeding

### 2C: Verify Anchors

Confirm the three verification anchor entities:

| Entity | Expected Total | Actual Total | Match? |
|--------|---------------|-------------|--------|
| Valentina Salazar (BCL-5012) | $198 | ? | |
| Gabriela Vascones (BCL-5003) | $1,400 | ? | |
| Fernando Hidalgo (BCL-5002) | $230 | ? | |

```sql
-- Verification query (READ ONLY)
WITH bcl_tenant AS (
  SELECT id FROM tenants WHERE id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
),
oct_period AS (
  SELECT p.id FROM periods p, bcl_tenant t
  WHERE p.tenant_id = t.id AND p.start_date = '2025-10-01' LIMIT 1
),
latest_batch AS (
  SELECT cb.id FROM calculation_batches cb, bcl_tenant t, oct_period op
  WHERE cb.tenant_id = t.id AND cb.period_id = op.id
  ORDER BY cb.created_at DESC LIMIT 1
)
SELECT e.external_id, e.display_name, cr.total_payout
FROM calculation_results cr
JOIN entities e ON cr.entity_id = e.id
JOIN latest_batch lb ON cr.batch_id = lb.id
WHERE e.external_id IN ('BCL-5012', 'BCL-5003', 'BCL-5002')
ORDER BY e.external_id;
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-5 | BCL October total = $44,590 | Screenshot or SQL result showing exact match |
| PG-6 | Valentina Salazar = $198 | SQL result |
| PG-7 | Gabriela Vascones = $1,400 | SQL result |
| PG-8 | Fernando Hidalgo = $230 | SQL result |
| PG-9 | Zero entities with C1 delta vs GT | All 85 entities match |

**Commit:** `git add -A && git commit -m "OB-169 Phase 2: BCL October verified at $44,590 — 100% reconciliation" && git push origin dev`

---

## PHASE 3: RECONCILIATION API — COMPARISON ENGINE

### 3A: API Route

Create `web/src/app/api/reconciliation/compare/route.ts`

**POST /api/reconciliation/compare**

Accepts: `multipart/form-data` with:
- `file` — the GT XLSX file
- `batchId` — the calculation batch to compare against
- `periodFilter` — (optional) ISO date string to filter GT rows to a specific period

Process:
1. Parse the uploaded XLSX using SheetJS (already in project dependencies — verify with `grep -r "xlsx" web/package.json`)
2. Auto-detect the structure:
   - Find entity ID column (structural: first column with unique alphanumeric codes like "BCL-5001")
   - Find period column (structural: column with date-like values)
   - Find numeric columns (structural: columns with consistent numeric values)
   - Find total column (structural: numeric column where value ≈ sum of other numeric columns in same row)
   - Find component columns (structural: numeric columns that are NOT the total)
3. If `periodFilter` provided, filter GT rows to matching period
4. Load `calculation_results` for the given `batchId` with entity external_ids
5. Match entities: GT `entity_id_column` ↔ `entities.external_id`
6. Compare per-entity:
   - Total payout: `calculation_results.total_payout` vs GT total column
   - Per-component: `calculation_results.components` JSONB values vs GT component columns
7. Generate findings (see 3C)
8. Store session in `reconciliation_sessions`
9. Return comparison results

### 3B: Entity Matching

```typescript
// Structural matching — Korean Test compliant
// Normalize both sides: trim whitespace, case-insensitive, strip leading zeros
function normalizeEntityId(id: string): string {
  return id.trim().toLowerCase().replace(/^0+/, '');
}
```

Match GT entity IDs against `entities.external_id`. Track:
- Matched entities (both sides have the ID)
- Platform-only entities (in calculation_results but not GT)
- GT-only entities (in GT but not calculation_results)

### 3C: Finding Generation

Generate findings from comparison results. Each finding:

```typescript
interface ReconciliationFinding {
  severity: 'exact' | 'info' | 'warning' | 'critical';
  category: 'total_match' | 'component_delta' | 'boundary' | 'population' | 'false_green';
  title: string;
  description: string;
  impact_amount: number;
  entity_count: number;
  affected_entities: string[]; // external_ids
}
```

Finding patterns to detect:
1. **Exact match** — all entities, all components match. Severity: exact.
2. **Component delta** — specific component has consistent delta across entities. Severity: warning/critical based on magnitude.
3. **Boundary clustering** — deltas concentrate near tier/matrix thresholds. Severity: warning.
4. **Population mismatch** — entities in one dataset but not the other. Severity: info.
5. **False green** — total matches but components don't. Severity: critical.

### 3D: Store Session

```typescript
// Store in reconciliation_sessions (table already exists)
const session = {
  tenant_id: tenantId,
  period_id: periodId,
  batch_id: batchId,
  status: 'completed',
  config: {
    filename: file.name,
    period_filter: periodFilter,
    entity_column_index: detectedEntityCol,
    total_column_index: detectedTotalCol,
    component_column_indices: detectedComponentCols,
    period_column_index: detectedPeriodCol,
  },
  results: {
    entity_comparisons: entityResults, // per-entity per-component
    findings: findings,
  },
  summary: {
    total_entities: matchedCount,
    exact_matches: exactCount,
    delta_entities: deltaCount,
    platform_total: platformTotal,
    gt_total: gtTotal,
    delta: platformTotal - gtTotal,
    match_percent: (exactCount / matchedCount * 100).toFixed(2),
    platform_only: platformOnlyCount,
    gt_only: gtOnlyCount,
  },
  created_by: profileId,
  completed_at: new Date().toISOString(),
};
```

### Korean Test Verification
- The XLSX parser discovers column semantics structurally (data types, patterns), NOT by header text
- Entity matching is by external_id pattern, NOT by name
- Component matching is by column position relative to total, NOT by header name
- Period matching is by date parsing, NOT by label text

### Anti-Pattern Check
- **FP-67 (Dashboard not intelligence):** The findings include root cause, impact amount, affected entities, and recommended action — not just match/no-match.
- **FP-66 (Seeding instead of importing):** The GT file is parsed at comparison time, never stored in committed_data.
- **FP-73 (Backend fix, frontend not updated):** This phase is API only. Phase 4 builds the frontend.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-10 | API route exists and builds | `npm run build` exits 0 |
| PG-11 | XLSX parsing works | Test with BCL_Resultados_Esperados.xlsx structure |
| PG-12 | Entity matching by external_id | Structural, not name-based |
| PG-13 | Per-component comparison | Components JSONB parsed correctly |
| PG-14 | Findings generated | At least 1 finding (exact match) for BCL after boundary fix |
| PG-15 | Session stored | INSERT into reconciliation_sessions succeeds |

**Commit:** `git add -A && git commit -m "OB-169 Phase 3: Reconciliation comparison API — entity matching + findings" && git push origin dev`

---

## PHASE 4: RECONCILIATION UI — THE SURFACE

### Route: `/operate/reconciliation`

This is the canonical reconciliation surface (Standing Rule 24). It is NOT a dashboard (FP-67). It is an intelligence surface that answers: "Does the platform match the ground truth, and if not, why?"

### 4A: Page Structure

The page has two states:

**State 1: Upload** — No active reconciliation session
- File upload dropzone (drag & drop or click to browse)
- Period selector (dropdown of tenant's periods with calculation batches)
- "Compare" button (disabled until file uploaded and period selected)

**State 2: Results** — After comparison completes

```
RECONCILIATION — [Period Label]
[Tenant Name] · [Entity Count] Entities · [Component Count] Components

━━━ EXECUTIVE SUMMARY ━━━

Overall Match:  [XX.XX%]
Exact Entities: [N/N]
Platform Total: [$XXX,XXX]
GT Total:       [$XXX,XXX]
Delta:          [$XX]

━━━ COMPONENT STATUS ━━━

[For each component:]
✅ Component Name   $X,XXX = $X,XXX     0.0%     [N/N exact]
   — or —
⚠️ Component Name   $X,XXX vs $X,XXX   +X.X%    [N/N exact]

━━━ FINDINGS ━━━

[Priority-ordered findings with severity icon, title, description, impact]

━━━ ENTITY DETAIL ━━━

[Sortable table: Entity ID | Name | Variant | Platform Total | GT Total | Delta | Status]
[Click to expand: per-component breakdown for any entity]
```

### 4B: Component Status Intelligence

For each component, show:
- Engine total vs GT total
- Delta (absolute and %)
- Entity match count
- Status icon: ✅ (100% match), ⚠️ (delta exists), ❌ (large delta)

### 4C: Entity Detail Table

Sortable, filterable table with ALL entities:
- Default sort: delta descending (largest discrepancies first)
- Filter: by variant, by status (exact/delta/platform-only/gt-only)
- Click to expand any row → shows per-component platform vs GT values

### 4D: Findings Panel

Each finding renders as a card:
```
[severity icon] [title]
[description with specific entities and values]
Impact: $[amount] across [N] entities
```

### 4E: Navigation & Capability

- Add `/operate/reconciliation` to the capability map in `permissions.ts`
- The capability `can_reconcile` (or closest existing equivalent) gates access
- Sidebar should show "Reconciliation" under Operate workspace if it doesn't already
- If a capability doesn't exist yet for reconciliation, add one: `operate:reconcile` following the namespace pattern from OB-168

### Design Principles
- **IAP Gate:** Intelligence (findings explain why), Acceleration (one click from upload to results), Performance (exact entity-level proof)
- **Thermostat, not thermometer:** Findings recommend action, not just report numbers
- **Action Proximity:** "Compare" button is right next to file upload. Entity detail is one click from summary.

### Anti-Pattern Check
- **FP-67 (Dashboard not intelligence):** Every number has context. Every delta has an explanation. Every finding has a recommended action.
- **FP-72 (Sidebar ≠ button):** Both entry points work — sidebar nav AND lifecycle progression from Calculate results.
- **FP-73 (Backend fix, frontend not updated):** This phase wires the Phase 3 API to the rendered UI.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-16 | `/operate/reconciliation` renders | No crash, no Access Restricted |
| PG-17 | File upload works | XLSX file accepted via drag-drop or file picker |
| PG-18 | Period selector populated | Shows BCL periods with calculation batches |
| PG-19 | Comparison triggers on button click | Loading state → results render |
| PG-20 | Executive summary shows correct totals | Platform vs GT with delta and match % |
| PG-21 | Component status shows all 4 BCL components | With per-component delta |
| PG-22 | Entity detail table renders 85 rows | Sortable, filterable |
| PG-23 | Click-to-expand shows per-component values | Engine vs GT per component |
| PG-24 | Findings render | At least 1 finding card visible |

**Commit:** `git add -A && git commit -m "OB-169 Phase 4: Reconciliation UI — upload, compare, results surface" && git push origin dev`

---

## PHASE 5: BROWSER VERIFICATION (CLT-169)

### The Vertical Slice Test

As Patricia (BCL admin), in the browser:

1. **Navigate to `/operate/reconciliation`** — page renders, no Access Restricted
2. **Upload BCL_Resultados_Esperados.xlsx** — file accepted
3. **Select October 2025 period** — dropdown shows it
4. **Click Compare** — comparison runs, results render
5. **Verify executive summary:**
   - Overall Match: 100.00%
   - Exact Entities: 85/85
   - Platform Total: $44,590
   - GT Total: $44,590
   - Delta: $0
6. **Verify component status:** All 4 components show ✅ with $0 delta
7. **Verify entity detail:** All 85 entities show exact match
8. **Verify findings:** "Exact match" finding — all entities, all components match

### Fallback: If Match is NOT 100%

If any entity still shows a delta:
1. Identify the entity and component from the entity detail table
2. Check if the boundary fix from Phase 1 covered this case
3. Do NOT proceed to Phase 6 — fix the delta first
4. 100% is the ONLY gate

### Screenshot Evidence Required

Take screenshots of:
1. The reconciliation page with executive summary visible
2. The component status section
3. The entity detail table (first page showing all matches)

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-25 | Page renders for Patricia | No crash, correct tenant context |
| PG-26 | File upload and comparison completes | No errors in console |
| PG-27 | Overall match = 100.00% | Exact text in executive summary |
| PG-28 | All 85 entities exact | Zero delta entities |
| PG-29 | All 4 components match | Each component shows ✅ |
| PG-30 | Session stored in Supabase | SELECT from reconciliation_sessions shows the session |

**Commit:** `git add -A && git commit -m "OB-169 Phase 5: CLT-169 browser verification — 100% reconciliation" && git push origin dev`

---

## PHASE 6: MERIDIAN REGRESSION CHECK

After ALL BCL work is complete and verified, confirm Meridian still produces correct results.

### 6A: Browser Verification

As Meridian admin, navigate to Intelligence page. Confirm:
- Total payout: **MX$185,063**
- Entity count: 67
- Component count: 5

### 6B: If Meridian Shows Different Number

- The boundary fix from Phase 1 may have affected Meridian's calculations
- Check if any Meridian entities fall at tier boundaries
- If Meridian total changed, compare new total against Meridian GT to determine if it's now MORE correct or LESS correct
- Document the difference in the completion report

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-31 | Meridian renders | Intelligence page loads |
| PG-32 | MX$185,063 confirmed OR change documented | No silent regression |

**Commit:** `git add -A && git commit -m "OB-169 Phase 6: Meridian regression verified" && git push origin dev`

---

## PHASE 7: COMPLETION REPORT + PR

### 7A: Completion Report

Create `OB-169_COMPLETION_REPORT.md` at project root with:

```markdown
# OB-169: Reconciliation Surface + Boundary Fix — Completion Report

## Status: [COMPLETE / PARTIAL / FAILED]

## Phase 0: Diagnostic
- Entity with $60 delta: [external_id, display_name]
- Component: C1
- Engine value: $[X] vs GT value: $[Y]
- Root cause: [boundary representation description]
- Attainment value: [exact metric that caused misresolution]

## Phase 1: Boundary Fix
- File changed: [path]
- Function changed: [name]
- Before: [comparison logic]
- After: [comparison logic]
- Build: [exit code]

## Phase 2: Recalculation
- BCL October total: $[amount] (expected: $44,590)
- Valentina Salazar: $[amount] (expected: $198)
- Gabriela Vascones: $[amount] (expected: $1,400)
- Fernando Hidalgo: $[amount] (expected: $230)
- 100% match: [YES/NO]

## Phase 3: Comparison API
- Route: /api/reconciliation/compare
- XLSX parsing: [WORKING/BROKEN]
- Entity matching: [N/N matched]
- Finding generation: [N findings]
- Session storage: [WORKING/BROKEN]

## Phase 4: Reconciliation UI
- Route renders: [YES/NO]
- File upload: [WORKING/BROKEN]
- Period selector: [WORKING/BROKEN]
- Results display: [WORKING/BROKEN]

## Phase 5: CLT-169
- Overall match: [XX.XX%]
- Exact entities: [N/N]
- Component status: [all match / some delta]
- Session stored: [YES/NO]

## Phase 6: Meridian
- Total: MX$[amount] (expected: MX$185,063)
- Status: [CONFIRMED / CHANGED — explanation]

## Proof Gates Summary
[PG-1 through PG-32: PASS/FAIL for each]
```

### 7B: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-169: Reconciliation Surface + Boundary Fix — BCL 100% Reconciliation" \
  --body "## What This Delivers

### Boundary Fix
- Fixed .999 approximation in band/tier resolution
- BCL October: \$44,590 exact match against ground truth

### Reconciliation Surface
- /operate/reconciliation — dedicated route for GT comparison
- XLSX upload → auto-detect structure → per-entity per-component comparison
- Findings with intelligence: root cause, impact, affected entities
- Stored sessions in reconciliation_sessions table

### Proof
- 85/85 entities exact match
- All 4 components exact match
- 100.00% reconciliation
- Meridian regression: MX\$185,063 confirmed

## Proof Gates: see OB-169_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "OB-169 Phase 7: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

After merging PR to main and Vercel deploys:

### Step 1: Verify BCL Reconciliation in Production
1. Login as Patricia (BCL admin) at vialuce.ai
2. Navigate to `/operate/reconciliation`
3. Upload `BCL_Resultados_Esperados.xlsx`
4. Select October 2025
5. Click Compare
6. Confirm: 100.00% match, 85/85 exact, $44,590 = $44,590

### Step 2: Verify BCL Calculation in Production
1. Navigate to `/operate/calculate`
2. Select October 2025
3. Confirm total shows $44,590

### Step 3: Verify Meridian in Production
1. Switch to Meridian tenant
2. Navigate to Intelligence
3. Confirm MX$185,063

### Step 4: Verify Session Storage (READ ONLY)
```sql
-- Read-only verification
SELECT id, tenant_id, status, summary, created_at
FROM reconciliation_sessions
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY created_at DESC
LIMIT 1;
```

**ZERO data-modifying SQL in these steps.** If any step fails, the OB is incomplete — do NOT manually fix with SQL.

---

## WHAT SUCCESS LOOKS LIKE

Patricia uploads her ground truth file. The platform compares. Every entity matches. Every component matches. The reconciliation surface shows 100.00% with zero findings. The platform has proven its own accuracy — not through SQL queries in the console, but through an intelligence surface that Patricia can see and trust.

This is the first tenant where the full journey is proven end-to-end through the browser: import plan → import data → calculate → reconcile → 100%.

---

*OB-169 — March 14, 2026*
*"$60 wrong is $60 wrong. The engine works. Now the platform proves it."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
