# OB-158: SCI CLASSIFICATION ACCURACY + TRANSACTION ROUTING + ENTITY DISPLAY
## Target: Current release
## Depends on: HF-090 (PR #178), OB-157 (PR #175)
## Priority: P0 — Blocks Meridian pipeline proof (MX$185,063)
## Estimated Duration: 4-6 hours

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture

---

## CONTEXT

### What Happened (CLT-157 Browser Evidence)

Meridian Logistics Group data file (`Meridian_Datos_Q1_2025.xlsx`) was imported through vialuce.ai. The file has 3 sheets:

| Sheet | Rows | Correct Classification | Actual Classification | Problem |
|-------|------|----------------------|----------------------|---------|
| Plantilla | 50 | Entity (roster) | Team Roster ✅ | Correct but display_name wrong |
| Datos_Rendimiento | 50 | Transaction (performance metrics) | Team Roster ❌ | Should be Transaction → committed_data |
| Datos_Flota_Hub | 36 | Reference (hub fleet data) | Reference ✅ | Correct |

**Result:** 50 entities created (correct), 0 committed_data rows (fatal), display_name = employee ID number instead of person's name.

### Three Root Causes

**RC-1: Datos_Rendimiento misclassified as Team Roster instead of Transaction.**
This sheet contains monthly performance metrics per employee: revenue attainment %, on-time delivery %, new accounts count, safety incidents, fleet utilization data, plus date columns (Mes, Año). The Entity Agent claimed it because it has an employee ID column — but the dominant structural signal is TRANSACTION: multiple numeric metric columns, date fields, one row per employee per month (not one row per entity).

**RC-2: Entity construction uses ID column for both external_id and display_name.**
Plantilla has columns including `No_Empleado` (employee number) and `Nombre_Completo` (full name). The entity construction pipeline used the identifier column for display_name instead of detecting the name column. Result: entities display as "70001" instead of "Ana García López."

**RC-3: Transaction data never reaches committed_data.**
Because Datos_Rendimiento was classified as Team Roster, the execute pipeline routed it through entity construction (creating duplicate entities) instead of through the transaction pipeline that writes to committed_data with entity_id and source_date.

### What Must Be True After OB-158

1. Datos_Rendimiento classified as **Transaction** (not Team Roster)
2. Entities have **display_name from name column** (not ID column)
3. Performance data written to **committed_data** with entity_id + source_date
4. Meridian has **50 entities** with human-readable names
5. Meridian has **committed_data rows** linked to entities
6. Engine Contract verification query returns **non-zero** for committed_data
7. Zero regression on Datos_Flota_Hub (Reference) classification

---

## ARCHITECTURE DECISION GATE

```
DECISION 1: How to fix Datos_Rendimiento misclassification?

Option A: Adjust Entity Agent heuristic weights to score lower on sheets with date columns + many numeric metrics
  - Scale test: Works for any sheet with transaction-like structure
  - Korean Test: PASS — uses structural signals (column types, value distributions), not field names
  - Risk: May affect other classification scenarios
  CHOSEN: Structural heuristics are the correct layer for this fix

Option B: Add Transaction Agent heuristic boost for sheets with date columns + many numeric metrics  
  - Scale test: Works
  - Korean Test: PASS
  - Risk: Same structural fix from the other direction
  CONSIDERED: May be used in combination with Option A

Option C: Hardcode sheet name matching
  - Korean Test: FAIL — field name matching
  REJECTED: Violates AP-25 (Korean Test)

CHOSEN: Option A+B combination — adjust BOTH agents' heuristic weights based on structural signals.
The fix must be structural: if a sheet has (1) an ID column, (2) date/period columns, AND (3) multiple 
numeric metric columns, Transaction Agent should outscore Entity Agent. An entity roster has categorical 
attributes (role, department, location) not numeric time-series metrics.

---

DECISION 2: How to fix entity display_name?

Option A: Detect name column structurally during entity construction
  - Name columns have: high cardinality, text type, long average string length, no repeated patterns
  - ID columns have: sequential/patterned values, shorter strings, often numeric or alphanumeric
  - Korean Test: PASS — structural detection, not field name matching
  CHOSEN: Structural heuristic distinguishes name from ID

Option B: Use field name matching to find "name" or "nombre" columns
  - Korean Test: FAIL
  REJECTED: Language-specific matching

CHOSEN: Option A — structural heuristics for name column detection
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Phase 0: Architecture decisions — classification accuracy + entity display" && git push origin dev`

---

## PHASE 0: DIAGNOSTIC — TRACE THE CLASSIFICATION

Before writing any fix, understand exactly what happened.

### 0A: Examine the SCI Agent Scoring Code

```bash
# Find the agent scoring logic
grep -rn "Entity.*score\|entity.*confidence\|Team.Roster\|team_roster\|transaction.*score" \
  web/src/lib/sci/ --include="*.ts" | head -30

# Find the content profile generator
grep -rn "ContentProfile\|contentProfile\|generateProfile" \
  web/src/lib/sci/ --include="*.ts" | head -20

# Find entity construction — where display_name is set
grep -rn "display_name\|displayName\|entity.*name" \
  web/src/app/api/import/ --include="*.ts" | head -30
```

### 0B: Understand the Structural Differences

The two sheets that were both classified as "Team Roster" have fundamentally different structures:

**Plantilla (correctly Entity/Team Roster):**
- Columns: No_Empleado, Nombre_Completo, Tipo_Coordinador, Hub_Asignado, Region, Fecha_Ingreso
- Pattern: One row per person, categorical attributes, no numeric metrics
- Date columns: 1 (hire date — static attribute, not temporal event)
- Numeric columns: 1 (employee ID)

**Datos_Rendimiento (incorrectly Team Roster — should be Transaction):**
- Columns: No_Empleado, Mes, Año, Meta_Ingreso, Ingreso_Real, Cumplimiento_Ingreso_Pct, Entregas_Totales, Entregas_Tiempo, Pct_Entrega_Tiempo, Cuentas_Nuevas, Incidentes_Seguridad
- Pattern: Multiple rows per person (one per month), many numeric metric columns, date columns (Mes, Año)
- Date columns: 2+ (Mes, Año — temporal event markers)
- Numeric columns: 8+ (metrics, amounts, percentages)

**The structural signal is clear:** high ratio of numeric columns to total columns + date/period columns + multiple rows per entity ID = Transaction, not Entity.

### 0C: Print Agent Scores from Last Import

```bash
# Check if SCI stores agent scores in the database
grep -rn "allScores\|agentScore\|agent_scores" \
  web/src/app/api/import/ --include="*.ts" | head -10

# Check import_batches or metadata for stored classification info
```

If scores are stored, query them for the Meridian import to see what each agent scored.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Phase 0: Diagnostic — classification trace" && git push origin dev`

---

## PHASE 1: FIX TRANSACTION AGENT SCORING

### 1A: Locate the Agent Scoring Functions

The agents live in `web/src/lib/sci/agents.ts` or similar. Find the Transaction Agent and Entity Agent scoring functions.

### 1B: Add Structural Heuristic — Transaction Signal Boost

The Transaction Agent should score HIGH when a content unit has:
- **Date/period columns** (2+) — temporal markers indicating events over time
- **Multiple numeric columns** (5+) — metrics, amounts, percentages
- **Repeated entity IDs** — same ID appears on multiple rows (one per time period)
- **High numeric-to-total column ratio** (>50% of columns are numeric)

```typescript
// STRUCTURAL SIGNALS — Korean Test compliant (no field name matching)
// These patterns distinguish transaction data from roster data

// Signal: High ratio of numeric columns to total columns
const numericRatio = profile.numericColumnCount / profile.totalColumnCount;
if (numericRatio > 0.5) transactionScore += 0.15;

// Signal: Date/period columns present (temporal events)
if (profile.dateColumnCount >= 2) transactionScore += 0.20;

// Signal: Repeated values in first identifier-like column (multiple rows per entity)
if (profile.identifierColumnRepeatRatio > 1.5) transactionScore += 0.15;
// identifierColumnRepeatRatio = totalRows / uniqueValuesInFirstIdColumn
// Roster: ratio ≈ 1.0 (one row per entity)
// Transaction: ratio > 1.0 (multiple rows per entity)
```

### 1C: Adjust Entity Agent Scoring — Transaction Signal Penalty

The Entity Agent should score LOWER when the same structural signals are present:

```typescript
// PENALTY: If sheet looks like transaction data, Entity Agent backs off
if (numericRatio > 0.5 && profile.dateColumnCount >= 2) {
  entityScore -= 0.20;
}

// PENALTY: Multiple rows per identifier = not a roster
if (profile.identifierColumnRepeatRatio > 1.5) {
  entityScore -= 0.15;
}
```

### 1D: Verify Content Profile Has Necessary Metrics

The Content Profile generator must compute:
- `numericColumnCount` — count of columns where >80% of values are numeric
- `dateColumnCount` — count of columns where values are dates or period markers (month numbers 1-12, year values 2020-2030, date patterns)
- `identifierColumnRepeatRatio` — totalRows / unique values in the column with the lowest cardinality that looks like an ID (sequential integers, alphanumeric patterns)

If these metrics don't exist in the Content Profile, ADD them. They are structural observations — Korean Test compliant.

### 1E: Proof Gate — Verify With Meridian Data Structure

Mentally simulate (or test with a script) the scoring on both sheets:

**Plantilla:**
- numericRatio: ~1/6 = 0.17 → no transaction boost
- dateColumnCount: 1 (hire date) → no transaction boost  
- identifierColumnRepeatRatio: 50/50 = 1.0 → no transaction boost
- Entity Agent score: HIGH (categorical attributes, one row per person)
- **Expected winner: Entity Agent ✅**

**Datos_Rendimiento:**
- numericRatio: ~8/11 = 0.73 → transaction boost +0.15
- dateColumnCount: 2 (Mes, Año) → transaction boost +0.20
- identifierColumnRepeatRatio: 150/50 = 3.0 → transaction boost +0.15 (3 months × 50 employees)
- Entity Agent penalty: -0.35 (numeric ratio + repeat ratio)
- **Expected winner: Transaction Agent ✅**

### Proof Gates — Phase 1
- PG-1: Transaction Agent has structural heuristic boost for numeric-heavy + date-bearing sheets
- PG-2: Entity Agent has structural penalty for transaction-like sheets  
- PG-3: Content Profile computes numericColumnCount, dateColumnCount, identifierColumnRepeatRatio
- PG-4: `npm run build` exits 0
- PG-5: Korean Test — zero field name matching in new code (`grep -rn "Mes\|Año\|Nombre\|Empleado\|rendimiento" web/src/lib/sci/`)

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Phase 1: Transaction Agent structural heuristic — numeric ratio + date columns + repeat ratio" && git push origin dev`

---

## PHASE 2: FIX ENTITY display_name MAPPING

### 2A: Locate Entity Construction Code

```bash
grep -rn "display_name\|displayName\|entity.*insert\|entity.*create" \
  web/src/app/api/import/sci/ --include="*.ts" | head -20
```

Find where entities are constructed from classified roster data.

### 2B: Add Structural Name Column Detection

When constructing entities from a roster-classified sheet, the pipeline must distinguish:
- **Identifier column:** The column used for `external_id` (sequential numbers, short alphanumeric, low average string length, often numeric)
- **Name column:** The column used for `display_name` (high cardinality text, longer average string length, contains spaces, mixed case)

```typescript
// STRUCTURAL NAME DETECTION — Korean Test compliant
// Distinguish identifier columns from name columns without field name matching

function detectNameColumn(columns: string[], sampleRows: Record<string, unknown>[]): string | null {
  let bestCandidate: string | null = null;
  let bestScore = 0;

  for (const col of columns) {
    const values = sampleRows.map(r => String(r[col] || '')).filter(v => v.length > 0);
    if (values.length === 0) continue;

    let score = 0;
    
    // Text values (not purely numeric)
    const nonNumericRatio = values.filter(v => isNaN(Number(v))).length / values.length;
    if (nonNumericRatio > 0.9) score += 3;
    
    // Contains spaces (multi-word names)
    const spaceRatio = values.filter(v => v.includes(' ')).length / values.length;
    if (spaceRatio > 0.5) score += 3;
    
    // Average string length > 10 (names are longer than IDs)
    const avgLength = values.reduce((sum, v) => sum + v.length, 0) / values.length;
    if (avgLength > 10) score += 2;
    
    // High cardinality (unique names, not categorical like "Senior"/"Standard")
    const uniqueRatio = new Set(values).size / values.length;
    if (uniqueRatio > 0.8) score += 1;
    
    // Mixed case (names have capitals, IDs often don't)
    const mixedCaseRatio = values.filter(v => v !== v.toLowerCase() && v !== v.toUpperCase()).length / values.length;
    if (mixedCaseRatio > 0.5) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = col;
    }
  }

  // Only return if score is convincing (>= 5 out of 10)
  return bestScore >= 5 ? bestCandidate : null;
}
```

### 2C: Apply to Entity Construction Pipeline

When creating entities:

```typescript
const nameColumn = detectNameColumn(columns, sampleRows);
const idColumn = detectIdentifierColumn(columns, sampleRows); // existing logic

for (const row of rows) {
  entities.push({
    external_id: String(row[idColumn]),
    display_name: nameColumn ? String(row[nameColumn]) : String(row[idColumn]), // fallback to ID
    entity_type: 'individual',
    // ... other fields
  });
}
```

### Proof Gates — Phase 2
- PG-6: `detectNameColumn` function exists with structural heuristics
- PG-7: Entity construction uses detected name column for display_name
- PG-8: Korean Test — zero field name matching in detection logic
- PG-9: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Phase 2: Structural name column detection for entity display_name" && git push origin dev`

---

## PHASE 3: FIX TRANSACTION EXECUTE PIPELINE

When a sheet is classified as Transaction, the execute pipeline must:

### 3A: Verify Transaction Execute Route Exists

```bash
grep -rn "transaction\|Transaction" web/src/app/api/import/sci/execute/ --include="*.ts" | head -20
```

If the execute route only handles Plan, Entity/Team Roster, and Reference — it needs a Transaction path that writes to `committed_data`.

### 3B: Transaction Execute Must Write to committed_data

For each row in a Transaction-classified sheet:

1. **Resolve entity_id** — match the identifier column value against `entities.external_id` in this tenant
2. **Extract source_date** — compose from date columns (Decision 92: structural detection, Korean Test compliant)
3. **Write to committed_data:**
   ```typescript
   {
     tenant_id: tenantId,
     import_batch_id: batchId,
     entity_id: resolvedEntityId,    // matched from entities table
     period_id: null,                // Decision 92: engine binds at calc time
     source_date: extractedDate,     // from structural date detection
     data_type: 'transaction',
     row_data: fullRowAsJsonb,       // Carry Everything, Express Contextually
     metadata: { source_file, sheet_name, row_number },
     created_at: now()
   }
   ```

### 3C: Entity Resolution for Transaction Data

The transaction pipeline must match rows to existing entities:

```typescript
// Load existing entities for this tenant
const { data: entities } = await supabase
  .from('entities')
  .select('id, external_id')
  .eq('tenant_id', tenantId);

const entityMap = new Map(entities.map(e => [e.external_id, e.id]));

// For each transaction row, resolve entity_id
for (const row of transactionRows) {
  const externalId = String(row[identifierColumn]);
  const entityId = entityMap.get(externalId);
  
  if (!entityId) {
    // Log unmatched row but don't fail — some rows may be for entities not yet imported
    unmatchedRows.push({ externalId, rowNumber });
    continue;
  }
  
  committedDataRows.push({
    tenant_id: tenantId,
    entity_id: entityId,
    source_date: extractSourceDate(row, dateColumns), // Decision 92
    data_type: 'transaction',
    row_data: row,  // full row — Carry Everything
    // ...
  });
}

// Bulk insert (AP-2: minimum 5,000 row chunks, or single insert for smaller sets)
```

### 3D: Source Date Extraction (Decision 92 Compliant)

```typescript
// STRUCTURAL date extraction — Korean Test compliant
// Look for columns with date-like values, compose source_date

function extractSourceDate(row: Record<string, unknown>, profile: ContentProfile): string | null {
  // Strategy 1: Find a column with actual date values (YYYY-MM-DD, MM/DD/YYYY, etc.)
  // Strategy 2: Find month + year columns and compose (e.g., month=1, year=2025 → 2025-01-01)
  // Strategy 3: Find Excel serial date numbers and convert
  
  // Use structural detection from OB-152/OB-157 — do NOT match on field names
  // The source_date extraction logic already exists — reuse it
}
```

Reuse the existing `extractSourceDate` logic from OB-152/OB-157. Do NOT write new date extraction code — find the existing implementation and call it.

### Proof Gates — Phase 3
- PG-10: Transaction execute path writes to committed_data
- PG-11: Entity resolution matches transaction rows to existing entities
- PG-12: source_date extracted structurally (Decision 92)
- PG-13: row_data contains full row (Carry Everything principle)
- PG-14: Bulk insert used (AP-2 compliance)
- PG-15: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Phase 3: Transaction execute pipeline — committed_data routing with entity resolution" && git push origin dev`

---

## PHASE 4: CLEAN MERIDIAN DATA + RE-IMPORT

### 4A: Clean Existing Meridian Data

The current Meridian tenant has 50 entities with wrong display_names and 0 committed_data. Clean the entities so the re-import starts fresh:

```bash
# Create cleanup script
cat > web/scripts/ob158-meridian-cleanup.ts << 'EOF'
// Delete existing entities for Meridian (they have wrong display_names)
// The plan (rule_sets) is correct — do NOT delete it
import { createClient } from '@supabase/supabase-js';

const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function cleanup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete entities (cascade will handle committed_data if any exists)
  const { count } = await supabase
    .from('entities')
    .delete()
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .select('id', { count: 'exact' });
  
  console.log(`Deleted ${count} entities from Meridian`);
  
  // Verify rule_sets still exists
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  
  console.log(`Rule sets preserved: ${ruleSets?.length}`);
  for (const rs of ruleSets || []) {
    console.log(`  - ${rs.name}`);
  }
  
  // Verify committed_data is clean
  const { count: cdCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact' })
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  
  console.log(`Committed data rows: ${cdCount}`);
}

cleanup().catch(console.error);
EOF

npx tsx web/scripts/ob158-meridian-cleanup.ts
```

### 4B: Re-import Data Through Browser (localhost)

This is the BROWSER proof — not a script bypass (CC Failure Pattern 33).

1. Start dev server: `npm run dev`
2. Open localhost:3000
3. Log in as VL Admin
4. Navigate to Meridian tenant → Import
5. Upload `Meridian_Datos_Q1_2025.xlsx`
6. **Verify classification:** Plantilla = Team Roster, Datos_Rendimiento = Transaction, Datos_Flota_Hub = Reference
7. Confirm and import
8. **Verify results:**
   - Entities: 50 (with human-readable names, not employee IDs)
   - committed_data: >0 rows
   - Components: shows count from rule_set

### 4C: Database Verification

```sql
-- Entity display names should be human names, not IDs
SELECT external_id, display_name, entity_type
FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY external_id
LIMIT 10;

-- committed_data should have rows with entity_ids and source_dates
SELECT COUNT(*) as total_rows,
       COUNT(DISTINCT entity_id) as entities_with_data,
       COUNT(DISTINCT source_date) as distinct_dates,
       MIN(source_date) as earliest_date,
       MAX(source_date) as latest_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Engine Contract verification — all 5 tables populated
SELECT 
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT COUNT(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
```

**Expected minimums after OB-158:**
- rule_sets: 1
- entities: 50
- periods: 0 (engine creates at calc time per Decision 92, or may need manual creation)
- committed_data: 150+ (50 employees × 3 months)
- assignments: 0 (wiring not in scope — next OB)

### Proof Gates — Phase 4
- PG-16: Meridian entities cleaned (50 deleted)
- PG-17: Rule sets preserved (1 — Meridian Logistics Group Incentive Plan 2025)
- PG-18: Re-import on localhost: Datos_Rendimiento classified as Transaction
- PG-19: Entities have human-readable display_names (not employee IDs)
- PG-20: committed_data has >0 rows with entity_ids
- PG-21: Engine Contract query shows rule_sets=1, entities=50, committed_data>0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Phase 4: Meridian data cleanup + re-import verification" && git push origin dev`

---

## PHASE 5: BUILD + PR

### 5A: Final Build

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 5B: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-158: SCI Classification Accuracy — Transaction Routing + Entity Display" \
  --body "Fixes three root causes blocking Meridian pipeline proof:

1. Transaction Agent structural heuristic: numeric ratio + date columns + repeat ratio boost
2. Entity Agent penalty for transaction-like sheets
3. Structural name column detection for entity display_name

After OB-158:
- Datos_Rendimiento classified as Transaction (was Team Roster)
- Entities display human names (was employee IDs)
- Performance data written to committed_data with entity_id + source_date

Engine Contract status (Meridian):
- rule_sets: 1 ✅
- entities: 50 ✅
- committed_data: [count from PG-20] ✅
- periods: 0 (engine creates at calc time)
- assignments: 0 (next OB)

CLT-157 root causes addressed: RC-1 (misclassification), RC-2 (display_name), RC-3 (no committed_data)."
```

### Proof Gates — Phase 5
- PG-22: `npm run build` exits 0
- PG-23: localhost:3000 responds
- PG-24: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-158 Complete: SCI classification accuracy + transaction routing" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Transaction Agent heuristic scoring improvements (structural signals)
- Entity Agent penalty for transaction-like content units
- Content Profile additions (numericColumnCount, dateColumnCount, identifierColumnRepeatRatio)
- Structural name column detection for entity display_name
- Transaction execute pipeline → committed_data routing
- Meridian entity cleanup + re-import verification on localhost

### OUT OF SCOPE — DO NOT TOUCH
- Auth files (middleware, auth-context, etc.)
- Calculation engine
- Plan import (PPTX pipeline — already works)
- Rule set components or input_bindings
- Period creation (engine handles at calc time per Decision 92)
- Rule set assignments (next OB)
- UI components beyond import surface
- Reference Agent scoring (Datos_Flota_Hub already classified correctly)
- RLS policies
- Supabase migrations (no schema changes needed)

### CRITICAL CONSTRAINTS

1. **Korean Test on ALL new code.** Zero field name matching. Zero language-specific strings. All classification uses structural patterns (value types, distributions, ratios, cardinality). If it wouldn't work with Korean column names, it's wrong.
2. **Carry Everything, Express Contextually.** Transaction rows written to committed_data.row_data must contain the FULL row — all columns, mapped and unmapped.
3. **Decision 92 compliance.** source_date extracted structurally. period_id left null. Engine binds at calc time.
4. **Do NOT create periods.** The engine handles period binding from source_date.
5. **Do NOT create rule_set_assignments.** That's a separate pipeline step.
6. **Browser proof required.** Phase 4B must be done through the browser, not via scripts (CC Failure Pattern 33).
7. **Preserve the plan.** The rule_set with 5 components and 2 variants is correct and must not be modified.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-5 | Hardcode field names for classification | Korean Test — structural heuristics only |
| AP-6 | Match on language-specific column names | Detect structure (types, distributions), not vocabulary |
| AP-13 | Assume schema without checking | Verify SCHEMA_REFERENCE.md before any INSERT |
| AP-34 | Entity inflation from wrong classification | Transaction sheets create committed_data, not entities |
| AP-35 | Schema assumption without verification | Query live schema |
| NEW-AP | Use ID column as display_name | Structural name detection: text, spaces, length, cardinality |
| Pattern 33 | Script bypass as browser proof | Phase 4B browser test is mandatory |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-158_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Completion Report Structure
1. **Architecture Decisions** — decisions with rationale
2. **Commits** — all with hashes, one per phase
3. **Files created** — every new file
4. **Files modified** — every changed file
5. **Proof gates** — 24 gates, each PASS/FAIL with pasted evidence
6. **CLT-157 findings addressed** — RC-1, RC-2, RC-3 status
7. **Engine Contract state** — 5-table query results after re-import

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ Architecture Decisions committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Korean Test: zero field name matching in new code?
□ Transaction Agent scores higher than Entity Agent on Datos_Rendimiento structure?
□ Entity display_name uses structural name detection, not ID column?
□ committed_data has rows with entity_id and source_date?
□ Full row preserved in row_data (Carry Everything)?
□ Browser test completed (not script)?
□ Rule set preserved (not modified or deleted)?
□ npm run build exits 0?
□ localhost:3000 responds?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-158: "Transaction data has metrics. Roster data has attributes. The structure tells you which is which — you never need to read the column names."*
