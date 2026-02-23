# OB-85 CONTINUATION: PIPELINE PROOF — ZERO TO PAYOUT
## The Calculation Produced 719 Entities × MX$0.00. Fix It.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `OB-85_COMPLETION_REPORT.md` — what was built, what's broken
4. `OB-75_COMPLETION_REPORT.md` — the PROVEN calculation that works (100.7% accuracy)
5. `OB-74_ENGINE_VALIDATION_CLEAN_TENANT.md` — engine validation approach

**Read all five before writing any code.**

---

## WHAT HAPPENED

Andrew ran the full OB-85 pipeline test:

1. ✅ Imported data through browser — 7 sheets, 119,129 records, Import ID #62df8440
2. ✅ Navigated to Calculate → selected January 2024 → clicked "Run Calculation"
3. ❌ **Result: 719 entities found, every single payout is MX$0.00**
4. ❌ Employee IDs display as UUIDs, not external IDs (96568046)
5. ❌ Employee names display as UUIDs, not actual names
6. ❌ Components column is empty — no component breakdown
7. ❌ Reconciliation cannot be tested because there's nothing to reconcile against

**The engine found the entities but could not calculate any compensation.** This is not a display bug — the calculation_results in the database contain MX$0.00 per entity.

---

## THE ROOT CAUSE HYPOTHESIS

The calculation engine that was proven in OB-75 (100.7% accuracy, 719 employees, $1.2M total) worked because the data was structured with known field mappings. The fresh import pipeline puts data into committed_data but **the calculation engine cannot resolve which fields map to which component metrics.**

The bridge between import and calculation is broken. Specifically:

1. **Import writes raw data to committed_data** — ✅ confirmed working (119K records)
2. **Import creates entities** — ✅ confirmed (719 entities found)
3. **Import creates periods** — ✅ confirmed (January 2024 appeared in selector)
4. **Import produces field_mappings** — ❓ UNKNOWN — are these persisted to Supabase?
5. **Calculation engine reads field_mappings** — ❓ UNKNOWN — does it know which committed_data column is "attainment" for which component?
6. **Calculation engine resolves component metrics** — ❌ FAILED — all payouts are $0

---

## PHASE 0: DIAGNOSE THE EXACT FAILURE

### 0A: What does the calculation engine receive?

```bash
echo "=== CALCULATION ENGINE: WHAT DOES IT READ? ==="

echo ""
echo "--- Entry point ---"
find web/src -path "*calculat*" -name "route.ts" | head -5
for f in $(find web/src -path "*api*calculat*run*" -name "route.ts" | head -2); do
  echo "--- $f (first 80 lines) ---"
  head -80 "$f"
done

echo ""
echo "--- How does the engine get data for an entity? ---"
grep -rn "committed_data\|from('committed_data')" web/src/lib/ --include="*.ts" | head -20

echo ""
echo "--- How does the engine resolve metrics per component? ---"
grep -rn "component\|metric\|attainment\|goal\|amount\|payout" web/src/lib/calculation/ --include="*.ts" | head -30

echo ""
echo "--- Does the engine read field_mappings from anywhere? ---"
grep -rn "field_mapping\|fieldMapping\|semanticType\|import_batch\|import_context\|ai_import" web/src/lib/calculation/ web/src/lib/orchestration/ --include="*.ts" | head -20

echo ""
echo "--- Does the engine read from import_batches table? ---"
grep -rn "import_batch" web/src/lib/calculation/ web/src/lib/orchestration/ --include="*.ts" | head -10
```

### 0B: What's in the database after the import?

Run these in Supabase SQL Editor and **PASTE THE OUTPUT**:

```sql
-- 1. How many committed_data rows for January 2024?
SELECT COUNT(*), period_id 
FROM committed_data 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
GROUP BY period_id;

-- 2. What does a sample committed_data row look like?
SELECT id, raw_data, sheet_name, period_id, created_at
FROM committed_data 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
LIMIT 3;

-- 3. Are field_mappings stored in Supabase?
SELECT * FROM import_batches 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC LIMIT 3;

-- 4. Is there a field_mappings table?
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%mapping%' OR table_name LIKE '%field%' OR table_name LIKE '%import%';

-- 5. What do the entities look like?
SELECT id, external_id, display_name, entity_type, metadata
FROM entities 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
LIMIT 5;

-- 6. What does the calculation_results row look like for the $0 batch?
SELECT cr.entity_id, cr.total_payout, cr.component_results, cr.metadata,
       e.external_id, e.display_name
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  AND lifecycle_state = 'PREVIEW'
  ORDER BY created_at DESC LIMIT 1
)
LIMIT 5;

-- 7. What does the rule_set (plan) look like?
SELECT id, name, status, components, metadata
FROM rule_sets
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
LIMIT 3;

-- 8. How was the OB-75 calculation different? What data did it use?
SELECT id, lifecycle_state, entity_count, created_at,
       (SELECT SUM(total_payout) FROM calculation_results WHERE batch_id = cb.id) as total
FROM calculation_batches cb
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at;
```

**CRITICAL: Paste ALL 8 query results before writing any code.** The diagnosis determines the fix. Do not guess.

### 0C: Compare the working OB-75 path vs. the broken OB-85 path

After pasting the SQL results, answer these questions in the completion report:

1. **Data path:** How did OB-75's calculation get component metrics (attainment, goal, amount) for each entity? Where did it read them from?
2. **Current path:** How does the current calculation engine try to get the same metrics? What table/column does it query?
3. **The gap:** What's missing between "committed_data has raw JSON rows" and "engine can extract attainment=0.975 for entity 96568046 for component Base_Venta_Individual"?

**Commit:** `OB-85-cont Phase 0: Diagnostic — why 719 entities × $0`

---

## MISSION 1: FIX THE DATA BRIDGE — IMPORT → CALCULATION

Based on the diagnostic, fix the bridge between import and calculation. The specific fix depends on what Phase 0 reveals, but it will be ONE of these patterns:

### Pattern A: Field mappings not persisted to Supabase
**If** import_batches or field_mappings table doesn't have the AI classifications:
- Ensure the import flow writes field_mapping metadata to Supabase (not just localStorage)
- Each import_batch record must include: which sheet → which component, which column → which semantic type
- The calculation engine reads this metadata to know: "for entity X, look in committed_data where sheet_name='Base_Venta_Individual', extract the 'Cumplimiento' field as attainment"

### Pattern B: Field mappings exist but engine doesn't read them
**If** import_batches has field_mapping data but the calculation engine ignores it:
- Wire the calculation engine to read import_batch field_mappings
- For each component in the rule_set, find the corresponding sheet via component assignment
- For each entity, extract the metric values using the field mapping (sourceColumn → semanticType)

### Pattern C: Aggregation step missing
**If** committed_data has individual rows but the engine expects pre-aggregated entity data:
- The import pipeline must aggregate: raw rows → per-entity, per-component metric summaries
- This is the step that produces: "Entity 96568046, Component Base_Venta_Individual: attainment=0.975, goal=50000, amount=48750"
- The calculation engine then reads these aggregated records

### Pattern D: Entity-to-data linkage missing
**If** entities exist but there's no link between entity.id and committed_data rows:
- committed_data rows need entity_id foreign keys, OR
- The engine must join on external_id (e.g., committed_data.raw_data->>'num_empleado' = entities.external_id)

### Implementation Requirements (regardless of pattern):

1. **Carry Everything:** All columns remain in committed_data.raw_data. The fix adds a resolution layer ON TOP, not a filter.
2. **Korean Test:** The resolution must work by semantic type ('attainment', 'goal', 'amount'), not by column name ('Cumplimiento', 'Meta_Individual'). A Korean tenant with Hangul column names must work identically.
3. **No hardcoded field names.** Zero instances of 'num_empleado', 'Cumplimiento', 'Venta_Individual' in the calculation path.
4. **The OB-75 proven engine stays.** Do not rewrite the calculation engine. Fix the data layer that FEEDS it.

### Proof Gates

- PG-1: Diagnostic SQL results pasted (all 8 queries)
- PG-2: Root cause identified with specific code path
- PG-3: Fix implemented — field mappings accessible to calculation engine
- PG-4: Calculation re-run produces non-zero payout for at least 1 entity
- PG-5: Calculation produces non-zero payout for majority of 719 entities

**Commit:** `OB-85-cont Mission 1: Data bridge fixed — import field mappings → calculation engine`

---

## MISSION 2: FIX ENTITY DISPLAY

The calculation results page shows UUIDs instead of human-readable identifiers.

### 2A: External IDs

The "Employee ID" column must show `external_id` from the entities table, not the UUID `id`.

```bash
echo "=== ENTITY DISPLAY ==="
grep -rn "employee_id\|Employee ID\|entity_id\|external_id\|display_name" \
  web/src/app/operate/calculate/ --include="*.tsx" | head -20

echo ""
echo "--- How are results joined to entities? ---"
grep -rn "entities\|entity.*join\|employee.*name\|display_name" \
  web/src/app/operate/calculate/ web/src/components/*calc* --include="*.tsx" | head -20
```

### 2B: Names

The "Name" column must show `display_name` from entities, or construct it from the roster data (committed_data sheet 'Datos Colaborador' has employee names).

### 2C: Components

The "Components" column must show per-component breakdown from `calculation_results.component_results`.

### Proof Gates

- PG-6: Employee ID column shows external_id (e.g., 96568046), not UUID
- PG-7: Name column shows human name or meaningful identifier, not UUID
- PG-8: Components column shows per-component payout breakdown

**Commit:** `OB-85-cont Mission 2: Entity display — external IDs, names, components`

---

## MISSION 3: IMPORT UX — PERIOD CONTEXT AND UNMAPPED FIELD CLARITY

### 3A: Import confirmation must show periods

After "Import Complete!", show:
- Which periods were detected from the data
- How many records per period
- Whether each period is new or existing
- If existing: what state it's in (Draft/Published/etc.)

### 3B: Unmapped fields must show "Will be preserved"

On the Sheet Analysis page (step 2 of import), fields without a selected mapping must show "Will be preserved in raw data" — NOT blank/empty, which implies the field will be dropped.

This is the Carry Everything, Express Contextually principle made visible.

### 3C: Remove internal IDs from UI

All instances of `→ comp-1771854367335-2` style internal IDs must be replaced with component names from the plan.

### Proof Gates

- PG-9: Import confirmation shows period breakdown with record counts
- PG-10: Unmapped fields show "Preserved" indicator, not blank
- PG-11: No internal component IDs visible on any import page

**Commit:** `OB-85-cont Mission 3: Import UX — periods, preservation, no internal IDs`

---

## MISSION 4: DEMO PERSONA SWITCHER

The persona/demo switcher has been removed from the sidebar. Without it, Manager and Rep views cannot be tested.

### 4A: Restore the demo switcher

```bash
echo "=== DEMO SWITCHER ==="
grep -rn "demo.*switch\|persona.*switch\|role.*switch\|DemoSwitch\|PersonaSwitch" \
  web/src/components/ --include="*.tsx" -l | head -10

echo ""
echo "--- Was it removed in OB-84? ---"
git log --oneline -20
git diff HEAD~5 -- web/src/components/layout/ web/src/components/navigation/ | grep -i "demo\|persona\|switch" | head -20
```

Find the component that was removed or hidden and restore it to the sidebar. It should appear at the bottom of the sidebar with options:
- VL Platform Admin (current)
- CC Admin (tenant admin)
- Manager
- Sales Rep

### Proof Gates

- PG-12: Demo switcher visible in sidebar
- PG-13: Clicking "Manager" changes the view to manager persona
- PG-14: Clicking "Sales Rep" changes the view to rep persona

**Commit:** `OB-85-cont Mission 4: Demo persona switcher restored`

---

## MISSION 5: CALCULATION LIFECYCLE — ZERO PAYOUT WARNING

A calculation that produces MX$0.00 for all entities should NOT silently advance to Preview. The system should warn:

```
⚠ Calculation Complete — Attention Required

719 entities processed, but total payout is MX$0.00.
This typically means:
• Field mappings from import may not have carried through to calculation
• Plan components may not be linked to imported data sheets
• The data may not contain the expected metric fields

Recommended: Review field mappings in Import → Enhanced Import
```

### Proof Gates

- PG-15: Zero-payout calculation shows warning banner (not silent success)
- PG-16: Warning includes actionable recommendation

**Commit:** `OB-85-cont Mission 5: Zero-payout calculation warning`

---

## MISSION 6: RE-TEST AND PROVE

After Missions 1-5 are complete:

### 6A: Re-run calculation

1. Navigate to Calculate → January 2024
2. Click "Run Calculation"
3. **This time, payouts must be non-zero**

Verify in database:
```sql
SELECT cr.entity_id, e.external_id, e.display_name, cr.total_payout, cr.component_results
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
AND cr.total_payout > 0
LIMIT 10;
```

### 6B: Reconciliation

1. Navigate to Reconciliation page
2. Select the new calculation batch
3. Upload CLT-14B benchmark file
4. Verify auto-map detects employee ID and total payout columns
5. Click Run Reconciliation
6. Verify match count > 0

### Proof Gates

- PG-17: Calculation produces non-zero total payout (paste the number)
- PG-18: At least 600 of 719 entities have non-zero payout
- PG-19: Employee table shows external IDs and names (not UUIDs)
- PG-20: Component breakdown visible per entity
- PG-21: Reconciliation auto-maps benchmark file without manual intervention
- PG-22: Reconciliation produces matched employees > 0
- PG-23: Match rate reported (paste the percentage)

**Commit:** `OB-85-cont Mission 6: Pipeline proven — import to match rate`

---

## MISSION 7: BUILD + COMPLETION REPORT + PR

### 7A: Build

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### 7B: Completion report

Save as `OB-85_CONTINUATION_COMPLETION_REPORT.md` at **PROJECT ROOT**.

Must include:
1. **Root cause** — what was broken between import and calculation (paste the diagnostic)
2. **Fix** — what pattern (A/B/C/D) was applied and how
3. **The Number** — total payout, entity count, component breakdown
4. **Reconciliation** — match rate, match count, delta
5. **All 23 proof gates** — PASS/FAIL with pasted evidence
6. **Screenshots or curl output** — rendered browser evidence, not just "it works"

### 7C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-85-cont: Pipeline Proof Complete — Import → Calculate → Reconcile with Non-Zero Payouts" \
  --body "## The Pipeline Works

### Root Cause
[What was broken between import and calculation]

### The Fix
[Pattern applied — how field mappings now flow from import to calculation]

### The Numbers
- Entities: [X] with non-zero payout out of 719
- Total Payout: MX$[Y]
- Reconciliation Match Rate: [Z]%
- Delta vs Benchmark: MX$[D] ([P]%)

### Additional Fixes
- Entity display: external IDs and names (not UUIDs)
- Import UX: period context on confirmation, unmapped fields show 'preserved'
- Internal IDs removed from UI
- Demo persona switcher restored
- Zero-payout calculation warning

## Proof Gates: 23 — see OB-85_CONTINUATION_COMPLETION_REPORT.md"
```

### Proof Gates

- PG-24: `npm run build` exits 0
- PG-25: localhost:3000 responds

**Commit:** `OB-85-cont Final: Completion report + PR`

---

## SCOPE AND PRIORITY

7 missions, 25 proof gates. **Mission 1 is everything.** If the data bridge is fixed and calculations produce non-zero payouts, everything else follows. If Mission 1 fails, nothing else matters.

Priority order:
1. **Mission 1** — Data bridge (this unblocks everything)
2. **Mission 6** — Re-test and prove (validates Mission 1)
3. **Mission 2** — Entity display (makes results readable)
4. **Mission 3** — Import UX (repeated feedback)
5. **Mission 5** — Zero-payout warning (defensive)
6. **Mission 4** — Demo switcher (unblocks persona testing)
7. **Mission 7** — Build + PR

**⚠️ STOP FOR ANDREW after Mission 1 + Mission 2.** Do not proceed to Mission 6 without Andrew confirming he can re-test. Missions 3-5 can proceed in parallel while waiting.

---

*OB-85 Continuation — February 23, 2026*
*"84 OBs built the engine. OB-85 found the disconnect. This fixes it."*
