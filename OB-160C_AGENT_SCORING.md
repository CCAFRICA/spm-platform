# OB-160C PHASE C: AGENT SCORING + SIGNATURES + NEGOTIATION
## "The agents collaborate spatially through shared state"
## SCI Development Plan Phase C of 12 (A through L)
## Target: Current release
## Depends on: OB-160B (PR #183)
## Priority: P0 — Classification accuracy for all content types

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 2 (Agents), Layer 3 (Confidence Scoring Tier 1), Layer 4 (Negotiation Protocol)
3. `web/src/lib/sci/content-profile.ts` — Phase A foundation
4. `web/src/lib/sci/header-comprehension.ts` — Phase B header comprehension
5. `web/src/lib/sci/sci-types.ts` — all types including HeaderComprehension, ColumnRole, ProfileObservation
6. `web/src/lib/sci/agents.ts` — current scoring (to be rewritten)
7. `web/src/lib/sci/signatures.ts` — current signatures (to be updated)

---

## CONTEXT

### What Phases A and B Delivered

**Phase A:** Content Profile foundation — probabilistic type scoring, type-agnostic temporal detection, identifier-relative cardinality, ProfileObservation signal interface.

**Phase B:** Header comprehension — one LLM call per file interprets ALL headers in any language. `HeaderComprehension` with `ColumnRole` per column available on `ContentProfile.headerComprehension`. Vocabulary binding interface for flywheel. Measurement metrics.

**The gap:** The scoring layer (`agents.ts`) does not read `headerComprehension` from the profile. Header comprehension enriches the profile but agents ignore it. Additionally, `nameSignals` field-name matching (Korean Test violations) remains in the scoring weights.

### What Phase C Delivers

1. **Korean Test cleanup** — remove ALL `nameSignals` field-name matching from agent scoring. Replace with structural properties (Phase A) + header comprehension ColumnRole (Phase B).
2. **Header comprehension wired into scoring** — agents use `ColumnRole` as a signal. A column the LLM identified as `temporal` gets Transaction Agent boost and Target Agent penalty.
3. **Synaptic Ingestion State** — consolidate the two `negotiateRound2` functions into a single flow through a shared in-memory state object.
4. **Classification Trace** — structured, persisted-ready trace of every scoring step. Defined here, stored in Phase E.
5. **PARTIAL claim interfaces** — type definitions for field-level claims. Exercised in Phase H.

### Integration Points

```typescript
// From Phase A (content-profile.ts):
ContentProfile.structure.identifierRepeatRatio  // number
ContentProfile.structure.numericFieldRatio      // number
ContentProfile.structure.categoricalFieldRatio  // number
ContentProfile.patterns.hasTemporalColumns      // boolean
ContentProfile.patterns.hasStructuralNameColumn // boolean
ContentProfile.patterns.hasEntityIdentifier     // boolean
ContentProfile.patterns.volumePattern           // 'single' | 'few' | 'many' | 'unknown'
ContentProfile.observations                     // ProfileObservation[]

// From Phase B (header-comprehension.ts):
ContentProfile.headerComprehension?.interpretations  // Map<columnName, HeaderInterpretation>
HeaderInterpretation.columnRole                      // ColumnRole
HeaderInterpretation.semanticMeaning                 // string
HeaderInterpretation.confidence                      // number
```

### Current Architecture (to be consolidated)

```
CURRENT (fragmented):
  negotiation.ts:negotiateRound2(profile)
    → calls agents.ts:scoreContentUnit(profile)
      → calls signatures.ts:detectSignatures(profile)
      → calls agents.ts:scoreAgent() per agent
      → applies signature floors
      → calls agents.ts:negotiateRound2(scores, profile)  ← LOCAL, different function!
    → does field affinity + split analysis
  
AFTER PHASE C (consolidated):
  synaptic-ingestion-state.ts:classifyContentUnits(profiles, headerComprehension)
    → creates SynapticIngestionState
    → for each content unit:
      → Round 1: signatures + additive scoring (using structural + header comprehension)
      → Round 2: negotiation through shared state (agents see all scores)
      → resolution: winner determined, trace recorded
    → returns classified content units with full trace
```

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
  Phase B: Header Comprehension ✅ (PR #183)
→ PHASE C: Agent Scoring + Signatures + Negotiation ← YOU ARE HERE
  Phase D: Tenant Context
  Phase E: Classification Signals + Flywheel
  Phase F: Execute Pipeline + Routing
  Phase G: Convergence + input_bindings
  Phase H: Field-Level PARTIAL Claims
  Phase I-L: Flywheels + Density + Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 25 | Korean Test | Remove all nameSignals field-name matching from scoring |
| 92/93 | Period is not an import concept | Temporal columns inform scoring but agents do not reference periods |
| 103-105 | Phase A decisions | Scoring reads Phase A structural properties |
| 106 | LLM escalation on close calls | Phase B provides header comprehension; Phase C uses ColumnRole as signal; LLM escalation for scoring ambiguity is a separate concern handled by the comprehension layer |

---

## PHASE 0: DIAGNOSTIC — READ CURRENT SCORING

```bash
echo "=== CURRENT AGENT SCORING ==="
cat web/src/lib/sci/agents.ts

echo ""
echo "=== CURRENT SIGNATURES ==="
cat web/src/lib/sci/signatures.ts

echo ""
echo "=== CURRENT NEGOTIATION ==="
cat web/src/lib/sci/negotiation.ts

echo ""
echo "=== ANALYZE ROUTE — HOW SCORING IS CALLED ==="
cat web/src/app/api/import/sci/analyze/route.ts

echo ""
echo "=== KOREAN TEST AUDIT — FIELD NAME MATCHING ==="
grep -rn "containsId\|containsName\|containsTarget\|containsDate\|containsAmount\|containsRate" \
  web/src/lib/sci/agents.ts

echo ""
echo "=== nameSignals USAGE ==="
grep -rn "nameSignals" web/src/lib/sci/ --include="*.ts"
```

Document:
1. Every `nameSignals` reference in scoring logic (these are Korean Test violations to remove)
2. The exact flow from analyze route through negotiation → scoring → signatures
3. Where headerComprehension SHOULD be read but isn't
4. The two `negotiateRound2` functions and their differences

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160C Phase 0: Diagnostic — scoring architecture, Korean Test audit, header comprehension gaps" && git push origin dev`

---

## PHASE 1: SYNAPTIC INGESTION STATE + CLASSIFICATION TRACE

### 1A: Create Synaptic Ingestion State

**New file:** `web/src/lib/sci/synaptic-ingestion-state.ts`

This is the in-memory shared state for one import session. All scoring, negotiation, and resolution flow through this object. It is ephemeral — it lives for the duration of one import and is not stored in the database (the ClassificationTrace extracted from it IS stored in Phase E).

```typescript
import { ContentProfile, AgentScore, ProfileObservation, HeaderComprehension } from './sci-types';

export interface SynapticIngestionState {
  // Input
  sessionId: string;                                    // unique per import session
  tenantId: string;
  sourceFileName: string;
  
  // Content units (one per sheet)
  contentUnits: Map<string, ContentProfile>;             // contentUnitId → profile
  
  // Scoring state (populated during classification)
  round1Scores: Map<string, AgentScore[]>;               // contentUnitId → agent scores
  signatureMatches: Map<string, SignatureMatch[]>;        // contentUnitId → matched signatures
  round2Scores: Map<string, AgentScore[]>;               // contentUnitId → adjusted scores
  
  // Resolution (populated after scoring)
  resolutions: Map<string, ContentUnitResolution>;       // contentUnitId → final classification
  
  // Tenant context (populated by Phase D)
  tenantContext?: TenantContext;
  
  // Classification traces (one per content unit — THE FLYWHEEL'S RAW MATERIAL)
  traces: Map<string, ClassificationTrace>;              // contentUnitId → full trace
}

export interface ContentUnitResolution {
  classification: AgentType;
  confidence: number;
  decisionSource: 'signature' | 'heuristic' | 'llm' | 'prior_signal' | 'human_override';
  claimType: 'FULL' | 'PARTIAL';                        // Phase H exercises PARTIAL
  fieldAssignments?: Map<string, AgentType>;             // Phase H: field → claiming agent
  sharedFields?: string[];                               // Phase H: fields needed by multiple agents
  requiresHumanReview: boolean;
}

export interface TenantContext {
  // Phase D populates this — define interface now
  existingEntityCount: number;
  existingEntityExternalIds: Set<string>;
  existingPlanCount: number;
  existingPlanInputRequirements: string[];
  committedDataRowCount: number;
  referenceDataExists: boolean;
}
```

### 1B: Classification Trace Structure

The trace records EVERY step of the scoring process. It is the debugging tool AND the flywheel's raw material.

```typescript
export interface ClassificationTrace {
  contentUnitId: string;
  sheetName: string;
  
  // Phase A: Structural observations
  structuralProfile: {
    rowCount: number;
    columnCount: number;
    numericFieldRatio: number;
    categoricalFieldRatio: number;
    identifierRepeatRatio: number;
    volumePattern: string;
    hasTemporalColumns: boolean;
    hasStructuralNameColumn: boolean;
    hasEntityIdentifier: boolean;
  };
  
  // Phase B: Header comprehension
  headerComprehension: {
    available: boolean;
    interpretations: Record<string, { semanticMeaning: string; columnRole: string; confidence: number }>;
    crossSheetInsights: string[];
    llmCalled: boolean;
    llmDuration: number | null;
    fromVocabularyBinding: boolean;
  } | null;
  
  // Phase C: Scoring
  round1: {
    agent: string;
    confidence: number;
    signals: { signal: string; weight: number; evidence: string }[];
  }[];
  
  signatureChecks: {
    signatureName: string;
    conditions: { name: string; value: unknown; passed: boolean }[];
    matched: boolean;
    confidenceFloor: number | null;
  }[];
  
  round2: {
    agent: string;
    adjustment: number;
    reason: string;
    evidenceProperty: string;
    evidenceValue: unknown;
  }[];
  
  // Phase D: Tenant context (populated later)
  tenantContextApplied: {
    signal: string;
    adjustment: number;
    evidence: string;
  }[];
  
  // Phase E: Prior signals (populated later)
  priorSignals: {
    classification: string;
    confidence: number;
    source: string;
  }[];
  
  // Final result
  finalClassification: string;
  finalConfidence: number;
  decisionSource: string;
  requiresHumanReview: boolean;
}
```

### 1C: Create State + Initialize

```typescript
export function createIngestionState(
  tenantId: string,
  sourceFileName: string,
  profiles: Map<string, ContentProfile>
): SynapticIngestionState {
  return {
    sessionId: crypto.randomUUID(),
    tenantId,
    sourceFileName,
    contentUnits: profiles,
    round1Scores: new Map(),
    signatureMatches: new Map(),
    round2Scores: new Map(),
    resolutions: new Map(),
    traces: new Map(),
  };
}
```

### Proof Gates — Phase 1
- PG-1: `SynapticIngestionState` interface defined with contentUnits, scoring state, resolutions, traces
- PG-2: `ClassificationTrace` interface defined with structural profile, header comprehension, round1, signatureChecks, round2, tenantContext, priorSignals, final result
- PG-3: `ContentUnitResolution` includes claimType ('FULL' | 'PARTIAL') and fieldAssignments for Phase H
- PG-4: `TenantContext` interface defined for Phase D
- PG-5: `createIngestionState` function exists
- PG-6: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160C Phase 1: Synaptic Ingestion State + Classification Trace — shared state for import session" && git push origin dev`

---

## PHASE 2: KOREAN TEST CLEANUP + HEADER COMPREHENSION WIRING

### 2A: Remove ALL nameSignals from Scoring

Find every place `nameSignals` is used in agent scoring weights and remove the scoring dependency:

```bash
grep -rn "nameSignals\|containsId\|containsName\|containsTarget\|containsDate\|containsAmount\|containsRate" \
  web/src/lib/sci/agents.ts
```

For each agent, remove weights that depend on nameSignals:

**Entity Agent — REMOVE:**
- `has_name_field` (+0.20 from `nameSignals.containsName`) → REPLACE with `has_structural_name` using `profile.patterns.hasStructuralNameColumn`
- `has_license_field` (+0.10 from field name matching) → REMOVE entirely (no structural equivalent)

**Target Agent — REMOVE:**
- `has_target_field` (+0.25 from `nameSignals.containsTarget`) → REMOVE entirely (this was the biggest misclassification contributor)

**Transaction Agent — verify no nameSignals dependencies exist**

**Plan Agent — verify no nameSignals dependencies exist**

### 2B: Add Header Comprehension as Scoring Signal

Each agent should read `profile.headerComprehension` when available. The `ColumnRole` provides high-quality classification signals:

```typescript
// In the agent scoring function, after structural weight calculation:
function applyHeaderComprehensionSignals(
  scores: AgentScore[],
  profile: ContentProfile
): void {
  if (!profile.headerComprehension) return;  // Phase A heuristics only — no header data
  
  const interpretations = profile.headerComprehension.interpretations;
  
  // Count columns by ColumnRole
  let temporalCount = 0;
  let measureCount = 0;
  let identifierCount = 0;
  let nameCount = 0;
  let attributeCount = 0;
  let referenceKeyCount = 0;
  
  for (const [, interp] of interpretations) {
    switch (interp.columnRole) {
      case 'temporal': temporalCount++; break;
      case 'measure': measureCount++; break;
      case 'identifier': identifierCount++; break;
      case 'name': nameCount++; break;
      case 'attribute': attributeCount++; break;
      case 'reference_key': referenceKeyCount++; break;
    }
  }
  
  const totalColumns = interpretations.size;
  if (totalColumns === 0) return;
  
  // Ratios
  const measureRatio = measureCount / totalColumns;
  const temporalRatio = temporalCount / totalColumns;
  const attributeRatio = attributeCount / totalColumns;
  
  // --- Transaction Agent signals from header comprehension ---
  const transaction = scores.find(s => s.agent === 'transaction');
  if (transaction) {
    // Temporal columns identified by LLM → strong transaction signal
    if (temporalCount >= 1) {
      transaction.confidence += 0.10;
      transaction.signals.push({
        signal: 'hc_temporal_columns',
        weight: 0.10,
        evidence: `LLM identified ${temporalCount} temporal column(s)`,
      });
    }
    // High measure ratio → data-heavy, transactional
    if (measureRatio > 0.40) {
      transaction.confidence += 0.08;
      transaction.signals.push({
        signal: 'hc_measure_heavy',
        weight: 0.08,
        evidence: `LLM identified ${(measureRatio * 100).toFixed(0)}% of columns as measures`,
      });
    }
  }
  
  // --- Entity Agent signals from header comprehension ---
  const entity = scores.find(s => s.agent === 'entity');
  if (entity) {
    // Name column identified by LLM → entity signal
    if (nameCount >= 1) {
      entity.confidence += 0.10;
      entity.signals.push({
        signal: 'hc_name_column',
        weight: 0.10,
        evidence: `LLM identified ${nameCount} name column(s)`,
      });
    }
    // High attribute ratio → roster-like
    if (attributeRatio > 0.30) {
      entity.confidence += 0.08;
      entity.signals.push({
        signal: 'hc_attribute_heavy',
        weight: 0.08,
        evidence: `LLM identified ${(attributeRatio * 100).toFixed(0)}% of columns as attributes`,
      });
    }
    // Temporal columns → NOT a roster (penalty)
    if (temporalCount >= 2) {
      entity.confidence -= 0.10;
      entity.signals.push({
        signal: 'hc_temporal_not_roster',
        weight: -0.10,
        evidence: `LLM identified ${temporalCount} temporal columns — rosters don't have multiple temporal dimensions`,
      });
    }
  }
  
  // --- Target Agent signals from header comprehension ---
  const target = scores.find(s => s.agent === 'target');
  if (target) {
    // Temporal columns → NOT static targets (penalty)
    if (temporalCount >= 1) {
      target.confidence -= 0.10;
      target.signals.push({
        signal: 'hc_temporal_not_targets',
        weight: -0.10,
        evidence: `LLM identified ${temporalCount} temporal column(s) — targets are static reference data`,
      });
    }
  }
  
  // --- Reference Agent signals from header comprehension ---
  const reference = scores.find(s => s.agent === 'reference');
  if (reference) {
    // Reference key columns → reference data signal
    if (referenceKeyCount >= 1) {
      reference.confidence += 0.15;
      reference.signals.push({
        signal: 'hc_reference_key',
        weight: 0.15,
        evidence: `LLM identified ${referenceKeyCount} reference key column(s)`,
      });
    }
  }
  
  // Clamp all scores to [0, 1]
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }
}
```

### 2C: Verify Zero Korean Test Violations

```bash
# After changes, this MUST return ZERO hits in scoring logic
# (nameSignals may still exist in observation text generation — that's OK)
grep -rn "containsTarget\|containsAmount\|containsRate" \
  web/src/lib/sci/agents.ts

# Field-name matching strings in scoring
grep -rn '"license"\|"licencia"\|"product"\|"meta"\|"objetivo"\|"target"\|"goal"' \
  web/src/lib/sci/agents.ts | grep -v "//" | grep -v "console"
```

### Proof Gates — Phase 2
- PG-7: `has_target_field` (+0.25 from containsTarget) REMOVED from Target Agent (grep)
- PG-8: `has_license_field` (+0.10 from field name) REMOVED from Entity Agent (grep)
- PG-9: `has_name_field` replaced with `has_structural_name` using profile.patterns.hasStructuralNameColumn
- PG-10: `applyHeaderComprehensionSignals` function exists and reads ColumnRole from headerComprehension
- PG-11: Transaction Agent gets boost from LLM-identified temporal columns
- PG-12: Entity Agent gets penalty from LLM-identified temporal columns
- PG-13: Target Agent gets penalty from LLM-identified temporal columns
- PG-14: Reference Agent gets boost from LLM-identified reference_key columns
- PG-15: Zero Korean Test violations in agents.ts scoring logic (grep returns zero for field-name strings)
- PG-16: Header comprehension signals are ADDITIVE — when headerComprehension is null (LLM unavailable), scoring works with structural signals only
- PG-17: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160C Phase 2: Korean Test cleanup + header comprehension wired into agent scoring" && git push origin dev`

---

## PHASE 3: CONSOLIDATED SCORING PIPELINE

### 3A: Consolidate the Two negotiateRound2 Functions

Currently there are TWO `negotiateRound2` functions:
1. `agents.ts:179` — local function, takes (scores, profile), mutates in-place
2. `negotiation.ts:310` — exported function, takes (profile), calls scoreContentUnit internally

This is confusing and violates the single-code-path principle. Consolidate into ONE flow:

**New function in `synaptic-ingestion-state.ts`:**

```typescript
export function classifyContentUnits(
  state: SynapticIngestionState
): void {
  
  for (const [unitId, profile] of state.contentUnits) {
    const trace: ClassificationTrace = initializeTrace(unitId, profile);
    
    // STEP 1: Composite signatures
    const signatures = detectSignatures(profile);
    trace.signatureChecks = signatures.map(s => ({
      signatureName: s.signatureName || 'unnamed',
      conditions: s.matchedConditions?.map(c => ({ name: c, value: true, passed: true })) || [],
      matched: true,
      confidenceFloor: s.confidence,
    }));
    state.signatureMatches.set(unitId, signatures);
    
    // STEP 2: Additive scoring (Round 1)
    const round1 = computeAdditiveScores(profile);
    trace.round1 = round1.map(s => ({
      agent: s.agent,
      confidence: s.confidence,
      signals: s.signals.map(sig => ({ signal: sig.signal, weight: sig.weight, evidence: sig.evidence })),
    }));
    
    // STEP 3: Apply signature floors
    for (const sig of signatures) {
      const agentScore = round1.find(s => s.agent === sig.agent);
      if (agentScore && agentScore.confidence < sig.confidence) {
        agentScore.confidence = sig.confidence;
        agentScore.signals.unshift({
          signal: `signature:${sig.signatureName}`,
          weight: sig.confidence,
          evidence: sig.matchedConditions?.join('; ') || '',
        });
      }
    }
    
    // STEP 4: Header comprehension signals
    applyHeaderComprehensionSignals(round1, profile);
    
    // STEP 5: Round 2 negotiation through shared state
    // Agents see all other agents' scores and adjust
    applyRound2Negotiation(round1, profile, trace);
    
    state.round1Scores.set(unitId, round1.map(s => ({ ...s })));
    state.round2Scores.set(unitId, round1);  // round1 is mutated by Round 2
    
    // STEP 6: Resolution
    const sorted = round1.sort((a, b) => b.confidence - a.confidence);
    const winner = sorted[0];
    const gap = sorted.length >= 2 ? sorted[0].confidence - sorted[1].confidence : 1.0;
    
    const resolution: ContentUnitResolution = {
      classification: winner.agent as AgentType,
      confidence: winner.confidence,
      decisionSource: determineDecisionSource(signatures, winner),
      claimType: 'FULL',  // Phase H adds PARTIAL
      requiresHumanReview: gap < 0.15,
    };
    
    state.resolutions.set(unitId, resolution);
    
    // STEP 7: Record final trace
    trace.finalClassification = resolution.classification;
    trace.finalConfidence = resolution.confidence;
    trace.decisionSource = resolution.decisionSource;
    trace.requiresHumanReview = resolution.requiresHumanReview;
    trace.tenantContextApplied = [];  // Phase D populates
    trace.priorSignals = [];          // Phase E populates
    
    state.traces.set(unitId, trace);
  }
}

function applyRound2Negotiation(
  scores: AgentScore[],
  profile: ContentProfile,
  trace: ClassificationTrace
): void {
  // All Round 2 adjustments from current agents.ts:negotiateRound2
  // PLUS: presence-based adjustments only (no absence-based boosting)
  // Each adjustment records to trace.round2
  
  const transaction = scores.find(s => s.agent === 'transaction');
  const target = scores.find(s => s.agent === 'target');
  const entity = scores.find(s => s.agent === 'entity');
  
  const repeatRatio = profile.structure.identifierRepeatRatio;
  const hasTemporal = profile.patterns.hasTemporalColumns || profile.patterns.hasDateColumn;
  
  // Target penalty when repeat ratio contradicts target pattern
  if (target && target.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.25, (repeatRatio - 1.0) * 0.08);
    target.confidence -= penalty;
    trace.round2.push({
      agent: 'target',
      adjustment: -penalty,
      reason: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts target pattern (targets set once per entity)`,
      evidenceProperty: 'identifierRepeatRatio',
      evidenceValue: repeatRatio,
    });
  }
  
  // Transaction boost when temporal + repeat confirms event pattern
  if (transaction && target && hasTemporal && repeatRatio > 1.5) {
    const boost = 0.10;
    transaction.confidence += boost;
    trace.round2.push({
      agent: 'transaction',
      adjustment: boost,
      reason: `Temporal columns + repeat ratio ${repeatRatio.toFixed(1)} confirms event/transaction pattern`,
      evidenceProperty: 'identifierRepeatRatio + hasTemporalColumns',
      evidenceValue: { repeatRatio, hasTemporal },
    });
  }
  
  // Entity penalty when repeat ratio contradicts roster pattern
  if (entity && entity.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.20, (repeatRatio - 1.0) * 0.07);
    entity.confidence -= penalty;
    trace.round2.push({
      agent: 'entity',
      adjustment: -penalty,
      reason: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts roster pattern (rosters have ~1.0)`,
      evidenceProperty: 'identifierRepeatRatio',
      evidenceValue: repeatRatio,
    });
  }
  
  // Entity vs Target: high numeric ratio shifts toward target
  if (entity && target && Math.abs(entity.confidence - target.confidence) < 0.15) {
    const numericRatio = profile.structure.numericFieldRatio;
    if (numericRatio > 0.50) {
      const shift = 0.08;
      entity.confidence -= shift;
      target.confidence += shift;
      trace.round2.push({
        agent: 'entity',
        adjustment: -shift,
        reason: `${(numericRatio * 100).toFixed(0)}% numeric fields — entity rosters are attribute-heavy`,
        evidenceProperty: 'numericFieldRatio',
        evidenceValue: numericRatio,
      });
    }
  }
  
  // Absence clarity boost — clear winner gets small boost
  const sorted = scores.sort((a, b) => b.confidence - a.confidence);
  if (sorted.length >= 2) {
    const gap = sorted[0].confidence - sorted[1].confidence;
    if (gap > 0.25) {
      sorted[0].confidence = Math.min(0.98, sorted[0].confidence + 0.05);
      trace.round2.push({
        agent: sorted[0].agent,
        adjustment: 0.05,
        reason: `Absence clarity: gap of ${(gap * 100).toFixed(0)}% to next agent`,
        evidenceProperty: 'scoring_gap',
        evidenceValue: gap,
      });
    }
  }
  
  // Clamp
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }
}

function determineDecisionSource(
  signatures: SignatureMatch[],
  winner: AgentScore
): ContentUnitResolution['decisionSource'] {
  // If the winner matched a signature, decision source is 'signature'
  if (signatures.some(s => s.agent === winner.agent)) return 'signature';
  // Otherwise it's 'heuristic' (additive weights + negotiation)
  return 'heuristic';
}
```

### 3B: Update Analyze Route

Replace the current fragmented flow with the consolidated pipeline:

```typescript
// In analyze/route.ts:

// 1. Generate Content Profiles (Phase A)
const profiles = new Map<string, ContentProfile>();
for (const sheet of file.sheets) {
  const profile = generateContentProfile(/* ... */);
  profiles.set(sheet.sheetName, profile);
}

// 2. Enhance with header comprehension (Phase B)
await enhanceWithHeaderComprehension(profiles, /* ... */);

// 3. Create Synaptic Ingestion State (Phase C)
const state = createIngestionState(tenantId, file.fileName, profiles);

// 4. Classify all content units through consolidated pipeline
classifyContentUnits(state);

// 5. Build proposal from state
const proposal = buildProposalFromState(state);
return proposal;
```

### 3C: Remove Old Scoring Paths

After consolidation:
- The local `negotiateRound2` in `agents.ts` can be removed (logic moved to `applyRound2Negotiation` in synaptic-ingestion-state.ts)
- The `negotiation.ts` file's `negotiateRound2` can be simplified or removed — it wraps `scoreContentUnit` which is now replaced by `classifyContentUnits`
- `scoreContentUnit` in `agents.ts` can be refactored to export only `computeAdditiveScores` (the per-agent scoring) and `applyHeaderComprehensionSignals`
- The orchestration lives in `synaptic-ingestion-state.ts`

**IMPORTANT:** Do not break the proposal UI. Whatever the analyze route returns must still render the SCI proposal cards in the import page. Verify the proposal response format is unchanged.

### Proof Gates — Phase 3
- PG-18: `classifyContentUnits` function exists in synaptic-ingestion-state.ts
- PG-19: Single scoring flow: signatures → additive → signature floors → header comprehension → Round 2 → resolution
- PG-20: ONE `negotiateRound2`/`applyRound2Negotiation` function (no duplicates)
- PG-21: ClassificationTrace populated for every content unit
- PG-22: Trace includes round1, signatureChecks, round2, finalClassification
- PG-23: Analyze route uses createIngestionState → classifyContentUnits → buildProposalFromState
- PG-24: Proposal response format unchanged (SCI proposal cards still render)
- PG-25: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160C Phase 3: Consolidated scoring pipeline through Synaptic Ingestion State" && git push origin dev`

---

## PHASE 4: SIGNATURE CONDITIONS UPDATE

### 4A: Update Signature Conditions for Header Comprehension

Signatures currently use structural properties from Phase A. Add header comprehension as a REINFORCING signal — when both structural detection and LLM agree, the signature is stronger:

In `signatures.ts`, update the Transaction signature:

```typescript
// TRANSACTION SIGNATURE — current:
// hasHighRepeat && hasTemporalDimension && isDataHeavy

// Enhanced: also check header comprehension if available
const hasHighRepeat = profile.structure.identifierRepeatRatio > 1.5;
const hasTemporalDimension = profile.patterns.hasTemporalColumns || profile.patterns.hasDateColumn;
const isDataHeavy = profile.structure.numericFieldRatio > 0.40;

// Header comprehension reinforcement (when available)
let headerTemporalConfirm = false;
let headerMeasureConfirm = false;
if (profile.headerComprehension) {
  const interps = profile.headerComprehension.interpretations;
  headerTemporalConfirm = [...interps.values()].some(i => i.columnRole === 'temporal');
  headerMeasureConfirm = [...interps.values()].filter(i => i.columnRole === 'measure').length >= 3;
}

// Signature fires on structural signals alone (Phase A sufficient)
// Header comprehension boosts confidence when it confirms
if (hasHighRepeat && hasTemporalDimension && isDataHeavy) {
  let confidence = 0.80;
  if (headerTemporalConfirm) confidence += 0.05;
  if (headerMeasureConfirm) confidence += 0.05;
  matches.push({ agent: 'transaction', confidence: Math.min(0.95, confidence), ... });
}
```

Apply similar reinforcement to Entity, Target, Reference, and Plan signatures where header comprehension can confirm structural observations.

**CRITICAL:** Signatures must fire on structural signals ALONE (Phase A). Header comprehension is a BONUS, not a requirement. When the LLM is unavailable, signatures still work.

### Proof Gates — Phase 4
- PG-26: Transaction signature fires on structural signals alone (no header comprehension required)
- PG-27: Header comprehension boosts signature confidence when available and confirming
- PG-28: All 5 signatures work correctly when headerComprehension is null
- PG-29: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160C Phase 4: Signature conditions updated with header comprehension reinforcement" && git push origin dev`

---

## PHASE 5: BUILD + VERIFY + PR

### 5A: Final Build

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 5B: Code Verification

```bash
# Korean Test — zero field-name matching in scoring
grep -rn "containsTarget\|containsAmount\|containsRate\|\"license\"\|\"licencia\"\|\"meta\"\|\"objetivo\"" \
  web/src/lib/sci/agents.ts | grep -v "//" | grep -v "console"
# Must return ZERO

# Single scoring flow
grep -rn "scoreContentUnit\|negotiateRound2" web/src/lib/sci/ --include="*.ts" | head -20
# scoreContentUnit should be internal/removed from agents.ts
# negotiateRound2 should not exist as a duplicate

# Synaptic Ingestion State used in analyze route
grep -rn "createIngestionState\|classifyContentUnits\|buildProposalFromState" \
  web/src/app/api/import/sci/analyze/ --include="*.ts"

# Classification trace populated
grep -rn "ClassificationTrace\|trace\." web/src/lib/sci/synaptic-ingestion-state.ts | head -20
```

### 5C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160C: Agent Scoring — Korean Test Cleanup + Header Comprehension + Synaptic Ingestion State" \
  --body "Phase C of 12-phase SCI Development Plan. Rebuilds the scoring layer on Phase A (structural foundation) and Phase B (header comprehension).

## What Changed

### 1. Korean Test Cleanup
Removed ALL nameSignals field-name matching from agent scoring:
- has_target_field (+0.25 from 'meta'/'target'): REMOVED
- has_license_field (+0.10 from 'license'): REMOVED
- has_name_field: REPLACED with structural has_structural_name

### 2. Header Comprehension Wired Into Scoring
Agents read ColumnRole from Phase B's header comprehension:
- Transaction: boosted by LLM-identified temporal + measure columns
- Entity: boosted by LLM-identified name + attribute columns, penalized by temporal
- Target: penalized by LLM-identified temporal columns
- Reference: boosted by LLM-identified reference_key columns
All signals are ADDITIVE — scoring works without header comprehension (LLM unavailable)

### 3. Synaptic Ingestion State
Consolidated two negotiateRound2 functions into single flow through shared state:
createIngestionState → classifyContentUnits → buildProposalFromState
All scoring, negotiation, and resolution flow through SynapticIngestionState.
Classification trace recorded for every content unit.

### 4. Signature Reinforcement
Composite signatures fire on structural signals alone (Phase A).
Header comprehension boosts signature confidence when available and confirming.
Signatures work without LLM.

## Implementation Completeness
Layers 1-4 of SCI Specification complete:
- Layer 1: Content Profile (Phase A + B) ✅
- Layer 2: Agent Scoring (Phase C) ✅
- Layer 3: Confidence Scoring Tier 1 (Phase C) ✅
- Layer 4: Negotiation through Synaptic Ingestion State (Phase C) ✅
Gap: Tier 2 (tenant context — Phase D), Tier 3 (prior signals — Phase E)"
```

### Proof Gates — Phase 5
- PG-30: `npm run build` exits 0
- PG-31: localhost:3000 responds
- PG-32: Zero Korean Test violations in agents.ts (grep)
- PG-33: Single scoring flow through SynapticIngestionState
- PG-34: Classification trace populated for every content unit
- PG-35: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160C Complete: Agent Scoring + Synaptic Ingestion State" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Remove all nameSignals from agent scoring (Korean Test cleanup)
- Wire headerComprehension.ColumnRole into agent scoring signals
- Create SynapticIngestionState (synaptic-ingestion-state.ts)
- Create ClassificationTrace structure
- Consolidate two negotiateRound2 functions into single pipeline
- Update analyze route to use consolidated pipeline
- Signature reinforcement from header comprehension
- PARTIAL claim interfaces (defined, not exercised — Phase H)

### OUT OF SCOPE — DO NOT TOUCH
- Content Profile type detection (Phase A — complete)
- Header comprehension service (Phase B — complete)
- Tenant context queries (Phase D)
- Signal storage (Phase E)
- Execute pipeline / routing (Phase F)
- Auth files, calculation engine

### CRITICAL CONSTRAINTS

1. **Korean Test:** ZERO field-name matching in scoring. All `nameSignals.containsTarget`, `containsAmount`, etc. REMOVED from scoring weights. nameSignals may still exist in observation text — that's OK. Scoring logic: zero.
2. **Header comprehension is ADDITIVE.** When `profile.headerComprehension` is null (LLM unavailable), scoring works on structural signals alone. Zero hard dependencies on LLM.
3. **Signatures fire on structural signals ALONE.** Header comprehension REINFORCES, it doesn't gate signatures.
4. **ONE scoring flow.** No duplicate negotiateRound2 functions. classifyContentUnits is the single entry point.
5. **Proposal format unchanged.** SCI proposal cards in the import page must still render correctly.
6. **Round 2 adjustments are presence-based only.** No absence-based boosting. Every adjustment cites a structural property and explains why it contradicts the agent's claim.
7. **ClassificationTrace is STRUCTURED.** Not console.log statements. A typed object that Phase E will store.
8. **One commit per phase.** Do not collapse phases into single commits.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-25 | Korean Test violation | Zero nameSignals in scoring weights |
| AP-17 | Dual code paths | ONE classifyContentUnits function, no duplicate negotiateRound2 |
| NEW | Hard dependency on header comprehension | All scoring works when headerComprehension is null |
| NEW | Signature gated by LLM | Signatures fire on structural signals, LLM reinforces only |
| NEW | Absence-based Round 2 adjustments | Presence-based matching only |
| NEW | Unstructured trace (console.log) | ClassificationTrace is a typed interface |

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification:**
- Layer 2 (Agent Scoring): "Four agents, each with a recognition model that maps structural patterns to content-type confidence." → DELIVERED with Korean Test compliance + header comprehension integration
- Layer 3 Tier 1 (Structural Heuristics): "Pattern matching against the Content Profile." → DELIVERED
- Layer 4 (Negotiation): "All agents see all scores. Negotiation is spatial." → DELIVERED through SynapticIngestionState

**Gap to full specification:**
- Layer 3 Tier 2 (Tenant Context): Phase D
- Layer 3 Tier 3 (Prior Signals / Flywheel): Phase E
- Layer 4 PARTIAL Claims: Phase H (interfaces defined in Phase C)

---

## COMPLETION REPORT ENFORCEMENT

File: `OB-160C_COMPLETION_REPORT.md` in PROJECT ROOT
Created BEFORE final build verification.

### Structure
1. **Korean Test audit** — list every removed nameSignals reference with before/after
2. **Header comprehension signals** — show which ColumnRole signals each agent reads
3. **Scoring flow consolidation** — before (two functions) vs after (one pipeline)
4. **Classification trace example** — paste a real trace from one content unit
5. **Proof gates** — 35 gates, PASS/FAIL with evidence
6. **Implementation Completeness Gate** — Layers 1-4 status

---

*ViaLuce.ai — The Way of Light*
*OB-160C: "The agents collaborate through shared state. They see each other's scores. They read the headers the LLM understood. They adjust based on structural evidence. And every step is recorded in a trace that becomes the flywheel's memory."*
