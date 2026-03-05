# OB-159: UNIFIED SCI SCORING OVERHAUL
## Composite Signatures + Korean Test Cleanup + Round 2 Negotiation
## Target: Current release
## Depends on: HF-091 (PR #180), OB-158 (PR #179)
## Priority: P0 — Blocks Meridian pipeline proof (MX$185,063)
## Estimated Duration: 8-12 hours

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture (especially Layer 4: Negotiation Protocol)

---

## CONTEXT

### The Problem Is Systemic, Not Surgical

Meridian's Datos_Rendimiento (201 rows, 50 employees × ~4 months, 61% numeric, period markers Mes+Año) is classified as **target (70%)** instead of **transaction**. Three prior fixes (OB-158, HF-091, HF-091 deployment) failed to resolve this because they patched individual signals without addressing the architectural issues:

1. **Additive scoring without interaction** — signals contribute independently; the combination of repeat ratio + period markers + numeric density should be overwhelming but each adds its small weight alone
2. **Korean Test violations in nameSignals** — Target Agent's strongest signal (+0.25 `containsTarget`) matches field names like "meta", "target", "objetivo" — field-name matching, not structural
3. **No Round 2 negotiation** — agents score independently and never see each other's scores, so the Target Agent can't learn that 4.0 repeat ratio is structurally inconsistent with target data
4. **Row count categories ignore entity count** — 201 rows is "moderate" regardless of whether it's 201 unique people or 50 people × 4 months
5. **Five derivative scenarios will break the same way** — quarterly targets, monthly roster snapshots, single-month transactions, dated reference data

### Why This Is One OB, Not Three

The composite signatures, Korean Test cleanup, and Round 2 negotiation are one system. Shipping them separately created the current problem — each piece was designed but the gaps between them became the bugs. They must ship as one unit with one proof gate: **Meridian's three sheets classify correctly without manual intervention.**

### What Must Be True After OB-159

1. **Composite structural signatures** fire before additive weights and set confidence floors
2. **Zero field-name matching** in agent scoring — all `nameSignals.containsTarget/containsId/containsName/containsAmount` replaced with structural equivalents
3. **Round 2 negotiation** — agents see each other's Round 1 scores and adjust
4. **Rows-per-entity** replaces absolute `rowCountCategory` as the primary volume signal
5. **Datos_Rendimiento classified as Transaction** at ≥75% confidence
6. **Plantilla classified as Entity** at ≥90% confidence
7. **Datos_Flota_Hub classified as Reference** at ≥90% confidence
8. **Zero regression** on any previously correct classification
9. **committed_data populated** with entity_ids and source_dates after import

---

## ARCHITECTURE DECISION GATE

```
DECISION: How should SCI agent scoring work?

Option A: Continue tuning individual signal weights
  - Failed three times (OB-158, HF-091, HF-091 deploy)
  - Each fix shifts one boundary but creates new edge cases
  - Additive weights can't express "this combination of signals is definitive"
  REJECTED: Proven failure pattern

Option B: Composite signatures + Korean Test cleanup + Round 2 negotiation (unified)
  - Composite signatures: when multiple structural signals align, set a confidence floor
  - Korean Test cleanup: replace all field-name matching with structural equivalents
  - Round 2 negotiation: agents see each other's scores and adjust (specification Layer 4)
  - Rows-per-entity: volume signal that accounts for entity count
  - Ships as one unit — no gaps between pieces
  CHOSEN: Addresses root causes, not symptoms

CHOSEN: Option B — unified scoring overhaul
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Phase 0: Architecture decision — unified SCI scoring overhaul" && git push origin dev`

---

## PHASE 1: COMPOSITE STRUCTURAL SIGNATURES

### 1A: Create Signature Detection

Create a new function that runs BEFORE the additive weight scoring. If a content unit matches a composite signature, the matching agent gets a confidence floor that individual signals cannot undermine.

### File: `web/src/lib/sci/signatures.ts` (NEW)

```typescript
/**
 * Composite Structural Signatures
 * 
 * A signature is a combination of structural properties that, together,
 * identify a content type with high confidence. When multiple signals
 * all point the same direction, that's not a close call — it's a fingerprint.
 * 
 * Signatures fire BEFORE additive weights. If a signature matches,
 * the agent gets a minimum confidence floor.
 * 
 * Korean Test: ALL signature conditions use structural properties
 * from the ContentProfile. Zero field-name matching.
 */

export interface SignatureMatch {
  agent: AgentType;
  confidence: number;        // minimum confidence floor
  signatureName: string;     // human-readable name for reasoning
  matchedConditions: string[]; // which structural conditions matched
}

export function detectSignatures(profile: ContentProfile): SignatureMatch[] {
  const matches: SignatureMatch[] = [];
  
  // ────────────────────────────────────────────────────────
  // TRANSACTION SIGNATURE
  // "Repeated entities over time with numeric measurements"
  // ────────────────────────────────────────────────────────
  // 
  // Conditions (ALL must be true):
  //   1. identifierRepeatRatio > 1.5 (same entities appear multiple times)
  //   2. hasPeriodMarkers OR hasDateColumn (temporal dimension exists)
  //   3. numericFieldRatio > 0.40 (data-heavy, not attribute-heavy)
  //
  // Structural reasoning: If the same entity IDs repeat across rows
  // AND there's a time dimension AND most fields are numeric measurements,
  // this is operational data recorded over time — transactions.
  // Targets don't repeat 4x for the same entity. Rosters don't have
  // 60% numeric fields. Plans don't have entity IDs repeating.
  
  const hasHighRepeat = profile.structure.identifierRepeatRatio > 1.5;
  const hasTemporalDimension = profile.patterns.hasDateColumn || profile.patterns.hasPeriodMarkers;
  const isDataHeavy = profile.structure.numericFieldRatio > 0.40;
  
  if (hasHighRepeat && hasTemporalDimension && isDataHeavy) {
    matches.push({
      agent: 'transaction',
      confidence: 0.80,
      signatureName: 'repeated_entities_over_time',
      matchedConditions: [
        `identifierRepeatRatio: ${profile.structure.identifierRepeatRatio.toFixed(1)} (>1.5)`,
        `temporal: ${profile.patterns.hasDateColumn ? 'date column' : 'period markers'}`,
        `numericFieldRatio: ${(profile.structure.numericFieldRatio * 100).toFixed(0)}% (>40%)`,
      ],
    });
  }
  
  // ────────────────────────────────────────────────────────
  // ENTITY SIGNATURE
  // "One row per unique individual with categorical attributes"
  // ────────────────────────────────────────────────────────
  //
  // Conditions (ALL must be true):
  //   1. identifierRepeatRatio ≤ 1.3 (one row per entity)
  //   2. categoricalFieldRatio > 0.35 (attribute-heavy)
  //   3. hasEntityIdentifier (has an ID column)
  //   4. hasStructuralNameColumn (has a name-like column — structural, not field-name)
  //
  // Structural reasoning: If each entity ID appears once,
  // most fields are categorical text, there's an ID column
  // and a name column, this is a roster/personnel list.
  
  const hasLowRepeat = profile.structure.identifierRepeatRatio <= 1.3;
  const isCategoricalHeavy = profile.structure.categoricalFieldRatio > 0.35;
  const hasId = profile.patterns.hasEntityIdentifier;
  const hasName = profile.patterns.hasStructuralNameColumn;
  
  if (hasLowRepeat && isCategoricalHeavy && hasId && hasName) {
    matches.push({
      agent: 'entity',
      confidence: 0.85,
      signatureName: 'one_per_entity_with_attributes',
      matchedConditions: [
        `identifierRepeatRatio: ${profile.structure.identifierRepeatRatio.toFixed(1)} (≤1.3)`,
        `categoricalFieldRatio: ${(profile.structure.categoricalFieldRatio * 100).toFixed(0)}% (>35%)`,
        `hasEntityIdentifier: true`,
        `hasStructuralNameColumn: true`,
      ],
    });
  }
  
  // ────────────────────────────────────────────────────────
  // TARGET SIGNATURE
  // "Per-entity numeric benchmarks without temporal repetition"
  // ────────────────────────────────────────────────────────
  //
  // Conditions (ALL must be true):
  //   1. identifierRepeatRatio ≤ 1.5 (one row per entity, maybe one per period)
  //   2. numericFieldRatio > 0.30 (has metric/goal columns)
  //   3. hasEntityIdentifier (links to entities)
  //   4. NOT hasTemporalDimension (static reference, not time-series)
  //
  // Structural reasoning: Per-entity goals are set once.
  // They don't repeat across months (that would be actuals).
  // They have numeric values but no time series.
  
  const targetNoTemporal = !hasTemporalDimension;
  const hasModerateNumeric = profile.structure.numericFieldRatio > 0.30;
  const targetLowRepeat = profile.structure.identifierRepeatRatio <= 1.5;
  
  if (targetLowRepeat && hasModerateNumeric && hasId && targetNoTemporal) {
    matches.push({
      agent: 'target',
      confidence: 0.80,
      signatureName: 'per_entity_benchmarks_static',
      matchedConditions: [
        `identifierRepeatRatio: ${profile.structure.identifierRepeatRatio.toFixed(1)} (≤1.5)`,
        `numericFieldRatio: ${(profile.structure.numericFieldRatio * 100).toFixed(0)}% (>30%)`,
        `hasEntityIdentifier: true`,
        `noTemporalDimension: true`,
      ],
    });
  }
  
  // ────────────────────────────────────────────────────────
  // PLAN SIGNATURE
  // "Sparse rule structure with mixed types and low row count"
  // ────────────────────────────────────────────────────────
  //
  // Conditions:
  //   1. headerQuality === 'auto_generated' OR sparsity > 0.30
  //   2. rowCount < 50
  //   3. No entity identifier OR very low row count
  
  const isSparseOrAutoHeaders = profile.patterns.headerQuality === 'auto_generated' || profile.structure.sparsity > 0.30;
  const isLowRowCount = profile.structure.rowCount < 50;
  const noIdOrVeryLow = !hasId || profile.structure.rowCount < 20;
  
  if (isSparseOrAutoHeaders && isLowRowCount && noIdOrVeryLow) {
    matches.push({
      agent: 'plan',
      confidence: 0.85,
      signatureName: 'sparse_rule_structure',
      matchedConditions: [
        `sparse/auto headers`,
        `rowCount: ${profile.structure.rowCount} (<50)`,
        `noEntityIdentifier or very low rows`,
      ],
    });
  }
  
  // ────────────────────────────────────────────────────────
  // REFERENCE SIGNATURE
  // "Low-volume lookup table with categorical key"
  // ────────────────────────────────────────────────────────
  //
  // Conditions:
  //   1. rowCount < 100 (lookup tables are small)
  //   2. NOT hasEntityIdentifier at person-level OR identifierRepeatRatio ≤ 1.0
  //   3. Has categorical key column (location, category, code)
  
  const isSmall = profile.structure.rowCount < 100;
  const notPersonLevel = !hasId || profile.structure.identifierRepeatRatio <= 1.0;
  const hasCategoricalKey = profile.structure.categoricalFieldCount >= 1;
  
  if (isSmall && notPersonLevel && hasCategoricalKey && !isSparseOrAutoHeaders) {
    matches.push({
      agent: 'reference',
      confidence: 0.75,
      signatureName: 'lookup_table',
      matchedConditions: [
        `rowCount: ${profile.structure.rowCount} (<100)`,
        `not person-level identifier`,
        `has categorical key column`,
      ],
    });
  }
  
  return matches;
}
```

### 1B: Add Missing Profile Properties

The Content Profile needs these structural properties if they don't already exist:

```typescript
// In ContentProfile structure:
structure: {
  rowCount: number;
  columnCount: number;
  sparsity: number;
  numericFieldRatio: number;        // % of columns that are numeric
  categoricalFieldRatio: number;    // % of columns that are low-cardinality text (< 20 distinct values)
  identifierRepeatRatio: number;    // totalRowCount / uniqueIdentifierValues
  categoricalFieldCount: number;    // count of categorical text columns
}

patterns: {
  hasEntityIdentifier: boolean;
  hasDateColumn: boolean;
  hasPeriodMarkers: boolean;        // HF-091: integer year + month columns
  hasStructuralNameColumn: boolean; // OB-158: text with spaces, high cardinality, long strings
  headerQuality: 'auto_generated' | 'clean' | 'mixed';
  hasPercentageValues: boolean;
  hasCurrencyColumns: number;
  hasDescriptiveLabels: boolean;
}
```

Add `categoricalFieldRatio`, `categoricalFieldCount`, and `hasStructuralNameColumn` if they don't exist. These MUST be computed structurally:

- `categoricalFieldRatio` = (count of text columns with < 20 distinct values) / totalColumnCount
- `categoricalFieldCount` = count of text columns with < 20 distinct values
- `hasStructuralNameColumn` = any column where: >90% non-numeric values, >50% contain spaces, average string length > 10, high cardinality (>80% unique). This is the structural name detection from OB-158.

### 1C: Wire Signatures Into Scoring Pipeline

In the scoring function (agents.ts or wherever `scoreContentUnit` lives):

```typescript
export function scoreContentUnit(profile: ContentProfile): AgentScore[] {
  // STEP 1: Detect composite signatures FIRST
  const signatures = detectSignatures(profile);
  
  // STEP 2: Run additive weight scoring as before
  const additiveScores = computeAdditiveScores(profile);
  
  // STEP 3: Apply signature floors
  // If a signature matched, the agent's score is MAX(signatureFloor, additiveScore)
  for (const sig of signatures) {
    const agentScore = additiveScores.find(s => s.agent === sig.agent);
    if (agentScore && agentScore.confidence < sig.confidence) {
      agentScore.confidence = sig.confidence;
      agentScore.signals.unshift({
        signal: `signature:${sig.signatureName}`,
        weight: sig.confidence,
        evidence: sig.matchedConditions.join('; '),
      });
      agentScore.reasoning = `Composite signature "${sig.signatureName}" matched: ${sig.matchedConditions.join(', ')}. ${agentScore.reasoning}`;
    }
  }
  
  // STEP 4: Sort by confidence descending
  return additiveScores.sort((a, b) => b.confidence - a.confidence);
}
```

### Proof Gates — Phase 1
- PG-1: `signatures.ts` file created with 5 composite signatures (Transaction, Entity, Target, Plan, Reference)
- PG-2: All signature conditions use structural properties — zero field-name matching
- PG-3: Content Profile includes `categoricalFieldRatio`, `categoricalFieldCount`, `hasStructuralNameColumn`
- PG-4: Signature detection runs BEFORE additive scoring
- PG-5: Signature confidence acts as floor (MAX of signature and additive)
- PG-6: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Phase 1: Composite structural signatures — fingerprints over checklists" && git push origin dev`

---

## PHASE 2: KOREAN TEST CLEANUP — REMOVE ALL nameSignals FIELD-NAME MATCHING

### 2A: Audit Current nameSignals

Find all field-name matching patterns in the SCI codebase:

```bash
grep -rn "containsId\|containsName\|containsTarget\|containsDate\|containsAmount\|containsRate" \
  web/src/lib/sci/ --include="*.ts" | head -40
```

### 2B: Replace Each nameSignal With Structural Equivalent

**Replace `containsId`** (currently matches "id", "codigo", "numero"):
```typescript
// STRUCTURAL: A column is an identifier if:
// - Values are sequential or follow a pattern (incrementing integers, alphanumeric codes)
// - High uniqueness (>90% distinct values / total rows)
// - Short average string length relative to other columns
// - Often the first or second column
isIdentifier: boolean;  // computed structurally, not by field name
```

**Replace `containsName`** (currently matches "name", "nombre"):
```typescript
// STRUCTURAL: A column is a name if (already implemented in OB-158):
// - >90% non-numeric values
// - >50% contain spaces (multi-word)
// - Average string length > 10
// - High cardinality (>80% unique)
// - Mixed case
isPersonName: boolean;  // computed structurally
```

**Replace `containsTarget`** (currently matches "target", "goal", "meta", "objetivo"):
```typescript
// STRUCTURAL: A column looks like a target/goal if:
// - Numeric values
// - Low variance relative to magnitude (goals tend to be round, stable numbers)
// - Values are round numbers (multiples of 100, 1000, 0.05)
// - One unique value per entity (not varying over time like actuals)
// This is HARD to detect structurally — and that's the point.
// If it can't be detected structurally, it shouldn't be a signal.
// REMOVE containsTarget entirely. Let composite signatures handle
// the Target vs Transaction distinction.
isTargetLike: boolean;  // OPTIONAL — only if structural detection is reliable
```

**Replace `containsDate`** (currently matches "date", "fecha"):
```typescript
// STRUCTURAL (partially done in HF-091):
// - Values parse as dates (ISO, US, European date formats)
// - Excel serial date numbers (large integers ~40000-50000)
// - Integer columns with year range (2000-2040) + month range (1-12)
// Keep the HF-091 period marker detection. Remove the field-name matching.
isDateLike: boolean;  // computed from value patterns
```

**Replace `containsAmount`** (currently matches "amount", "monto", "total"):
```typescript
// STRUCTURAL:
// - Numeric values with decimal places
// - High variance (amounts vary widely across rows)
// - Large magnitude relative to other numeric columns
// - Often positive (amounts, not deltas)
isMonetaryLike: boolean;  // computed from value distribution
```

### 2C: Update Agent Weight Tables

Remove all `nameSignals`-based weights from agent scoring. Replace with structural equivalents:

**Target Agent — BEFORE:**
```
has_target_field | +0.25 | any field with nameSignals.containsTarget
```
**Target Agent — AFTER:**
```
// REMOVED: has_target_field (+0.25) — Korean Test violation
// Target Agent now relies on composite signature (Phase 1) plus:
//   - has_entity_id (structural)
//   - has_numeric_fields (structural)
//   - low_repeat_ratio (structural)
//   - no_temporal_dimension (structural)
```

**Entity Agent — BEFORE:**
```
has_name_field | +0.20 | any field with nameSignals.containsName
has_license_field | +0.10 | any field name contains "license", "licencia", "product"
```
**Entity Agent — AFTER:**
```
has_structural_name | +0.20 | any field with isPersonName (structural detection)
// REMOVED: has_license_field (+0.10) — Korean Test violation
// License detection needs structural equivalent or removal
```

### 2D: Verify Zero Field-Name Matching Remains

```bash
# Must return ZERO hits for field-name matching patterns in scoring code
grep -rn '"id"\|"name"\|"nombre"\|"target"\|"meta"\|"objetivo"\|"goal"\|"amount"\|"monto"\|"total"\|"date"\|"fecha"\|"license"\|"licencia"\|"product"' \
  web/src/lib/sci/agents.ts web/src/lib/sci/content-profile.ts web/src/lib/sci/signatures.ts

# Note: These strings may legitimately appear in:
# - Comments (explaining what was replaced)
# - Observation text generation (describing what the system sees for the user)
# - Test files
# They must NOT appear in scoring logic or signal detection
```

### Proof Gates — Phase 2
- PG-7: `containsTarget` removed from Target Agent scoring (grep returns zero in scoring logic)
- PG-8: `containsName` replaced with structural `isPersonName` / `hasStructuralNameColumn`
- PG-9: `has_license_field` removed or replaced with structural equivalent
- PG-10: All agent scoring signals use structural properties from ContentProfile
- PG-11: Korean Test — `grep` for field-name strings in scoring logic returns zero
- PG-12: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Phase 2: Korean Test cleanup — remove all nameSignals field-name matching from scoring" && git push origin dev`

---

## PHASE 3: ROUND 2 NEGOTIATION

### 3A: Implement Round 2 Protocol

After Round 1 (independent scoring + signature detection), each agent sees all other agents' Round 1 scores and can adjust. This implements Layer 4 from the SCI specification.

### File: `web/src/lib/sci/negotiation.ts` (NEW)

```typescript
/**
 * Round 2 Negotiation — Spatial Intelligence
 * 
 * Each agent sees all other agents' Round 1 scores and adjusts.
 * The absence of a signal is itself a signal.
 * 
 * This is NOT arbitrary weight adjustment. Each adjustment has a
 * structural justification based on the ContentProfile.
 */

export function negotiateRound2(
  round1Scores: AgentScore[],
  profile: ContentProfile
): AgentScore[] {
  const scores = round1Scores.map(s => ({ ...s })); // clone
  const scoreMap = new Map(scores.map(s => [s.agent, s]));
  
  const transaction = scoreMap.get('transaction');
  const target = scoreMap.get('target');
  const entity = scoreMap.get('entity');
  const plan = scoreMap.get('plan');
  const reference = scoreMap.get('reference');
  
  // ────────────────────────────────────────────────────────
  // TRANSACTION vs TARGET negotiation
  // ────────────────────────────────────────────────────────
  //
  // Core insight: targets are SET once per entity per period.
  // Transactions REPEAT over time for the same entity.
  // If repeat ratio is high AND temporal markers exist,
  // the Target Agent's claim is structurally inconsistent.
  
  if (transaction && target) {
    const repeatRatio = profile.structure.identifierRepeatRatio;
    const hasTemporal = profile.patterns.hasDateColumn || profile.patterns.hasPeriodMarkers;
    
    // If Target has a strong claim but repeat ratio contradicts it
    if (target.confidence > 0.50 && repeatRatio > 2.0) {
      const penalty = Math.min(0.25, (repeatRatio - 1.0) * 0.08);
      target.confidence -= penalty;
      target.signals.push({
        signal: 'r2_repeat_inconsistency',
        weight: -penalty,
        evidence: `Repeat ratio ${repeatRatio.toFixed(1)} inconsistent with target data (targets don't repeat ${repeatRatio.toFixed(0)}x per entity)`,
      });
      target.reasoning += ` [R2: -${(penalty * 100).toFixed(0)}% — repeat ratio ${repeatRatio.toFixed(1)} contradicts target pattern]`;
    }
    
    // If Transaction sees Target is close AND structural signals support Transaction
    if (target.confidence > 0.50 && hasTemporal && repeatRatio > 1.5) {
      const boost = 0.10;
      transaction.confidence += boost;
      transaction.signals.push({
        signal: 'r2_temporal_repeat_conviction',
        weight: boost,
        evidence: `Target Agent at ${(target.confidence * 100).toFixed(0)}% but temporal markers + repeat ratio ${repeatRatio.toFixed(1)} = transactional pattern`,
      });
      transaction.reasoning += ` [R2: +${(boost * 100).toFixed(0)}% — temporal + repeat pattern confirms transaction over target]`;
    }
  }
  
  // ────────────────────────────────────────────────────────
  // ENTITY vs TRANSACTION negotiation
  // ────────────────────────────────────────────────────────
  //
  // Core insight: entities are one row per person.
  // If repeat ratio is high, Entity should back off.
  
  if (entity && transaction) {
    const repeatRatio = profile.structure.identifierRepeatRatio;
    
    if (entity.confidence > 0.50 && repeatRatio > 2.0) {
      const penalty = Math.min(0.20, (repeatRatio - 1.0) * 0.07);
      entity.confidence -= penalty;
      entity.signals.push({
        signal: 'r2_repeat_not_roster',
        weight: -penalty,
        evidence: `Repeat ratio ${repeatRatio.toFixed(1)} — rosters have ~1.0 (one row per entity)`,
      });
      entity.reasoning += ` [R2: -${(penalty * 100).toFixed(0)}% — repeat ratio ${repeatRatio.toFixed(1)} not consistent with roster]`;
    }
  }
  
  // ────────────────────────────────────────────────────────
  // ENTITY vs TARGET negotiation
  // ────────────────────────────────────────────────────────
  //
  // If Entity and Target are close, the distinguishing signal
  // is whether numeric columns look like attributes (salary, tenure)
  // or goals (target amount, quota).
  // Without field-name matching, the structural signal is:
  // - Entity attributes: low variance, often same value across many entities
  // - Target values: high variance, unique per entity
  
  if (entity && target && Math.abs(entity.confidence - target.confidence) < 0.15) {
    const numericRatio = profile.structure.numericFieldRatio;
    
    // High numeric ratio favors Target (entities are attribute-heavy, not numeric-heavy)
    if (numericRatio > 0.50) {
      const shift = 0.08;
      entity.confidence -= shift;
      target.confidence += shift;
      entity.signals.push({
        signal: 'r2_too_numeric_for_roster',
        weight: -shift,
        evidence: `${(numericRatio * 100).toFixed(0)}% numeric fields — entity rosters are typically attribute-heavy`,
      });
      target.signals.push({
        signal: 'r2_numeric_supports_targets',
        weight: shift,
        evidence: `${(numericRatio * 100).toFixed(0)}% numeric fields — consistent with goal/target data`,
      });
    }
  }
  
  // ────────────────────────────────────────────────────────
  // ABSENCE BOOST — When no other agent competes
  // ────────────────────────────────────────────────────────
  //
  // From specification: "The absence of a signal is itself a signal."
  // If the winning agent has a strong lead (>0.25 gap to second place),
  // this is evidence of clarity — boost slightly.
  
  const sorted = scores.sort((a, b) => b.confidence - a.confidence);
  if (sorted.length >= 2) {
    const gap = sorted[0].confidence - sorted[1].confidence;
    if (gap > 0.25) {
      const absenceBoost = 0.05;
      sorted[0].confidence = Math.min(0.98, sorted[0].confidence + absenceBoost);
      sorted[0].signals.push({
        signal: 'r2_absence_clarity',
        weight: absenceBoost,
        evidence: `Gap of ${(gap * 100).toFixed(0)}% to next agent — high classification clarity`,
      });
    }
  }
  
  // Clamp all scores to [0, 1]
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }
  
  return scores.sort((a, b) => b.confidence - a.confidence);
}
```

### 3B: Wire Round 2 Into Scoring Pipeline

Update `scoreContentUnit` to call Round 2 after signatures:

```typescript
export function scoreContentUnit(profile: ContentProfile): AgentScore[] {
  // STEP 1: Detect composite signatures
  const signatures = detectSignatures(profile);
  
  // STEP 2: Compute additive scores (Round 1)
  const round1Scores = computeAdditiveScores(profile);
  
  // STEP 3: Apply signature floors
  for (const sig of signatures) {
    const agentScore = round1Scores.find(s => s.agent === sig.agent);
    if (agentScore && agentScore.confidence < sig.confidence) {
      agentScore.confidence = sig.confidence;
      // ... (signal + reasoning updates from Phase 1)
    }
  }
  
  // STEP 4: Round 2 Negotiation — agents see each other's scores and adjust
  const round2Scores = negotiateRound2(round1Scores, profile);
  
  // STEP 5: Return sorted by confidence
  return round2Scores;
}
```

### Proof Gates — Phase 3
- PG-13: `negotiation.ts` created with Round 2 protocol
- PG-14: Transaction vs Target negotiation: Target penalized when repeat ratio > 2.0
- PG-15: Transaction vs Target negotiation: Transaction boosted when temporal + high repeat
- PG-16: Entity vs Transaction negotiation: Entity penalized when repeat ratio > 2.0
- PG-17: Absence boost applied when gap > 0.25
- PG-18: Round 2 called after signatures in scoring pipeline
- PG-19: All negotiations use structural properties — zero field-name matching
- PG-20: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Phase 3: Round 2 negotiation — spatial intelligence between agents" && git push origin dev`

---

## PHASE 4: ROWS-PER-ENTITY SIGNAL

### 4A: Replace rowCountCategory

The current categories (reference <50, moderate 50-500, transactional >500) ignore entity count. Replace with a rows-per-entity signal:

```typescript
// In ContentProfile structure, add:
rowsPerEntity: number;  // identifierRepeatRatio (already computed, just rename for clarity)

// New category based on rows-per-entity:
volumePattern: 'single' | 'few' | 'many';
// single: ≤ 1.3 rows per entity (roster, one-time reference)
// few: 1.3 - 3.0 rows per entity (targets per period, quarterly data)
// many: > 3.0 rows per entity (monthly transactions, daily events)
```

### 4B: Update Agent Weights

Replace `rowCountCategory` references with `volumePattern`:

**Transaction Agent:**
```
// BEFORE: transactional_rows | +0.20 | rowCountCategory === 'transactional' (>500 rows)
// AFTER:  many_per_entity    | +0.20 | volumePattern === 'many' (>3.0 rows per entity)
```

**Entity Agent:**
```
// BEFORE: moderate_rows      | +0.15 | rowCountCategory === 'moderate' (50-500 rows)
// AFTER:  single_per_entity  | +0.15 | volumePattern === 'single' (≤1.3 rows per entity)
// BEFORE: transactional_rows | -0.15 | rowCountCategory === 'transactional'
// AFTER:  many_per_entity    | -0.15 | volumePattern === 'many'
```

**Target Agent:**
```
// BEFORE: reference_rows     | +0.15 | rowCountCategory === 'reference' (<50 rows)
// AFTER:  few_per_entity     | +0.10 | volumePattern === 'few' (1.3-3.0 rows per entity)
//         single_per_entity  | +0.05 | volumePattern === 'single'
// BEFORE: transactional_rows | -0.15 | rowCountCategory === 'transactional'
// AFTER:  many_per_entity    | -0.15 | volumePattern === 'many'
```

### Proof Gates — Phase 4
- PG-21: `volumePattern` computed in Content Profile
- PG-22: Agent weight tables use `volumePattern` instead of `rowCountCategory`
- PG-23: Datos_Rendimiento (4.0 rows/entity) gets `volumePattern === 'many'`
- PG-24: Plantilla (1.0 rows/entity) gets `volumePattern === 'single'`
- PG-25: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Phase 4: Rows-per-entity volume signal — replaces absolute row count categories" && git push origin dev`

---

## PHASE 5: CLEAN MERIDIAN + BROWSER PROOF

### 5A: Clean Meridian Data

```bash
cat > web/scripts/ob159-meridian-cleanup.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function cleanup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete entities, committed_data, reference_data
  // Preserve rule_sets (plan is correct)
  for (const table of ['committed_data', 'reference_data', 'rule_set_assignments', 'entities']) {
    const { count } = await supabase
      .from(table)
      .delete()
      .eq('tenant_id', MERIDIAN_TENANT_ID)
      .select('id', { count: 'exact' });
    console.log(`Deleted ${count} rows from ${table}`);
  }

  // Verify rule_sets preserved
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  console.log(`\nRule sets preserved: ${rs?.length}`);

  // Engine Contract state
  for (const table of ['rule_sets', 'entities', 'committed_data', 'periods', 'rule_set_assignments']) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact' })
      .eq('tenant_id', MERIDIAN_TENANT_ID);
    console.log(`${table}: ${count}`);
  }
}

cleanup().catch(console.error);
EOF

npx tsx web/scripts/ob159-meridian-cleanup.ts
```

### 5B: Browser Import on localhost — THE PROOF

1. `npm run dev` → localhost:3000
2. Log in as VL Admin → Meridian
3. Upload `Meridian_Datos_Q1_2025.xlsx`
4. **On the analyze screen, verify:**
   - Plantilla: **entity** at ≥85%
   - Datos_Rendimiento: **transaction** at ≥75%
   - Datos_Flota_Hub: **reference** at ≥85%
5. Confirm all → Import data
6. **Verify all three sheets succeed** (no 500s, no NOT NULL errors)

### 5C: Database Verification

```sql
-- Entities with human names (not IDs)
SELECT external_id, display_name FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY external_id LIMIT 5;

-- committed_data populated with entity linkage and source_dates
SELECT COUNT(*) as total, COUNT(DISTINCT entity_id) as entities,
       COUNT(DISTINCT source_date) as dates,
       MIN(source_date) as earliest, MAX(source_date) as latest
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Engine Contract — all populated
SELECT 
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT COUNT(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data;
```

### Proof Gates — Phase 5
- PG-26: Meridian entities cleaned, rule_sets preserved
- PG-27: Datos_Rendimiento classified as **Transaction** at ≥75% (screenshot or paste)
- PG-28: Plantilla classified as **Entity** at ≥85%
- PG-29: Datos_Flota_Hub classified as **Reference** at ≥85%
- PG-30: All three sheets import successfully (no errors)
- PG-31: Entities have human-readable display_names (paste first 5)
- PG-32: committed_data has >0 rows with entity_ids and source_dates (paste counts)
- PG-33: Engine Contract: rule_sets=1, entities>0, committed_data>0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Phase 5: Meridian browser proof — all three sheets classified correctly" && git push origin dev`

---

## PHASE 6: REMOVE DIAGNOSTIC LOGGING + BUILD + PR

### 6A: Remove Temporary Logging

Remove any `console.log` statements added during HF-091 debugging (the `[SCI Profile]` and `[SCI Ratio]` log lines).

```bash
grep -rn "\[SCI Profile\]\|\[SCI Ratio\]" web/src/lib/sci/ --include="*.ts"
```

Remove them.

### 6B: Final Build

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 6C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-159: Unified SCI Scoring Overhaul — Composite Signatures + Korean Test Cleanup + Round 2 Negotiation" \
  --body "Addresses systemic classification failures with a unified architectural fix.

## What Changed

### 1. Composite Structural Signatures (signatures.ts)
When multiple structural signals align, set a confidence floor.
Transaction signature: repeat ratio >1.5 + temporal markers + numeric ratio >40% → 80% floor.
Entity/Target/Plan/Reference signatures similarly defined.
Signatures fire BEFORE additive weights — the fingerprint beats the checklist.

### 2. Korean Test Cleanup
Removed ALL nameSignals field-name matching from agent scoring:
- containsTarget ('meta', 'objetivo', 'target') — REMOVED (was +0.25 for Target Agent)
- containsName ('nombre', 'name') — replaced with structural isPersonName
- has_license_field ('license', 'licencia') — REMOVED
All scoring now uses structural properties from ContentProfile.

### 3. Round 2 Negotiation (negotiation.ts)
Agents see each other's Round 1 scores and adjust:
- Target Agent penalized when repeat ratio >2.0 (targets don't repeat 4x)
- Transaction Agent boosted when temporal markers + high repeat
- Entity Agent penalized when repeat ratio >2.0 (rosters don't repeat)
- Absence boost when clear winner (gap >25%)

### 4. Rows-Per-Entity Volume Signal
Replaced absolute rowCountCategory (<50/50-500/>500) with volumePattern:
- single (≤1.3 rows/entity): roster, one-time reference
- few (1.3-3.0): targets per period, quarterly data
- many (>3.0): monthly transactions, daily events

## Meridian Result
- Plantilla: Entity ≥85% ✅
- Datos_Rendimiento: Transaction ≥75% ✅ (was Target 70%)
- Datos_Flota_Hub: Reference ≥85% ✅
- committed_data: [count] rows with entity_ids and source_dates
- Engine Contract: rule_sets=1, entities=[count], committed_data=[count]

## Architecture Decisions
- Decision 99: Agent scoring uses composite signatures as confidence floors
- AP-27: nameSignals field-name matching is a Korean Test violation class
- TMR-C31: Composite Structural Signatures methodology"
```

### Proof Gates — Phase 6
- PG-34: Diagnostic logging removed
- PG-35: `npm run build` exits 0
- PG-36: localhost:3000 responds
- PG-37: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-159 Complete: Unified SCI scoring overhaul" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Composite structural signatures (new file: signatures.ts)
- Korean Test cleanup of all nameSignals field-name matching in agent scoring
- Round 2 negotiation protocol (new file: negotiation.ts)
- Rows-per-entity volume signal replacing absolute row count categories
- Content Profile additions (categoricalFieldRatio, categoricalFieldCount, hasStructuralNameColumn, volumePattern)
- Meridian entity cleanup + browser re-import verification
- Diagnostic logging cleanup from HF-091

### OUT OF SCOPE — DO NOT TOUCH
- Auth files
- Calculation engine
- Plan import (PPTX pipeline)
- Rule set components or input_bindings
- Period creation
- Rule set assignments
- UI components beyond import/SCI proposal surface
- RLS policies
- Supabase schema migrations
- Tier 2 (tenant context) and Tier 3 (ML) scoring — future phases
- Field-level PARTIAL claims — future OB

### CRITICAL CONSTRAINTS

1. **Korean Test on ALL new code.** Zero field-name matching in scoring logic. Comments may reference field names for explanation but scoring conditions must use structural properties exclusively.
2. **Composite signatures are confidence FLOORS, not ceilings.** Additive scoring can increase above the floor but not below it.
3. **Round 2 adjustments must have structural justification.** Every penalty/boost in negotiation.ts references a ContentProfile property and explains why the structural evidence contradicts the agent's claim.
4. **Do NOT delete the additive weight system.** Signatures and negotiation augment it — they don't replace it. The additive weights handle cases where no signature matches.
5. **Preserve the plan rule_set.** Do NOT delete Meridian's rule_set.
6. **Browser proof required.** Phase 5B must be through the browser (CC Failure Pattern 33).
7. **Observation text can mention field names.** The "WHAT I OBSERVE" card text is for the human — it's allowed to say "No_Empleado looks like an identifier." The SCORING LOGIC must not use field names.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-5 | Hardcode field names for scoring | Composite signatures use structural properties only |
| AP-6 | Match on language-specific column names | Korean Test cleanup removes all nameSignals from scoring |
| AP-25 | Korean Test violation | Zero field-name matching in signatures.ts, negotiation.ts, or agent scoring |
| Pattern 33 | Script bypass as browser proof | Phase 5B browser test mandatory |
| NEW-AP-27 | nameSignals field-name matching in scoring | Use structural equivalents (value distribution, cardinality, type) |
| NEW | Adding Round 2 adjustments without structural justification | Every negotiation adjustment references a ContentProfile property |
| NEW | Signatures as ceilings instead of floors | Signatures set minimum confidence; additive scoring can only increase |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-159_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE

### Completion Report Structure
1. **Architecture Decisions** — Decision 99 (composite signatures), AP-27 (nameSignals violation class)
2. **Commits** — all with hashes, one per phase
3. **Files created** — signatures.ts, negotiation.ts
4. **Files modified** — agents.ts, content-profile.ts, scoring pipeline
5. **Korean Test audit** — list of all removed field-name matching patterns
6. **Scoring comparison** — Datos_Rendimiento scores BEFORE (entity 80%, target 70%) vs AFTER (transaction ≥75%)
7. **Proof gates** — 37 gates, each PASS/FAIL with pasted evidence
8. **Engine Contract state** — 3-value query results after re-import
9. **Derivative scenarios assessment** — brief note on whether the 5 derivative scenarios from the analysis would now classify correctly

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ signatures.ts created with 5 composite signatures?
□ All signature conditions use structural properties?
□ containsTarget REMOVED from Target Agent scoring?
□ All nameSignals field-name matching removed from scoring logic?
□ negotiation.ts created with Round 2 protocol?
□ Round 2 adjustments reference ContentProfile properties?
□ volumePattern replaces rowCountCategory?
□ Datos_Rendimiento classified as Transaction ≥75%?
□ Plantilla classified as Entity ≥85%?
□ Datos_Flota_Hub classified as Reference ≥85%?
□ committed_data has rows with entity_ids?
□ Entities have human-readable display_names?
□ Diagnostic logging removed?
□ npm run build exits 0?
□ localhost:3000 responds?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-159: "When three structural signals all point the same direction, that's not a close call — that's a signature. The fingerprint beats the checklist."*
