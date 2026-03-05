# HF-091: FIX IDENTIFIER REPEAT RATIO + TRANSACTION AGENT SCORING + CLASSIFICATION OVERRIDE
## Target: Current release
## Depends on: OB-158 (PR #179)
## Priority: P0 — Blocks Meridian pipeline proof (MX$185,063)

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

### What Happened (CLT-158 Browser Evidence)

Meridian's Datos_Rendimiento sheet (201 rows, 19 columns, 61% numeric) is classified as **entity (80%)** instead of **transaction**. The Transaction Agent scores so low it doesn't even appear in the close classification scores. Only entity (80%) vs target (70%) vs reference (50%).

### The Browser Evidence Shows Three Bugs

**Bug 1: identifierRepeatRatio computes as 1.0 when it should be ~4.0**

The classification card says: "Entity IDs are ~unique (repeat ratio 1.0) — one row per entity"

Reality: 201 rows with 50 unique employee IDs = repeat ratio 4.02. The same employee appears ~4 times (once per month for Q1 + likely a combined row). This ratio should be 4.0, not 1.0. OB-158 added a +0.20 Transaction boost for high repeat ratio and a -0.20 Entity penalty — but neither fires because the ratio is incorrectly computed as 1.0.

**Bug 2: Transaction Agent not competing despite strong structural signals**

The sheet has:
- 61% numeric fields (above the 50% threshold OB-158 added)
- Date columns (Mes, Año) 
- 201 rows (moderate-high volume)
- Repeated entity IDs across months

Yet Transaction Agent scores so low it's not even shown in close classification scores. The numericFieldRatio signal from OB-158 is either not being applied to the Transaction Agent, or other signals are overwhelming it.

**Bug 3: "Change classification" is text, not an interactive control**

The UI shows "Change classification" at the bottom of each card but it's unclear if it works. CLT-142 F-09 flagged this. Users need a clear, functional override mechanism.

### What Must Be True After HF-091

1. identifierRepeatRatio correctly computed as totalRows / uniqueIdentifierValues (~4.0 for Datos_Rendimiento)
2. Transaction Agent scores competitively when numericRatio > 50% AND repeat ratio > 1.5
3. Datos_Rendimiento classified as **Transaction** on re-import
4. "Change classification" is a functional dropdown/selector, not ambiguous text
5. Transaction execute pipeline writes rows to committed_data
6. Zero regression on Plantilla (Entity) and Datos_Flota_Hub (Reference) classifications

---

## PHASE 0: DIAGNOSTIC — FIND THE BUGS

### 0A: Find the identifierRepeatRatio Calculation

```bash
# Find where repeat ratio is calculated
grep -rn "repeatRatio\|repeat_ratio\|identifierRepeat\|RepeatRatio" \
  web/src/lib/sci/ --include="*.ts" | head -20

# Find the content profile generator
grep -rn "generateProfile\|ContentProfile\|contentProfile" \
  web/src/lib/sci/ --include="*.ts" | head -20
```

Read the function that computes identifierRepeatRatio. The bug is likely one of:
- Dividing uniqueValues / totalRows instead of totalRows / uniqueValues
- Using sampleRows (50 max) instead of totalRowCount
- Computing against the wrong column (not the identifier column)
- Not computing it at all (defaulting to 1.0)

### 0B: Find the Transaction Agent Scoring

```bash
# Find Transaction Agent scoring function
grep -rn "transaction\|Transaction" \
  web/src/lib/sci/agents.ts --include="*.ts" | head -30

# If not in agents.ts, search broadly
grep -rn "TransactionAgent\|transaction.*score\|transaction.*confidence" \
  web/src/lib/sci/ --include="*.ts" | head -20
```

Read the Transaction Agent's scoring function. Identify why it scores near zero despite:
- numericFieldRatio = 0.61 (above 0.50 threshold)
- dateColumnCount = 2 (Mes, Año)
- identifierRepeatRatio should be 4.0

### 0C: Find the Classification Override UI

```bash
# Find the "Change classification" UI element
grep -rn "Change classification\|change.*classification\|reclassify" \
  web/src/components/sci/ --include="*.tsx" --include="*.ts" | head -10

# Find the SCI proposal component
grep -rn "SCIProposal\|ClassificationCard\|ContentUnitCard" \
  web/src/components/sci/ --include="*.tsx" | head -10
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Phase 0: Diagnostic — repeat ratio + transaction scoring + override UI" && git push origin dev`

---

## PHASE 1: FIX identifierRepeatRatio CALCULATION

### The Fix

The repeat ratio must be: `totalRowCount / uniqueValuesInIdentifierColumn`

Where:
- `totalRowCount` is the FULL row count of the sheet (201 for Datos_Rendimiento), NOT the sample size
- `uniqueValuesInIdentifierColumn` is the count of distinct values in the detected identifier column

Common bugs to check:
```typescript
// BUG PATTERN 1: Inverted ratio
const ratio = uniqueValues / totalRows;  // WRONG — gives 0.25 for 50/201
// FIX:
const ratio = totalRows / uniqueValues;  // RIGHT — gives 4.02 for 201/50

// BUG PATTERN 2: Using sample size instead of total
const ratio = sampleRows.length / uniqueValues;  // WRONG if sample capped at 50
// FIX:
const ratio = totalRowCount / uniqueValues;  // RIGHT — use full count

// BUG PATTERN 3: Not computing at all
// identifierRepeatRatio defaults to 1.0 if not set
// FIX: ensure computation runs and sets the value
```

### Verification

After fixing, the Content Profile for Datos_Rendimiento should show:
- `identifierRepeatRatio`: ~4.02 (201 rows / 50 unique IDs)

For Plantilla it should show:
- `identifierRepeatRatio`: ~1.0 (67 rows / ~67 unique IDs)

### Proof Gates — Phase 1
- PG-1: identifierRepeatRatio computation uses totalRowCount / uniqueValues (paste code)
- PG-2: NOT using sample size for the calculation
- PG-3: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Phase 1: Fix identifierRepeatRatio — totalRows / uniqueValues" && git push origin dev`

---

## PHASE 2: FIX TRANSACTION AGENT SCORING

### 2A: Ensure Transaction Agent Gets Structural Boosts

The Transaction Agent MUST apply these signals (from OB-158, verify they're actually wired):

```typescript
// Signal 1: High numeric field ratio (>50%)
// Datos_Rendimiento: 61% → should trigger
if (profile.numericFieldRatio > 0.50) {
  transactionScore += 0.15;
}

// Signal 2: Date/period columns present
// Datos_Rendimiento: Mes + Año → should trigger
if (profile.dateColumnCount >= 2) {
  transactionScore += 0.20;
}

// Signal 3: Repeated entity IDs (NOW FIXED from Phase 1)
// Datos_Rendimiento: 4.02 → should trigger
if (profile.identifierRepeatRatio > 1.5) {
  transactionScore += 0.20;
}
```

### 2B: Ensure Entity Agent Gets Corresponding Penalties

```typescript
// Penalty 1: High numeric ratio + date columns = not a roster
if (profile.numericFieldRatio > 0.50 && profile.dateColumnCount >= 2) {
  entityScore -= 0.15;
}

// Penalty 2: Repeated entity IDs = multiple rows per person = not a roster
if (profile.identifierRepeatRatio > 1.5) {
  entityScore -= 0.20;
}
```

### 2C: Verify the Signals Are Connected to the Scoring

The most likely bug: OB-158 added the signal COMPUTATION to the Content Profile but didn't wire the signals INTO the agent scoring functions. Check that the Transaction Agent and Entity Agent actually READ these profile values.

```bash
# Verify agent scoring reads the profile values
grep -rn "numericFieldRatio\|numericRatio\|dateColumnCount\|identifierRepeatRatio" \
  web/src/lib/sci/agents.ts
```

If these grep results show zero hits in the agent scoring file, that's the bug — the signals were computed but never consumed.

### 2D: Expected Outcome After Fix

**Datos_Rendimiento scoring should be approximately:**

| Agent | Base | numericRatio boost | dateColumn boost | repeatRatio boost/penalty | Total |
|-------|------|--------------------|------------------|--------------------------|-------|
| Transaction | ~0.20 | +0.15 | +0.20 | +0.20 | **~0.75** |
| Entity | ~0.65 | — | — | -0.20 (repeat) -0.15 (numeric+date) | **~0.30** |
| Target | ~0.50 | — | — | — | ~0.50 |

Transaction should WIN at ~75% vs Entity at ~30%.

**Plantilla scoring should remain:**

| Agent | Base | numericRatio | dateColumn | repeatRatio | Total |
|-------|------|-------------|------------|-------------|-------|
| Entity | ~0.65 | no boost (17% numeric) | no boost (1 date col) | no penalty (ratio ~1.0) | **~0.65** |
| Transaction | ~0.20 | no boost | no boost | no boost | **~0.20** |

Entity should still WIN for Plantilla.

### Proof Gates — Phase 2
- PG-4: Transaction Agent scoring function reads numericFieldRatio from profile (paste code)
- PG-5: Transaction Agent scoring function reads dateColumnCount from profile (paste code)
- PG-6: Transaction Agent scoring function reads identifierRepeatRatio from profile (paste code)
- PG-7: Entity Agent has penalties for transaction-like signals (paste code)
- PG-8: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Phase 2: Wire structural signals into Transaction + Entity agent scoring" && git push origin dev`

---

## PHASE 3: CLASSIFICATION OVERRIDE UI

### 3A: Find the Classification Card Component

The component that renders "Change classification" text. Replace the text with a functional dropdown.

### 3B: Implement Override Dropdown

When the user clicks "Change classification", show a dropdown with the available classifications:
- Entity (Team Roster)
- Transaction (Operational Data)
- Reference (Lookup/Catalog Data)
- Plan Rules

The dropdown should:
1. Show the current classification as selected
2. Allow the user to select a different classification
3. Update the proposal's `confirmedClassification` for that content unit
4. Visually indicate the override (e.g., different badge color, "Manually classified" label)
5. The overridden classification is what gets sent to the execute API

```typescript
// The SCIExecutionRequest already supports this via confirmedClassification:
interface ContentUnitExecution {
  contentUnitId: string;
  confirmedClassification: AgentType; // may differ from proposal if user corrected
  confirmedBindings: SemanticBinding[];
  rawData: Record<string, unknown>[];
}
```

The UI just needs to update `confirmedClassification` when the user overrides.

### 3C: Design Requirements

- Dropdown appears on click of "Change classification" 
- Options are labeled with user-friendly names, not internal agent types
- Selected override shows visually (badge changes color, text says "Reclassified by admin")
- Override is NOT required — default AI classification works for confirmed items
- Override generates a classification signal for the flywheel (log the correction)

### Proof Gates — Phase 3
- PG-9: "Change classification" triggers a functional dropdown (not just text)
- PG-10: Selecting a different classification updates the confirmed classification
- PG-11: Overridden classification shows visual indicator
- PG-12: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Phase 3: Classification override dropdown — functional reclassification" && git push origin dev`

---

## PHASE 4: FIX reference_data key_field NOT NULL

### The Error

`null value in column "key_field" of relation "reference_data" violates not-null constraint`

The Reference Agent pipeline writes to reference_data but doesn't populate `key_field`. 

### The Fix

When writing reference data, `key_field` should be set to the detected identifier/key column from the content unit. For Datos_Flota_Hub, this would be the Hub column (the lookup key for reference data).

```bash
# Find where reference_data is inserted
grep -rn "reference_data" web/src/app/api/import/sci/ --include="*.ts" | head -10
```

Find the INSERT and ensure `key_field` is populated:

```typescript
// key_field = the column name that serves as the lookup key for this reference data
// Detect structurally: the column with highest cardinality that looks like an identifier
// For Datos_Flota_Hub: "Hub" is the key field
key_field: detectedKeyColumn || columns[0]  // fallback to first column if detection fails
```

### Proof Gates — Phase 4
- PG-13: reference_data INSERT includes non-null key_field
- PG-14: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Phase 4: Fix reference_data key_field NOT NULL" && git push origin dev`

---

## PHASE 5: CLEAN MERIDIAN + RE-IMPORT ON LOCALHOST

### 5A: Clean Meridian Entities (Again)

```bash
cat > web/scripts/hf091-meridian-cleanup.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function cleanup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete entities (wrong display_names from prior imports)
  const { count: entityCount } = await supabase
    .from('entities')
    .delete()
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .select('id', { count: 'exact' });
  console.log(`Deleted ${entityCount} entities`);

  // Delete any committed_data
  const { count: cdCount } = await supabase
    .from('committed_data')
    .delete()
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .select('id', { count: 'exact' });
  console.log(`Deleted ${cdCount} committed_data rows`);

  // Delete any reference_data
  const { count: refCount } = await supabase
    .from('reference_data')
    .delete()
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .select('id', { count: 'exact' });
  console.log(`Deleted ${refCount} reference_data rows`);

  // Verify rule_sets preserved
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  console.log(`Rule sets preserved: ${rs?.length}`);
  
  // Engine Contract verification
  const { count: finalEntities } = await supabase.from('entities').select('id', { count: 'exact' }).eq('tenant_id', MERIDIAN_TENANT_ID);
  const { count: finalCD } = await supabase.from('committed_data').select('id', { count: 'exact' }).eq('tenant_id', MERIDIAN_TENANT_ID);
  console.log(`\nPost-cleanup: entities=${finalEntities}, committed_data=${finalCD}`);
}

cleanup().catch(console.error);
EOF

npx tsx web/scripts/hf091-meridian-cleanup.ts
```

### 5B: Browser Re-Import on localhost

1. `npm run dev`
2. Open localhost:3000
3. Log in as VL Admin → Meridian
4. Import → upload Meridian_Datos_Q1_2025.xlsx
5. **VERIFY on analyze screen:**
   - Plantilla: entity (should be ~65%+)
   - Datos_Rendimiento: **transaction** (should be ~75%+ — NOT entity)
   - Datos_Flota_Hub: reference (should be ~85%+)
6. Confirm all → Import data
7. **VERIFY results:**
   - Entities: ~67 with human-readable names
   - committed_data: 150+ rows
   - Reference data: no error (key_field populated)

### 5C: Database Verification

```sql
-- Entities with human names
SELECT external_id, display_name FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY external_id LIMIT 5;

-- committed_data populated
SELECT COUNT(*) as total, COUNT(DISTINCT entity_id) as entities, 
       MIN(source_date) as earliest, MAX(source_date) as latest
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Engine Contract
SELECT 
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT COUNT(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data;
```

### Proof Gates — Phase 5
- PG-15: Meridian entities cleaned
- PG-16: Rule sets preserved (1)
- PG-17: Datos_Rendimiento classified as **Transaction** on analyze screen (screenshot or paste confidence)
- PG-18: Plantilla still classified as Entity
- PG-19: Datos_Flota_Hub classified as Reference (no key_field error)
- PG-20: Entities have human-readable display_names (paste first 5)
- PG-21: committed_data has >0 rows with entity_ids and source_dates (paste counts)
- PG-22: Engine Contract: rule_sets=1, entities>0, committed_data>0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Phase 5: Meridian cleanup + browser re-import verification" && git push origin dev`

---

## PHASE 6: BUILD + PR

### 6A: Final Build

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 6B: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-091: Fix classification scoring — Transaction Agent + override + reference key_field" \
  --body "Three fixes blocking Meridian pipeline proof:

1. identifierRepeatRatio was computing as 1.0 (should be 4.0 for 201 rows / 50 IDs)
   - Bug: used sample size or inverted division
   - Fix: totalRowCount / uniqueIdentifierValues

2. Transaction Agent structural signals not wired into scoring
   - numericFieldRatio, dateColumnCount, identifierRepeatRatio now consumed by agent
   - Entity Agent gets corresponding penalties
   - Datos_Rendimiento: transaction ~75% vs entity ~30% (was entity 80% vs target 70%)

3. Classification override dropdown
   - 'Change classification' is now a functional dropdown
   - Users can override AI classification before executing
   - Generates classification signal for flywheel

4. reference_data key_field NOT NULL fix
   - Reference pipeline now detects and populates key_field column

CLT-158 findings addressed. Meridian pipeline: entities + committed_data populated."
```

### Proof Gates — Phase 6
- PG-23: `npm run build` exits 0
- PG-24: localhost:3000 responds
- PG-25: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-091 Complete: Classification scoring fix + override + reference key_field" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Fix identifierRepeatRatio calculation (totalRows / uniqueValues)
- Wire structural signals into Transaction Agent and Entity Agent scoring
- Classification override dropdown on SCI proposal cards
- Fix reference_data key_field NOT NULL error
- Meridian entity cleanup + browser re-import verification

### OUT OF SCOPE — DO NOT TOUCH
- Auth files
- Calculation engine
- Plan import (PPTX) — already works
- Rule set components or input_bindings
- Period creation
- Rule set assignments
- RLS policies
- Supabase schema migrations

### CRITICAL CONSTRAINTS

1. **Korean Test on all scoring changes.** Classification signals use structural patterns only — zero field name matching.
2. **Do NOT delete or modify rule_sets.** The plan is correct.
3. **Browser proof required (Phase 5B).** Not script bypass.
4. **identifierRepeatRatio must use totalRowCount**, not sample size. The sample is capped at 50 rows for the analyze API but the total row count of the sheet is available.
5. **Override UI must update confirmedClassification** in the execution request, not just visually.
6. **reference_data key_field detection must be structural** — detect the key column from cardinality/type patterns, not from field names.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-5 | Hardcode field names for scoring | Korean Test — structural signals only |
| AP-6 | Match on language-specific column names | Structural detection |
| AP-13 | Assume schema without checking | Verify reference_data columns in SCHEMA_REFERENCE.md |
| AP-35 | Schema assumption without verification | Query live schema for reference_data |
| Pattern 33 | Script bypass as browser proof | Phase 5B browser test is mandatory |
| NEW | Compute repeat ratio from sample instead of full row count | Use totalRowCount from sheet metadata |
| NEW | Add signals to Content Profile but never read them in agents | Verify agents consume profile values |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-091_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE

### Completion Report Structure
1. **Commits** — all with hashes, one per phase
2. **Files modified** — every changed file
3. **Bug analysis** — what was wrong with identifierRepeatRatio (paste before/after code)
4. **Agent scoring before/after** — Datos_Rendimiento scores pre and post fix
5. **Proof gates** — 25 gates, each PASS/FAIL with pasted evidence
6. **Engine Contract state** — 3-value query after re-import

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ identifierRepeatRatio uses totalRowCount / uniqueValues?
□ Transaction Agent reads numericFieldRatio, dateColumnCount, identifierRepeatRatio?
□ Entity Agent has penalties for transaction-like signals?
□ Classification override dropdown is functional?
□ reference_data key_field populated on insert?
□ Korean Test: zero field name matching in new code?
□ Browser re-import: Datos_Rendimiento classified as Transaction?
□ committed_data has rows after import?
□ Entities have human-readable display_names?
□ npm run build exits 0?
□ localhost:3000 responds?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*HF-091: "201 rows, 50 unique IDs = repeat ratio 4.0, not 1.0. The math was right. The code wasn't doing the math."*
