# HF-095: HC OVERRIDE AUTHORITY + nameSignals ELIMINATION
## Decision 108: Header Comprehension overrides structural detection when confident
## CLT-160 Root Cause: Datos_Flota_Hub misclassified as Transaction (should be Reference)
## Type: Hotfix — P0 Classification accuracy
## Evidence: CLT-160 Trace Diagnostic — three compounding false positives from structural analysis

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/lib/sci/content-profile.ts` — structural type detection
3. `web/src/lib/sci/header-comprehension.ts` — LLM column role assignment
4. `web/src/lib/sci/synaptic-ingestion-state.ts` — scoring pipeline (classifyContentUnits)
5. `web/src/lib/sci/agents.ts` — agent scoring signals
6. `web/src/lib/sci/signatures.ts` — composite signatures
7. `web/src/lib/sci/negotiation.ts` — field affinity rules

---

## WHY THIS HF EXISTS

CLT-160 Trace Diagnostic identified three compounding false positives on Datos_Flota_Hub:

1. **Wrong identifier field** — structural uniqueness picked Capacidad_Total (36/36 unique) over Hub (12/36, below 0.70 threshold). HC knows "Hub" is a reference key, but structural analysis overrules it.
2. **Temporal false positive** — Mes (integers 1-3) and Año (2025) trigger temporal detection. These are dimensional attributes in a reference table, not event timestamps. HC knows "Mes" is a month attribute, but structural analysis treats all small integers in range 1-12 as temporal.
3. **Currency false positive** — "Total" in Capacidad_Total matches AMOUNT_SIGNALS → integer columns typed as currency. This is a Korean Test violation (AP-25/AP-27) — field-name substring matching that Phase C was supposed to eliminate.

**Root architectural issue:** Header comprehension produces correct column roles but has NO authority over structural detection. The LLM correctly understands the data but the scoring pipeline ignores that understanding in favor of structural heuristics that are wrong for this data shape.

**Additionally:** Plantilla classified correctly as Entity but at only 50% confidence (should be 85%+). The trace showed structural-only classification scores Plantilla at 85%, but HC REDUCES it to 50%. HC is actively hurting entity classification — the authority relationship is inverted.

---

## DECISION 108: HC OVERRIDE AUTHORITY

**When header comprehension produces a column role with confidence ≥ 0.80, that role OVERRIDES the Content Profile's structural type detection for that column.**

Specifically:
- If HC says `columnRole: 'reference_key'` → identifier detection uses THAT column as the structural identifier, overriding uniqueness-based detection
- If HC says `columnRole: 'attribute'` on a column that structural analysis flagged as temporal → suppress temporal detection for that column
- If HC says `columnRole: 'identifier'` → that column IS the identifier, regardless of uniqueness ratio
- If HC says `columnRole: 'measure'` with semanticMeaning suggesting capacity/utilization/rate → do NOT classify as transaction amount

**This is not a weight adjustment. This is an authority hierarchy:** LLM contextual understanding > structural heuristic when LLM confidence is high.

**Why HC should have authority:** The LLM has seen millions of data structures in its training. It understands that "Capacidad_Total" is a capacity metric, not a transaction amount. Structural analysis sees "unique integers" and can't distinguish capacity from revenue. The LLM resolves ambiguity that structure cannot.

**Fallback:** When HC is unavailable (no API key, timeout, low confidence < 0.80), structural analysis stands alone — exactly as it does today. HC authority is additive capability, not a dependency.

---

## PHASE 0: DIAGNOSTIC — MAP THE CURRENT AUTHORITY RELATIONSHIPS

```bash
# 1. How does HC currently influence the Content Profile?
grep -B 5 -A 30 "enhanceWithHeaderComprehension\|headerComprehension.*profile\|profile.*headerComprehension\|columnRole.*override\|override.*structural" \
  web/src/lib/sci/content-profile.ts web/src/lib/sci/synaptic-ingestion-state.ts web/src/app/api/import/sci/analyze/route.ts | head -80

# 2. How does HC currently influence agent scoring?
grep -B 5 -A 20 "headerComprehension\|columnRole\|semanticMeaning\|HC\|hc\." \
  web/src/lib/sci/synaptic-ingestion-state.ts web/src/lib/sci/agents.ts | head -60

# 3. Find ALL nameSignals references in scoring logic
grep -rn "nameSignals\|containsId\|containsName\|containsDate\|containsAmount\|containsRate\|containsTarget" \
  web/src/lib/sci/ --include="*.ts" | grep -v "// " | grep -v "test" | grep -v "\.d\.ts"

# 4. Find AMOUNT_SIGNALS and all similar field-name matching patterns
grep -rn "AMOUNT_SIGNALS\|DATE_SIGNALS\|NAME_SIGNALS\|ID_SIGNALS\|RATE_SIGNALS\|TARGET_SIGNALS" \
  web/src/lib/sci/ --include="*.ts" | head -20

# 5. How does identifier detection work?
grep -B 5 -A 30 "detectStructuralIdentifier\|identifierColumn\|findIdentifier\|selectIdentifier" \
  web/src/lib/sci/content-profile.ts | head -50

# 6. How does temporal detection work?
grep -B 5 -A 30 "hasTemporalColumns\|hasDateColumn\|temporal.*detect\|isTemporalColumn" \
  web/src/lib/sci/content-profile.ts | head -50

# 7. How does currency/amount detection work?
grep -B 5 -A 20 "currency\|amount\|AMOUNT\|containsAmount\|isCurrency" \
  web/src/lib/sci/content-profile.ts | head -40

# 8. What is the current scoring step order in classifyContentUnits?
grep -n "Step\|step\|Phase\|phase\|Stage\|stage" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -20

# 9. Where does HC enhancement happen relative to scoring?
grep -n "enhanceWithHeader\|headerComprehension\|Step.*HC\|comprehend" \
  web/src/lib/sci/synaptic-ingestion-state.ts web/src/app/api/import/sci/analyze/route.ts | head -15
```

Paste ALL output. Document:
- How HC currently influences scoring (additive? override? ignored?)
- Every surviving nameSignals reference
- Every field-name matching pattern (AMOUNT_SIGNALS etc.)
- The current identifier detection logic
- The current temporal detection logic
- Where in the pipeline HC enhancement happens

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-095 Phase 0: Diagnostic — HC authority mapping + nameSignals inventory" && git push origin dev`

---

## PHASE 1: HC OVERRIDE IN CONTENT PROFILE

### 1A: Override Identifier Detection

When HC identifies a column as `columnRole: 'identifier'` or `columnRole: 'reference_key'` with confidence ≥ 0.80, use THAT column as the structural identifier — overriding uniqueness-based detection.

```typescript
// In content-profile.ts or wherever identifier detection happens:

// CURRENT: pick column with highest uniqueness ratio above threshold
// NEW: if HC identified an identifier column with high confidence, use it

function detectStructuralIdentifier(
  fields: FieldProfile[],
  headerComprehension?: HeaderComprehension
): string | null {
  // FIRST: check HC for identifier with high confidence
  if (headerComprehension?.interpretations) {
    for (const [colName, interp] of headerComprehension.interpretations) {
      if ((interp.columnRole === 'identifier' || interp.columnRole === 'reference_key')
        && interp.confidence >= 0.80) {
        return colName;  // HC override — contextual understanding wins
      }
    }
  }
  
  // FALLBACK: structural uniqueness detection (existing logic)
  // ... existing code unchanged ...
}
```

### 1B: Override Temporal Detection

When HC identifies a column as `columnRole: 'attribute'` (not `'temporal'`) with confidence ≥ 0.80, suppress temporal detection for that column — even if the values look temporal (integers 1-12).

```typescript
// In temporal detection logic:

// CURRENT: integers 1-12 → possible month → hasTemporalColumns = true
// NEW: if HC says this column is 'attribute' (not 'temporal'), skip it

function isTemporalColumn(
  colName: string,
  values: unknown[],
  headerComprehension?: HeaderComprehension
): boolean {
  // CHECK HC FIRST: if HC says this is NOT temporal, trust it
  if (headerComprehension?.interpretations) {
    const interp = headerComprehension.interpretations.get?.(colName)
      ?? (headerComprehension.interpretations as any)[colName];
    if (interp && interp.confidence >= 0.80 && interp.columnRole !== 'temporal') {
      return false;  // HC says not temporal — override structural detection
    }
  }
  
  // FALLBACK: structural temporal detection (existing logic)
  // ... existing code unchanged ...
}
```

### 1C: Suppress Currency False Positives

When HC identifies a column's semantic meaning as non-monetary (capacity, count, utilization) with confidence ≥ 0.80, do not classify as currency/amount.

### Proof Gates — Phase 1
- PG-01: Phase 0 diagnostic complete, all 9 commands output pasted
- PG-02: Identifier detection checks HC first, falls back to structural
- PG-03: Temporal detection suppressed when HC says 'attribute' (not 'temporal')
- PG-04: Currency detection suppressed when HC says non-monetary measure
- PG-05: All overrides require HC confidence ≥ 0.80
- PG-06: Fallback: when no HC available, structural detection unchanged (no regression)
- PG-07: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-095 Phase 1: HC override authority — identifier, temporal, currency detection" && git push origin dev`

---

## PHASE 2: ELIMINATE REMAINING nameSignals

### 2A: Remove Field-Name Matching Patterns

Based on Phase 0 findings, remove ALL surviving field-name substring matching from the scoring pipeline:

- `AMOUNT_SIGNALS` (matching "total", "amount", etc.) → REMOVE
- `containsAmount` in agent scoring → REPLACE with HC `columnRole: 'measure'` + data distribution
- `containsDate` in agent scoring → REPLACE with HC `columnRole: 'temporal'` or structural temporal detection
- `containsTarget` → Already removed (Decision 100) — VERIFY it stays removed
- `containsName` → REPLACE with HC `columnRole: 'name'` or structural cardinality
- `containsId` → REPLACE with HC `columnRole: 'identifier'` or structural uniqueness

### 2B: What Replaces nameSignals

Each nameSignal has a Korean Test compliant replacement:

| Old (nameSignals) | New (HC + structural) |
|---|---|
| `containsId` | HC `columnRole: 'identifier'` OR structural uniqueness ratio > threshold |
| `containsName` | HC `columnRole: 'name'` OR structural: high cardinality text with name-like distribution |
| `containsDate` | HC `columnRole: 'temporal'` OR structural: date-parseable values |
| `containsAmount` | HC `columnRole: 'measure'` + structural: numeric with currency-like range |
| `containsRate` | HC `columnRole: 'measure'` + structural: numeric 0-1 range (percentage-like) |
| `containsTarget` | REMOVED (Decision 100) |
| `AMOUNT_SIGNALS` | REMOVED entirely — no field-name substring matching |

### 2C: Field Affinity Rules (negotiation.ts)

The FIELD_AFFINITY_RULES in negotiation.ts use `nameSignals` for PARTIAL claim field assignment. These need the same replacement — use HC `columnRole` instead of `containsId`/`containsName`/`containsDate`/`containsAmount`.

### Proof Gates — Phase 2
- PG-08: ZERO `AMOUNT_SIGNALS` / `DATE_SIGNALS` / `NAME_SIGNALS` / field-name matching arrays remain
- PG-09: ZERO `nameSignals.containsAmount` in scoring logic
- PG-10: ZERO `nameSignals.containsDate` in scoring logic (HC or structural temporal replaces)
- PG-11: `nameSignals.containsId` replaced with HC `columnRole: 'identifier'` OR structural fallback
- PG-12: `nameSignals.containsName` replaced with HC `columnRole: 'name'` OR structural fallback
- PG-13: FIELD_AFFINITY_RULES in negotiation.ts use HC columnRole, not nameSignals
- PG-14: Korean Test grep returns ZERO field-name matching in scoring pipeline
- PG-15: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-095 Phase 2: Eliminate nameSignals — replace with HC columnRole + structural fallback" && git push origin dev`

---

## PHASE 3: VERIFY CLASSIFICATION ACCURACY

### 3A: Re-run Trace Diagnostic

After Phases 1-2, re-run the classification trace for all three Meridian sheets to verify:

```bash
# Re-run the trace diagnostic script from CLT-160
# Or add console.log to analyze route and test on localhost

# Expected results after HF-095:
# Plantilla → Entity at ≥ 85% (HC identifies identifier + name columns → Entity signature fires)
# Datos_Rendimiento → Transaction at ≥ 80% (HC identifies temporal + measure columns → Transaction signature fires)
# Datos_Flota_Hub → Reference at ≥ 75% (HC identifies reference_key → identifier is Hub → temporal suppressed → Reference signature fires)
```

### 3B: Verify No Regression on Clear Cases

The fix must not break sheets that already classify correctly:
- PPTX plan content → still classified as Plan
- Clear entity roster (identifier + name + attributes, no temporal) → still Entity
- Clear transaction data (identifier + temporal + measures, high repeat) → still Transaction

### Proof Gates — Phase 3
- PG-16: Datos_Flota_Hub classifies as Reference (not Transaction)
- PG-17: Plantilla classifies as Entity at ≥ 85% confidence (not 50%)
- PG-18: Datos_Rendimiento classifies as Transaction at ≥ 80% confidence
- PG-19: No regression on PPTX plan classification
- PG-20: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-095 Phase 3: Classification accuracy verification — all three sheets correct" && git push origin dev`

---

## PHASE 4: BUILD + VERIFY + PR

### 4A: Build Verification
```bash
kill dev server
rm -rf .next
npm run build
npm run dev
```

### 4B: Korean Test — Final Verification
```bash
# Must return ZERO — the definitive Korean Test check
grep -rn "nameSignals\.\(containsAmount\|containsRate\|containsTarget\)\|AMOUNT_SIGNALS\|DATE_SIGNALS\|NAME_SIGNALS\|TARGET_SIGNALS\|RATE_SIGNALS" \
  web/src/lib/sci/ --include="*.ts" | grep -v "// " | grep -v "test" | grep -v "interface\|type "

# nameSignals.containsId and containsName may still exist as INTERFACE fields
# but must NOT be used in scoring/agent logic — only in structural fallback when HC unavailable
grep -n "nameSignals\.containsId\|nameSignals\.containsName\|nameSignals\.containsDate" \
  web/src/lib/sci/agents.ts web/src/lib/sci/signatures.ts web/src/lib/sci/synaptic-ingestion-state.ts | grep -v "// "
# Should return ZERO in scoring files
```

### 4C: PR Creation
```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-095: HC Override Authority + nameSignals Elimination — Decision 108" \
  --body "## Decision 108: Header Comprehension Override Authority

When HC produces column roles with confidence ≥ 0.80, those roles OVERRIDE structural
type detection. The LLM's contextual understanding of column names is more reliable than
structural heuristics for ambiguous cases.

### Identifier Override
HC identifies reference keys and entity identifiers → used for identifier detection instead
of highest-uniqueness column. Fixes: Datos_Flota_Hub Hub column (12/36 unique) correctly
identified over Capacidad_Total (36/36 unique).

### Temporal Override
HC identifies dimensional attributes (month/year as reference dimensions) → temporal detection
suppressed for those columns. Fixes: Mes/Año in reference tables no longer trigger Transaction.

### Currency Override
HC identifies non-monetary measures (capacity, utilization) → currency classification suppressed.
Fixes: Capacidad_Total no longer classified as transaction amount.

## nameSignals Elimination
All field-name substring matching removed from scoring pipeline:
- AMOUNT_SIGNALS, DATE_SIGNALS, NAME_SIGNALS → REMOVED
- containsAmount, containsDate, containsRate → REPLACED with HC columnRole + structural fallback
- FIELD_AFFINITY_RULES → updated to use HC columnRole

## Results
- Datos_Flota_Hub: Transaction 75% → Reference ≥75% (FIXED)
- Plantilla: Entity 50% → Entity ≥85% (FIXED)
- Datos_Rendimiento: Transaction 98% → Transaction ≥80% (no regression)

## Korean Test
Zero field-name matching in scoring pipeline. Headers understood contextually by LLM,
not matched against dictionaries."
```

### Proof Gates — Phase 4
- PG-21: `npm run build` exits 0
- PG-22: localhost:3000 responds
- PG-23: Korean Test — ZERO field-name matching in scoring pipeline
- PG-24: HC override requires confidence ≥ 0.80
- PG-25: Structural fallback works when HC unavailable
- PG-26: PR created

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-095 Complete: HC Override Authority + nameSignals Elimination" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- HC override in identifier detection (content-profile.ts or wherever identifier is detected)
- HC override in temporal detection (suppress when HC says 'attribute')
- HC override in currency/amount detection (suppress when HC says non-monetary)
- Remove AMOUNT_SIGNALS and all field-name matching arrays
- Replace nameSignals usage in scoring with HC columnRole + structural fallback
- Update FIELD_AFFINITY_RULES in negotiation.ts
- Classification accuracy verification for all 3 Meridian sheets

### OUT OF SCOPE — DO NOT TOUCH
- HC service itself (Phase B — unchanged, it already produces correct column roles)
- Composite signature thresholds (correct mechanism, not the problem)
- Agent score weights (the issue is authority, not weights)
- Convergence (Phase G)
- Execute pipelines (Phase F)
- Flywheel (Phases E/I/J/K/L)
- Calculation engine
- Auth files

### CRITICAL CONSTRAINTS

1. **HC override requires confidence ≥ 0.80.** Low-confidence HC interpretations are treated as additive signals, not overrides. The threshold ensures the LLM is confident before overriding structural analysis.
2. **Structural fallback when HC unavailable.** If no API key, timeout, or HC returns null, the entire structural detection pipeline works exactly as before. HC authority is additive capability, not a dependency.
3. **nameSignals interface may remain as a type.** The `FieldProfile.nameSignals` object may still exist for backward compatibility. But NO scoring logic, NO agent scoring, NO signature matching should READ from it. It's a dead interface — kept for type compatibility, never consumed.
4. **Korean Test final check.** The grep in Phase 4B is the definitive test. ZERO field-name matching patterns in agents.ts, signatures.ts, synaptic-ingestion-state.ts, negotiation.ts.

---

## COMPLETION REPORT ENFORCEMENT

File: `HF-095_COMPLETION_REPORT.md` in PROJECT ROOT.

### Report Structure
1. **Phase 0 diagnostic** — all 9 command outputs, current authority mapping
2. **nameSignals inventory** — every surviving reference, what replaced it
3. **HC override implementation** — paste the override logic for identifier, temporal, currency
4. **Classification trace results** — before/after for all 3 sheets
5. **Korean Test** — paste final grep proving zero field-name matching
6. **Proof gates** — 26 gates, each PASS/FAIL with pasted evidence

---

*HF-095: "The LLM understands that 'Capacidad_Total' is hub capacity, not a transaction amount. The structural analysis sees unique integers and guesses. When the system that UNDERSTANDS disagrees with the system that GUESSES, understanding wins. That's Decision 108."*
