# OB-160 PHASE A: CONTENT PROFILE FOUNDATION
## "The foundation tells the truth"
## SCI Development Plan Phase A of 12 (A through L)
## Target: Current release
## Depends on: OB-159 (PR #181)
## Priority: P0 — Foundation for entire SCI intelligence pipeline

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 1: Content Profile Generation
4. `Vialuce_Synaptic_State_Specification.md` — signal interfaces, synapse types

---

## CONTEXT

### Why This OB Exists

The Content Profile is the foundation of the entire SCI intelligence pipeline. Every layer above it — agent scoring, composite signatures, Round 2 negotiation, tenant context, flywheel signals, convergence — depends on the Content Profile producing accurate structural observations. When the Content Profile lies, everything above it fails.

**The Content Profile is currently lying.** Diagnostic evidence from CLT-158/159:

| Observation | Should Be | Actually Is | Consequence |
|---|---|---|---|
| Mes=1 column type | integer | boolean | Temporal column detection fails → Transaction signature blocked |
| "Monterrey Hub" column | categorical attribute | person name | Entity signature fires on reference data → Datos_Flota_Hub misclassified |
| Datos_Rendimiento temporal | hasTemporalColumns: true | false | Transaction Agent can't compete |
| Plantilla repeat ratio | ~1.34 (entity) | fails ≤1.3 threshold | Entity signature doesn't fire |

### What This OB Is — And What It Is Not

**This IS:** A complete rebuild of the Content Profile's type detection, structural observation, and signal emission capabilities. When this OB is done, every structural observation the Content Profile produces is accurate and every observation is emittable as a signal for the flywheel.

**This is NOT:** Agent scoring changes, signature threshold changes, negotiation changes, or UI changes. Those are Phases B-C. This OB fixes the FOUNDATION that Phases B-L build on.

**This is NOT:** A partial fix. The Content Profile specification says "The Content Profile is additive, not reductive. It observes everything it can and passes all observations forward." After this OB, that statement is TRUE — not aspirational.

### SCI Development Plan Position

```
→ PHASE A: Content Profile Foundation ← YOU ARE HERE
  Phase B: Header Comprehension (LLM contextual understanding)
  Phase C: Agent Scoring + Signatures + Negotiation
  Phase D: Tenant Context
  Phase E: Classification Signals + Flywheel
  Phase F: Execute Pipeline + Routing
  Phase G: Convergence + input_bindings
  Phase H: Field-Level PARTIAL Claims
  Phase I: Cross-Tenant Flywheel
  Phase J: Domain Flywheel
  Phase K: Synaptic Density for SCI
  Phase L: Pattern Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 92 | Temporal binding: source_date on committed_data, period_id nullable, engine binds at calc time | Content Profile observes temporal columns but NEVER creates, identifies, or references periods |
| 93 | Period is a calculation parameter, not navigation context. Import has zero period references. | Remove all `/api/periods` calls from import surface |
| 95 | 100% reconciliation is the only acceptance gate | Content Profile accuracy is prerequisite for correct classification → correct data routing → correct calculation |
| 103 | Probabilistic type scoring replaces sequential waterfall | Implemented in this OB |
| 104 | Temporal detection is type-agnostic — check raw values regardless of dataType | Implemented in this OB |
| 105 | Person-name detection requires cardinality computed against identifier uniqueness | Implemented in this OB |
| 25 | Korean Test — ALL field identification uses structural heuristics, NEVER field-name matching | Content Profile detection logic uses value patterns, cardinality, distributions. Zero language-specific strings. |

---

## PHASE 0: DIAGNOSTIC — READ THE CURRENT CODE

Before changing anything, understand exactly what exists.

### 0A: Read the Content Profile Generator

```bash
echo "=== CONTENT PROFILE GENERATOR ==="
cat web/src/lib/sci/content-profile.ts

echo ""
echo "=== SCI TYPES ==="
cat web/src/lib/sci/sci-types.ts

echo ""
echo "=== HOW CONTENT PROFILE IS CALLED ==="
grep -rn "generateContentProfile\|ContentProfile" web/src/app/api/import/sci/ --include="*.ts" | head -20

echo ""
echo "=== PERIOD API CALLS IN IMPORT SURFACE ==="
grep -rn "api/periods\|/periods" web/src/app/operate/import/ --include="*.tsx" --include="*.ts" | head -10
grep -rn "api/periods\|/periods" web/src/components/sci/ --include="*.tsx" --include="*.ts" | head -10
```

**Read content-profile.ts COMPLETELY.** Understand:
1. The function signature and parameters
2. How each column's dataType is determined (the sequential waterfall)
3. Where boolean detection fires
4. Where temporal/date detection happens
5. Where person-name detection happens
6. Where cardinality is computed and against what
7. What structural metrics are produced (numericFieldRatio, identifierRepeatRatio, etc.)
8. What the output ContentProfile structure looks like

### 0B: Identify All Issues

After reading, document:
- Where the boolean waterfall claims columns before integer detection
- Where temporal detection filters by dataType
- Where person-name detection uses total-row cardinality instead of identifier-relative cardinality
- Where `/api/periods` is called from the import surface
- What signal interfaces exist (if any)
- What structural metrics are missing or incorrectly computed

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Phase 0: Diagnostic — Content Profile current state" && git push origin dev`

---

## PHASE 1: PROBABILISTIC TYPE SCORING

### What Changes

Replace the sequential waterfall (check boolean FIRST → if not, check integer → if not, check decimal → ...) with simultaneous plausibility scoring for all types.

### The Principle

Every column is evaluated against ALL possible types simultaneously. Each type receives a plausibility score. The highest plausibility wins. There is no ordering bias — boolean can't claim a column before integer has a chance to score.

### Implementation

Create a new function `classifyColumnType` that replaces the existing sequential detection:

```typescript
interface TypeClassification {
  dataType: string;           // winning type
  confidence: number;         // winning score
  allScores: Record<string, number>;  // all type scores for transparency/signals
}

function classifyColumnType(
  values: unknown[],
  totalRowCount: number
): TypeClassification {
  const nonNull = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonNull.length === 0) return { dataType: 'text', confidence: 1.0, allScores: { text: 1.0 } };
  
  const scores: Record<string, number> = {
    boolean: scoreBooleanPlausibility(nonNull),
    integer: scoreIntegerPlausibility(nonNull),
    decimal: scoreDecimalPlausibility(nonNull),
    percentage: scorePercentagePlausibility(nonNull),
    date: scoreDatePlausibility(nonNull),
    text: scoreTextPlausibility(nonNull),
  };
  
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    dataType: sorted[0][0],
    confidence: sorted[0][1],
    allScores: scores,
  };
}
```

### Plausibility Scorers — Critical Rules

**Boolean plausibility:**
```
- ALL values must be in {0, 1, true, false, yes, no, si, sí}
- CRITICAL: Must have BOTH true-like AND false-like values present
  - true-like: 1, true, yes, si, sí
  - false-like: 0, false, no
- If only ONE side present (all 1s, all 0s): score = 0.20 (low — probably constant integer)
- If BOTH sides present: score = 0.95 (high — genuine boolean)
- If NOT all values are boolean-like: score = 0
```

**Integer plausibility:**
```
- ≥80% of values must parse as integers (Number(v), isInteger)
- Base score: 0.80
- Boost +0.10 if range > 1 (not just 0-1)
- Boost +0.05 if distinctCount > 2 (not binary)
- Max: 1.0
- A column of all-1s: integer scores 0.80, boolean scores 0.20 → INTEGER WINS
```

**Decimal plausibility:**
```
- ≥80% of values parse as numbers
- At least one value has decimal places
- Score: 0.85 if decimal values present, 0 otherwise
```

**Percentage plausibility:**
```
- Values with % sign: 0.95
- Values in [0, 1] range with decimals: 0.70
- Values in [0, 100] range: 0.40 (ambiguous — could be anything)
```

**Date plausibility:**
```
- ISO format (YYYY-MM-DD): 0.95
- MM/DD/YYYY or DD/MM/YYYY: 0.85
- Excel serial dates (30000-60000): 0.80
- Otherwise: 0
```

**Text plausibility:**
```
- >50% of values are non-numeric strings: 0.70
- Otherwise: 0.10 (baseline — text is the fallback)
```

### Replace in generateContentProfile

Find where the current sequential detection runs and replace with `classifyColumnType`. The result `allScores` should be preserved on the FieldProfile for signal emission.

### Proof Gates — Phase 1
- PG-1: `classifyColumnType` function exists with simultaneous scoring
- PG-2: Boolean scorer requires BOTH true-like and false-like values for high confidence (paste code)
- PG-3: Column of all-1s → integer wins over boolean (paste score comparison)
- PG-4: Column with {0, 1, 0, 1, 1, 0} → boolean wins over integer (paste score comparison)
- PG-5: `allScores` preserved on FieldProfile for signal emission
- PG-6: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Phase 1: Probabilistic type scoring — simultaneous plausibility, boolean requires both values" && git push origin dev`

---

## PHASE 2: TEMPORAL COLUMN DETECTION (Decision 92/93 Compliant)

### What Changes

1. Temporal column detection checks RAW NUMERIC VALUES regardless of classified dataType
2. All references to "period" in import context removed
3. `/api/periods` calls removed from import surface
4. Property renamed: `hasPeriodMarkers` → `hasTemporalColumns`

### The Principle (Decision 92/93)

The Content Profile observes that time-relevant data exists in a column. This is a structural observation: "this column contains values that represent points in time or temporal groupings."

**It does NOT:**
- Identify periods
- Create periods
- Reference period definitions
- Call any period API

**It DOES:**
- Observe that a column contains temporal values (dates, month numbers, year numbers)
- Set `hasTemporalColumns: true` on the ContentProfile patterns
- Enable downstream layers (signatures, agents) to know temporal data exists

### Implementation

```typescript
function detectTemporalColumns(
  fields: FieldProfile[],
  sampleRows: Record<string, unknown>[]
): { hasTemporalColumns: boolean; temporalColumnIndices: number[] } {
  
  const temporalIndices: number[] = [];
  let hasDateTypedColumn = false;
  let hasYearValues = false;
  let hasSmallRangeIntegers = false;  // could be months, quarters, etc.
  
  for (const field of fields) {
    // Check 1: Column classified as date type → temporal
    if (field.dataType === 'date') {
      temporalIndices.push(field.fieldIndex);
      hasDateTypedColumn = true;
      continue;
    }
    
    // Check 2: RAW NUMERIC VALUES regardless of dataType
    // This catches Mes=1 even if classified as boolean
    const rawValues = sampleRows
      .map(row => row[field.fieldName])
      .filter(v => v !== null && v !== undefined)
      .map(v => Number(v))
      .filter(v => !isNaN(v) && Number.isInteger(v));
    
    if (rawValues.length < sampleRows.length * 0.5) continue;  // not mostly numeric integers
    
    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const distinct = new Set(rawValues).size;
    
    // Year-range values: integers in [2000, 2040] with low distinct count
    if (min >= 2000 && max <= 2040 && distinct <= 10) {
      temporalIndices.push(field.fieldIndex);
      hasYearValues = true;
    }
    
    // Small-range integers that could represent months (1-12) or quarters (1-4)
    // Note: a column of all-1s still passes this check (min=1, max=1, range [1,12])
    // That's correct — even January-only data has temporal significance
    if (min >= 1 && max <= 12 && distinct <= 12) {
      temporalIndices.push(field.fieldIndex);
      hasSmallRangeIntegers = true;
    }
  }
  
  return {
    hasTemporalColumns: hasDateTypedColumn || hasYearValues || hasSmallRangeIntegers,
    temporalColumnIndices: [...new Set(temporalIndices)],
  };
}
```

### Remove Period References from Import Surface

```bash
# Find and remove all /api/periods calls from import-related pages
grep -rn "api/periods\|/periods\|usePeriod\|PeriodContext\|period-context" \
  web/src/app/operate/import/ --include="*.tsx" --include="*.ts"
grep -rn "api/periods\|/periods\|usePeriod\|PeriodContext\|period-context" \
  web/src/components/sci/ --include="*.tsx" --include="*.ts"
```

Remove all period API calls, period context usage, and period-related imports from the import surface. The import experience has ZERO period awareness per Decision 93.

### Rename Property

In `sci-types.ts` and everywhere `hasPeriodMarkers` is referenced:
- Rename `hasPeriodMarkers` → `hasTemporalColumns`
- Update all consumers (agents.ts, signatures.ts, negotiation.ts, analyze route)

### Proof Gates — Phase 2
- PG-7: `detectTemporalColumns` checks raw numeric values regardless of dataType (paste code)
- PG-8: Mes=1 column (classified as boolean or integer) is detected as temporal (test with sample data)
- PG-9: Año=2025 column detected as temporal year-range
- PG-10: Property is `hasTemporalColumns` — zero references to `hasPeriodMarkers` remain (grep)
- PG-11: Zero `/api/periods` calls in import surface (grep returns zero)
- PG-12: Zero `PeriodContext` or `usePeriod` in import surface (grep returns zero)
- PG-13: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Phase 2: Temporal column detection — type-agnostic, Decision 92/93 compliant, zero period references" && git push origin dev`

---

## PHASE 3: IDENTIFIER-RELATIVE CARDINALITY

### What Changes

All cardinality-based detection (person-name, categorical attribute, structural column classification) uses cardinality RELATIVE TO THE IDENTIFIER COLUMN, not relative to total rows.

### The Principle

A name column has approximately the same number of distinct values as the identifier column — because each person has a unique name and a unique ID. A categorical column (hub, department, role) has far fewer distinct values than the identifier column — because many people share the same hub/department/role.

This distinction holds at ANY scale:
- 10 people, 100K rows: nameCardinality = 10/10 = 1.0 → name column ✅
- 10 people, 100K rows: hubCardinality = 5/10 = 0.50 → maybe categorical
- 10 people, 100K rows: hubCardinality = 3/10 = 0.30 → categorical attribute, NOT name
- 50 people, 200 rows: nameCardinality = 50/50 = 1.0 → name column ✅
- 50 people, 200 rows: hubCardinality = 12/50 = 0.24 → categorical attribute ✅

### Implementation

```typescript
function computeIdentifierRelativeCardinality(
  columnDistinctCount: number,
  identifierDistinctCount: number
): number {
  if (identifierDistinctCount === 0) return 0;
  return columnDistinctCount / identifierDistinctCount;
}
```

Apply to `detectPersonNameColumn` (previously used totalRow-based uniqueRatio):

```typescript
function detectStructuralNameColumn(
  fields: FieldProfile[],
  sampleRows: Record<string, unknown>[],
  identifierField: FieldProfile | null
): string | null {
  if (!identifierField) return null;
  
  const idDistinct = identifierField.distinctCount;
  if (idDistinct === 0) return null;
  
  let bestCandidate: string | null = null;
  let bestScore = 0;
  
  for (const field of fields) {
    if (field === identifierField) continue;  // skip the ID column itself
    if (field.dataType !== 'text' && field.dataType !== 'mixed') continue;  // names are text
    
    const values = sampleRows
      .map(r => String(r[field.fieldName] || ''))
      .filter(v => v.length > 0);
    if (values.length === 0) continue;
    
    // CARDINALITY relative to identifier
    const nameCardinality = computeIdentifierRelativeCardinality(field.distinctCount, idDistinct);
    if (nameCardinality < 0.50) continue;  // fewer unique values than half the entities → categorical
    
    let score = 0;
    
    // Non-numeric (names aren't numbers)
    const nonNumericRatio = values.filter(v => isNaN(Number(v))).length / values.length;
    if (nonNumericRatio > 0.90) score += 3;
    else continue;  // mostly numeric → not names
    
    // Multi-word (names have spaces)
    const spaceRatio = values.filter(v => v.includes(' ')).length / values.length;
    if (spaceRatio > 0.50) score += 3;
    
    // Average word count (names are multi-word)
    const avgWords = values.reduce((sum, v) => sum + v.split(/\s+/).length, 0) / values.length;
    if (avgWords >= 1.8) score += 2;
    
    // High cardinality relative to identifier (near 1:1 with entities)
    if (nameCardinality > 0.80) score += 2;
    
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = field.fieldName;
    }
  }
  
  return bestScore >= 5 ? bestCandidate : null;
}
```

### Update categoricalFieldRatio

Categorical fields are text columns with LOW cardinality relative to the identifier:

```typescript
const categoricalFields = fields.filter(f => {
  if (f.dataType !== 'text' && f.dataType !== 'mixed') return false;
  const relativeCardinality = computeIdentifierRelativeCardinality(f.distinctCount, idDistinct);
  return relativeCardinality < 0.50;  // fewer unique values than half the entities
});
const categoricalFieldRatio = categoricalFields.length / fields.length;
const categoricalFieldCount = categoricalFields.length;
```

### Proof Gates — Phase 3
- PG-14: `computeIdentifierRelativeCardinality` function exists (paste code)
- PG-15: Name detection uses identifier-relative cardinality, not total-row uniqueRatio
- PG-16: 10 unique names with 10 unique IDs across 100K rows → nameCardinality = 1.0 → detected as name
- PG-17: 12 unique hub names with 50 unique IDs → nameCardinality = 0.24 → NOT detected as name
- PG-18: "Monterrey Hub" (12 unique values, 50 unique IDs) rejected as person name
- PG-19: "Ana García López" (50 unique values, 50 unique IDs) accepted as person name
- PG-20: categoricalFieldRatio uses identifier-relative cardinality
- PG-21: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Phase 3: Identifier-relative cardinality — name detection, categorical detection, scale-independent" && git push origin dev`

---

## PHASE 4: SIGNAL INTERFACE + STRUCTURAL METRICS

### What Changes

1. Every structural observation emitted as a `ProfileObservation` signal
2. All structural metrics verified accurate
3. Entity signature threshold updated to ≤1.5

### Signal Interface

The Content Profile is designed to feed the flywheel. Every structural determination is a signal. Phase A defines the EMISSION interface; Phase E wires the storage.

```typescript
interface ProfileObservation {
  columnName: string | null;          // null for sheet-level observations
  observationType: string;            // 'type_classification', 'temporal_detection', 'name_detection', 'cardinality', etc.
  observedValue: unknown;             // the determination
  confidence: number;                 // how confident (from type scorer or detector)
  alternativeInterpretations: Record<string, number>;  // other plausible types/interpretations with scores
  structuralEvidence: string;         // why this determination was made
}
```

Add to ContentProfile:

```typescript
interface ContentProfile {
  // ... existing fields ...
  observations: ProfileObservation[];  // every structural determination, emittable as signal
}
```

Every determination in the Content Profile generator should create a `ProfileObservation`:
- Type classification: `{ columnName: "Mes", observationType: "type_classification", observedValue: "integer", confidence: 0.90, alternativeInterpretations: { boolean: 0.20, text: 0.05 }, structuralEvidence: "all values parse as integers, only one value present" }`
- Temporal detection: `{ columnName: "Mes", observationType: "temporal_detection", observedValue: true, confidence: 0.70, structuralEvidence: "integer values in range [1, 12], potential month indicator" }`
- Name detection: `{ columnName: "Nombre_Completo", observationType: "name_detection", observedValue: true, confidence: 0.85, structuralEvidence: "nameCardinality 1.0, non-numeric, multi-word, avg 2.3 words" }`

### Structural Metrics Verification

Verify these metrics are computed correctly after all Phase 1-3 changes:

- `numericFieldRatio`: columns where ≥80% of values parse as numbers / total columns
- `categoricalFieldRatio`: text columns with identifier-relative cardinality < 0.50 / total columns
- `categoricalFieldCount`: count of categorical text columns
- `identifierRepeatRatio`: totalRowCount / distinctIdentifierValues
- `volumePattern`: single (≤1.5), few (1.5-3.0), many (>3.0) — NOTE: threshold matches transaction signature (>1.5)
- `hasTemporalColumns`: from Phase 2 temporal detection
- `hasStructuralNameColumn`: from Phase 3 name detection
- `hasEntityIdentifier`: column with sequential/patterned values, high uniqueness

### Entity Signature Threshold

In `signatures.ts`, update entity signature:
```
identifierRepeatRatio <= 1.5 (was <= 1.3)
```
This closes the gap between entity (≤1.5) and transaction (>1.5) signatures. No content unit falls into a gap.

### Proof Gates — Phase 4
- PG-22: `ProfileObservation` interface defined
- PG-23: Content Profile includes `observations: ProfileObservation[]`
- PG-24: Type classification produces observation with allScores as alternativeInterpretations
- PG-25: Temporal detection produces observation with structural evidence
- PG-26: Name detection produces observation with cardinality evidence
- PG-27: Entity signature threshold ≤1.5 in signatures.ts
- PG-28: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Phase 4: Signal interface + structural metrics verification + entity signature threshold" && git push origin dev`

---

## PHASE 5: REMOVE DIAGNOSTIC LOGGING + BUILD + VERIFY

### 5A: Remove All Diagnostic Logging

Remove ALL temporary `console.log` statements added during HF-091 and OB-159 debugging:
```bash
grep -rn "\[SCI PeriodCheck\]\|\[SCI PeriodResult\]\|\[SCI PersonName\]\|\[SCI SigCheck\]\|\[SCI Signatures\]\|\[SCI Round1\]\|\[SCI Floor\]\|\[SCI Round2\]\|\[SCI Profile\]\|\[SCI Ratio\]" \
  web/src/lib/sci/ web/src/app/api/import/ --include="*.ts" --include="*.tsx"
```
Remove all of them. Production logging should be `[SCI]` prefixed warnings/errors for actual failures only.

### 5B: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 5C: Content Profile Verification on localhost

Upload Meridian_Datos_Q1_2025.xlsx on localhost. Check server logs for the Content Profile output. Verify:

1. **Datos_Rendimiento:**
   - Mes column: dataType = integer (NOT boolean)
   - hasTemporalColumns = true
   - identifierRepeatRatio ≈ 4.0
   - numericFieldRatio ≈ 0.61
   - No "period" references in profile

2. **Plantilla:**
   - identifierRepeatRatio ≈ 1.34 (within ≤1.5 entity signature range)
   - hasStructuralNameColumn = true (Nombre_Completo)
   - hasTemporalColumns: depends on whether Fecha_Ingreso is detected as temporal

3. **Datos_Flota_Hub:**
   - hasStructuralNameColumn = false (Hub names have low nameCardinality)
   - categoricalFieldRatio > 0.25

**NOTE:** This phase verifies Content Profile accuracy only. Classification results may or may not change — that's Phase C's responsibility. Phase A ensures the foundation is accurate.

### Proof Gates — Phase 5
- PG-29: All diagnostic logging removed (grep returns zero)
- PG-30: `npm run build` exits 0
- PG-31: localhost:3000 responds
- PG-32: Datos_Rendimiento Mes column classified as integer (not boolean)
- PG-33: Datos_Rendimiento hasTemporalColumns = true
- PG-34: Datos_Flota_Hub hasStructuralNameColumn = false
- PG-35: Plantilla hasStructuralNameColumn = true

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Phase 5: Remove diagnostic logging + Content Profile verification" && git push origin dev`

---

## PHASE 6: PR CREATION

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160A: Content Profile Foundation — Probabilistic Type Scoring + Temporal Detection + Identifier-Relative Cardinality" \
  --body "Phase A of 12-phase SCI Development Plan. Rebuilds the Content Profile foundation that all SCI intelligence layers depend on.

## What Changed

### 1. Probabilistic Type Scoring (Decision 103)
Sequential waterfall replaced with simultaneous plausibility scoring.
Boolean requires BOTH true-like AND false-like values for high confidence.
Column of all-1s: integer 0.80 > boolean 0.20. Fixes Mes=1 misclassification.

### 2. Temporal Column Detection (Decision 92/93 compliant)
Type-agnostic: checks raw numeric values regardless of classified dataType.
Property renamed: hasPeriodMarkers → hasTemporalColumns.
Zero period references in import surface. /api/periods calls removed.
Temporal observation only — no period creation, identification, or binding.

### 3. Identifier-Relative Cardinality (Decision 105)
nameCardinality = distinctNames / distinctIdentifiers (NOT distinctNames / totalRows).
Works at any scale: 10 names across 100K rows with 10 unique IDs = 1.0 = name column.
'Monterrey Hub' (12/50 = 0.24) rejected. 'Ana García' (50/50 = 1.0) accepted.

### 4. Signal Interface
ProfileObservation interface defined. Every structural determination emittable as signal.
Foundation for Phase E flywheel — signal emission designed from inception.

## Implementation Completeness
SCI Spec Layer 1 says: 'The Content Profile is additive, not reductive. It observes everything and passes all observations forward.'
After this OB, that statement is true. The Content Profile tells the truth.

## What This Does NOT Change
- Agent scoring (Phase C)
- Composite signatures (Phase C)
- Round 2 negotiation (Phase C)
- Classification outcome (may change as a consequence of accurate profile, but not directly modified)
- Execute pipeline (Phase F)
- UI components"
```

### Proof Gates — Phase 6
- PG-36: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160A Complete: Content Profile Foundation" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Probabilistic type scoring (replace sequential waterfall)
- Temporal column detection (type-agnostic, Decision 92/93 compliant)
- Remove `/api/periods` calls from import surface
- Rename `hasPeriodMarkers` → `hasTemporalColumns` everywhere
- Identifier-relative cardinality for name and categorical detection
- ProfileObservation signal interface
- Entity signature threshold ≤1.5
- Structural metrics verification
- Diagnostic logging cleanup

### OUT OF SCOPE — DO NOT TOUCH
- Agent scoring weights or signals (Phase C)
- Composite signature conditions (except entity threshold)
- Round 2 negotiation logic (Phase C)
- Header comprehension / LLM calls (Phase B)
- Classification signal storage (Phase E)
- Execute pipeline / routing (Phase F)
- Convergence / input_bindings (Phase G)
- Auth files
- Calculation engine
- UI components beyond removing period references from import
- Any Supabase migrations

### CRITICAL CONSTRAINTS

1. **Decision 92/93:** ZERO period references in import code. Temporal columns are observed. Periods are not. The engine handles period binding at calculation time.
2. **Korean Test:** ZERO field-name matching in type detection or structural observation. All detection uses value patterns, cardinality ratios, distributions.
3. **Cardinality is ALWAYS relative to identifier column.** Never divide by total rows for name/categorical detection.
4. **Boolean requires BOTH values.** A column of all-1s is integer, not boolean. A column of all-0s is integer, not boolean.
5. **Temporal detection checks RAW VALUES.** Does not filter by dataType. If the value is the number 1 and falls in range [1,12], it's potentially temporal regardless of whether the column was classified as boolean, integer, or text.
6. **Signal interface is EMISSION only in Phase A.** ProfileObservations are collected on the ContentProfile. They are NOT stored to database in this phase — that's Phase E.
7. **Do NOT change agent scoring.** Phase A fixes the foundation. Phase C fixes the scoring. Separation is intentional — we verify the foundation is correct before building scoring on top of it.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-5 | Hardcode field names | Korean Test — value patterns only |
| AP-25 | Korean Test violation | Zero language-specific strings in detection logic |
| NEW | Sequential type waterfall | Probabilistic scoring — all types simultaneous |
| NEW | Boolean claims integers | Require both true-like and false-like values |
| NEW | Temporal filtered by dataType | Check raw numeric values regardless |
| NEW | Cardinality against total rows | Always relative to identifier column |
| NEW | Period references in import | Decision 92/93 — zero period awareness |
| NEW | Signal interface retrofitted later | Designed at foundation, emitted from Phase A |

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification Layer 1 says:**
- "The Content Profile is a structural observation of each content unit. It is deterministic — no AI, no interpretation. It observes everything and judges nothing."
- "The Content Profile is additive, not reductive. It observes everything it can and passes all observations forward."
- "It does not filter, interpret, or exclude."

**This OB delivers:**
- ✅ Structural observation of every column (probabilistic type scoring)
- ✅ Temporal column detection without interpretation (observes temporal values, doesn't create periods)
- ✅ Additive observation (ProfileObservation captures all determinations with alternatives)
- ✅ No filtering (temporal detection doesn't filter by dataType)
- ✅ No exclusion (boolean detection doesn't exclude integer interpretation)

**This OB does NOT deliver (by design — subsequent phases):**
- Header comprehension (Phase B — requires LLM, which is Layer 1 ENHANCED)
- Agent scoring (Phase C — Layer 2)
- Tenant context (Phase D — Layer 3 Tier 2)
- Signal storage (Phase E — Layer 6)

**The gap between this OB and the full Layer 1 specification is: header comprehension (Phase B).** Phase B enhances the Content Profile with LLM-interpreted header meanings. This OB provides the structural foundation that Phase B builds on.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160A_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE

### Completion Report Structure
1. **Phase 0 Diagnostic** — what was found in current content-profile.ts (issues list)
2. **Architecture Decisions** — 103, 104, 105 applied
3. **Commits** — all with hashes, one per phase
4. **Files modified** — every changed file
5. **Type detection before/after** — Mes column: boolean (before) → integer (after) with scores
6. **Temporal detection before/after** — Datos_Rendimiento: false (before) → true (after)
7. **Name detection before/after** — "Monterrey Hub": name (before) → categorical (after)
8. **Signal interface** — ProfileObservation examples from actual Meridian data
9. **Proof gates** — 36 gates, each PASS/FAIL with pasted evidence
10. **Implementation Completeness Gate** — specification vs delivered vs gap

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ Sequential type waterfall replaced with probabilistic scoring?
□ Boolean requires BOTH true-like AND false-like values?
□ Column of all-1s classified as integer (not boolean)?
□ Temporal detection checks raw values regardless of dataType?
□ Zero references to 'hasPeriodMarkers' remain?
□ hasTemporalColumns used everywhere?
□ Zero /api/periods calls in import surface?
□ Zero PeriodContext/usePeriod in import surface?
□ Cardinality computed against identifier distinctCount (not total rows)?
□ 'Monterrey Hub' rejected as person name?
□ ProfileObservation interface defined and populated?
□ Entity signature threshold ≤ 1.5?
□ All diagnostic logging removed?
□ Korean Test: zero field-name matching in detection logic?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate included in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160A: "The foundation tells the truth. When it lies, everything above it fails. When it's accurate, the signatures fire, the negotiation resolves, and the classification is correct — because the intelligence was always in the architecture. It just needed accurate observations to work with."*
