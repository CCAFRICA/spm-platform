# OB-160E PHASE E: CLASSIFICATION SIGNALS + FLYWHEEL
## "The system remembers what it learned"
## SCI Development Plan Phase E of 12 (A through L)
## Target: Current release
## Depends on: OB-160D (PR #185 — must be merged)
## Priority: P0 — Implements SCI Spec Layer 6 + Tenant Flywheel + Signal Persistence

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 6: Signal Capture
4. `web/src/lib/sci/synaptic-ingestion-state.ts` — current SynapticIngestionState with TenantContext (Phase D)
5. `web/src/lib/sci/sci-types.ts` — ClassificationTrace, ContentProfile, HeaderComprehension interfaces
6. `web/src/lib/sci/header-comprehension.ts` — vocabulary binding interface (lookupVocabularyBindings)
7. `web/src/lib/sci/tenant-context.ts` — Phase D's tenant context service
8. `web/src/app/api/import/sci/analyze/route.ts` — the analyze flow
9. `web/src/app/api/import/sci/execute/route.ts` — the execute flow (where signals are written after confirmation)

**ALSO CHECK:** Does a `classification_signals` table already exist? OB-86 created a classification signal service. Run:
```bash
grep -rn "classification_signals\|classification-signal" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -20
```
And check the database:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'classification_signals' ORDER BY ordinal_position;
```

If the table exists, Phase E extends it with the columns the Dev Plan requires (structural_fingerprint, classification_trace, vocabulary_bindings, etc.). If it doesn't exist, Phase E creates it.

---

## MANDATORY INTERFACE VERIFICATION (Gaps from Phase A-D)

Before writing ANY code, verify and paste the output for each of these. These are integration points where prior phases' completion reports provided line numbers but not pasted evidence.

```bash
# GAP 1: ClassificationTrace actual shape
grep -A 30 "interface ClassificationTrace\|type ClassificationTrace" \
  web/src/lib/sci/synaptic-ingestion-state.ts web/src/lib/sci/sci-types.ts

# GAP 2: SynapticIngestionState actual shape (full interface)
grep -A 40 "interface SynapticIngestionState\|class SynapticIngestionState" \
  web/src/lib/sci/synaptic-ingestion-state.ts

# GAP 3: ContentProfile identifierColumn field name
grep -n "identifierColumn\|identifierField\|identifier" \
  web/src/lib/sci/sci-types.ts web/src/lib/sci/content-profile.ts | head -15

# GAP 4: Vocabulary binding interface — exact function signatures
grep -n "lookupVocabularyBindings\|prepareVocabularyBindings\|VocabularyBinding" \
  web/src/lib/sci/header-comprehension.ts | head -10

# GAP 5: Existing classification signal infrastructure from OB-86
grep -rn "captureSignal\|ClassificationSignal\|signal_type\|signal_value" \
  web/src/lib/ai/ web/src/lib/sci/ --include="*.ts" | head -15

# GAP 6: Execute route — where does confirmation/execution happen?
grep -n "execute\|confirm\|override" \
  web/src/app/api/import/sci/execute/route.ts | head -15
```

Paste ALL output into your Architecture Decision record. Document any interfaces that differ from the Dev Plan v2 specification. If a gap is found, note it and design around the ACTUAL interface — don't assume the spec matches reality.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Phase 0: Interface verification + architecture decision" && git push origin dev`

---

## CONTEXT

### What Phases A-D Delivered

**Phase A (PR #182):** Content Profile — structural truth with ProfileObservation signal interface.
**Phase B (PR #183):** Header comprehension — LLM contextual understanding, vocabulary binding interface (returns empty map), measurement metrics.
**Phase C (PR #184):** Agent scoring — signatures, Round 2 through SynapticIngestionState, ClassificationTrace structure defined and populated per import.
**Phase D (PR #185):** Tenant context — presence-based matching, entity ID overlap, adjustments recorded in ClassificationTrace.tenantContextApplied.

### What Phase E Delivers

Phase E transitions the SCI pipeline from **stateless** to **learning.** Before Phase E, every import starts from zero — no memory of past imports. After Phase E, the system:

1. **Persists** every classification decision as a structured signal in the database
2. **Consults** prior signals before scoring new imports (Tier 3 of the resolution chain)
3. **Stores** vocabulary bindings so the LLM doesn't need to re-interpret known headers
4. **Captures** human overrides as the highest-value flywheel data
5. **Measures** accuracy, override rate, and LLM call frequency

This is the bridge from "the system classifies" to "the system learns."

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
  Phase B: Header Comprehension ✅ (PR #183)
  Phase C: Agent Scoring + Signatures + Negotiation ✅ (PR #184)
  Phase D: Tenant Context ✅ (PR #185)
→ PHASE E: Classification Signals + Flywheel ← YOU ARE HERE
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
| 25 | Korean Test | Structural fingerprints use numeric ratios, not field names |
| 92/93 | Period is not an import concept | Signals do NOT reference periods |
| 99 | Composite signatures as confidence floors | Prior signals layer on top, don't override signature floors |
| 101 | Headers are content to be understood | Vocabulary bindings store the LLM's contextual understanding |
| 106 | One LLM call per file | Prior vocabulary bindings can SKIP the LLM call entirely |
| 107 | Three-level classification signals | Level 1 (Classification) + Level 2 (Comprehension) in this phase. Level 3 (Convergence) in Phase G |

### OB-86 Reconciliation

OB-86 built a classification signal service in `web/src/lib/ai/classification-signal-service.ts` with a different schema than the Dev Plan v2 specifies. The Dev Plan requires:
- `structural_fingerprint` JSONB — for matching structurally similar future uploads
- `classification_trace` JSONB — the full trace from Phase C/D
- `vocabulary_bindings` JSONB — confirmed header → meaning mappings
- `human_correction_from` TEXT — original classification if overridden
- `scope` TEXT — tenant / foundational / domain

Phase E must reconcile with whatever OB-86 created. Options:
1. **Extend the existing table** with missing columns (if table exists but lacks Dev Plan columns)
2. **Migrate data and reshape** (if schema conflicts)
3. **Create fresh** (if OB-86's work was wiped in the nuclear clear)

The nuclear clear on March 4 deleted all tenants and data. The OB-86 signal SERVICE code may still exist in the codebase even if the DATA is gone. CC must check both code and database state.

---

## ARCHITECTURE DECISION GATE

```
DECISION 1: Where do classification signals get written?

Option A: At analyze time (when classification is determined)
  - Signals written immediately after scoring
  - Problem: user hasn't confirmed yet — this records the AI's prediction, not the outcome
  REJECTED: Two-phase capture is correct — prediction at analyze, outcome at execute/confirm

Option B: At execute/confirm time (when user confirms or overrides)
  - Signal written with both prediction AND outcome
  - Captures decision_source: 'heuristic', 'signature', 'llm', 'human_confirmed', 'human_override'
  - The ClassificationTrace from analyze is passed to execute and stored as part of the signal
  CHOSEN: Aligns with AI Measurement Framework (two-phase capture)

Option C: Both (prediction at analyze, outcome update at execute)
  - Most complete but adds complexity
  - For V1: single write at confirm time is sufficient
  NOTED: Can evolve to two-phase in Phase K (adaptive execution)

CHOSEN: Option B — write signal at execute/confirm time with full trace

DECISION 2: How are structural fingerprints computed?

  Fingerprint = {
    columnCount: number,
    numericFieldRatio: bucket,     // 0-0.25, 0.25-0.50, 0.50-0.75, 0.75-1.0
    categoricalFieldRatio: bucket,
    identifierRepeatRatio: bucket, // 0-1, 1-2, 2-5, 5-10, 10+
    hasTemporalColumns: boolean,
    hasIdentifier: boolean,
    hasStructuralName: boolean,
    rowCountBucket: string         // 'small' (<50), 'medium' (50-500), 'large' (500-5000), 'enterprise' (5000+)
  }
  
  Bucketed values, not exact — so structurally similar files match even with slightly different counts.
  CHOSEN: Bucketed structural fingerprint

DECISION 3: How does prior signal consultation work in the scoring pipeline?

  Position in pipeline:
  1. Content Profile (Phase A)
  2. Header Comprehension (Phase B)  
  3. Tenant Context query (Phase D)
  4. ──► Prior Signal consultation (Phase E) ◄──
  5. Round 1 scoring (Phase C)
  6. Tenant Context adjustments (Phase D)
  7. Signature matching (Phase C)
  8. Round 2 negotiation (Phase C)
  
  Prior signals run BEFORE Round 1 scoring.
  They are the FIRST input to the scoring pipeline (after structural observations).
  If a prior signal matches, it boosts the matching agent by +0.10 and appears in ClassificationTrace.priorSignals.
  Prior signals INFORM, they don't DICTATE. The boost is additive, not a floor override.
  
  CHOSEN: Prior signal consultation between tenant context query and Round 1 scoring
```

---

## PHASE 1: CLASSIFICATION SIGNAL TABLE + SERVICE

### 1A: Verify/Create classification_signals Table

Check if the table exists and what columns it has. If it exists from OB-86, extend it with the Dev Plan columns. If it doesn't exist, create it.

**Dev Plan v2 schema:**
```sql
CREATE TABLE IF NOT EXISTS classification_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_file_name TEXT,
  sheet_name TEXT,
  structural_fingerprint JSONB NOT NULL,
  classification TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  decision_source TEXT NOT NULL,           -- 'signature' | 'heuristic' | 'llm' | 'human_confirmed' | 'human_override' | 'prior_signal'
  classification_trace JSONB,              -- full ClassificationTrace from Phase C/D
  header_comprehension JSONB,              -- LLM interpretations from Phase B
  vocabulary_bindings JSONB,               -- confirmed header → meaning mappings
  agent_scores JSONB,                      -- all agent scores (Round 1 + Round 2)
  human_correction_from TEXT,              -- if overridden: original classification
  scope TEXT NOT NULL DEFAULT 'tenant',    -- 'tenant' | 'foundational' | 'domain'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: tenant isolation
ALTER TABLE classification_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants see own signals" ON classification_signals
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role inserts signals" ON classification_signals
  FOR INSERT WITH CHECK (true);

-- Index for prior signal lookup by tenant + fingerprint
CREATE INDEX idx_classification_signals_tenant_fingerprint 
  ON classification_signals(tenant_id, (structural_fingerprint->>'columnCount'));
```

**IMPORTANT:** Execute this migration in the Supabase SQL Editor. Verify it exists with a database query. File existence ≠ applied (AP-8).

### 1B: Create Signal Service

Create `web/src/lib/sci/classification-signal-service.ts`:

```typescript
/**
 * Classification Signal Service
 * SCI Spec Layer 6 — signal capture, storage, and retrieval
 * 
 * Captures classification decisions as structured signals for the tenant flywheel.
 * Two-phase: prediction at analyze time → outcome at confirm/execute time.
 * 
 * Phase E of 12 (SCI Development Plan v2)
 */

import { createClient } from '@supabase/supabase-js';
import type { ClassificationTrace, ContentProfile, HeaderComprehension } from './sci-types';

// ── Structural Fingerprint ──
// Bucketed values for matching structurally similar uploads
export interface StructuralFingerprint {
  columnCount: number;
  numericFieldRatioBucket: string;      // '0-25' | '25-50' | '50-75' | '75-100'
  categoricalFieldRatioBucket: string;
  identifierRepeatBucket: string;       // '0-1' | '1-2' | '2-5' | '5-10' | '10+'
  hasTemporalColumns: boolean;
  hasIdentifier: boolean;
  hasStructuralName: boolean;
  rowCountBucket: string;               // 'small' | 'medium' | 'large' | 'enterprise'
}

export function computeStructuralFingerprint(profile: ContentProfile): StructuralFingerprint {
  const bucketRatio = (r: number): string => {
    if (r < 0.25) return '0-25';
    if (r < 0.50) return '25-50';
    if (r < 0.75) return '50-75';
    return '75-100';
  };

  const bucketRepeat = (r: number): string => {
    if (r <= 1) return '0-1';
    if (r <= 2) return '1-2';
    if (r <= 5) return '2-5';
    if (r <= 10) return '5-10';
    return '10+';
  };

  const bucketRows = (n: number): string => {
    if (n < 50) return 'small';
    if (n < 500) return 'medium';
    if (n < 5000) return 'large';
    return 'enterprise';
  };

  return {
    columnCount: profile.columnCount ?? 0,
    numericFieldRatioBucket: bucketRatio(profile.numericFieldRatio ?? 0),
    categoricalFieldRatioBucket: bucketRatio(profile.categoricalFieldRatio ?? 0),
    identifierRepeatBucket: bucketRepeat(profile.identifierRepeatRatio ?? 0),
    hasTemporalColumns: profile.hasTemporalColumns ?? false,
    hasIdentifier: profile.hasIdentifier ?? false,
    hasStructuralName: profile.hasStructuralName ?? false,
    rowCountBucket: bucketRows(profile.rowCount ?? 0),
  };
}

// ── Signal Write ──
// Called at execute/confirm time — writes one signal per content unit
export async function writeClassificationSignal(
  tenantId: string,
  sourceFileName: string,
  sheetName: string,
  fingerprint: StructuralFingerprint,
  classification: string,
  confidence: number,
  decisionSource: string,
  classificationTrace: ClassificationTrace,
  headerComprehension: HeaderComprehension | null,
  vocabularyBindings: Record<string, string> | null,
  agentScores: Record<string, number>,
  humanCorrectionFrom: string | null,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('classification_signals')
    .insert({
      tenant_id: tenantId,
      source_file_name: sourceFileName,
      sheet_name: sheetName,
      structural_fingerprint: fingerprint,
      classification,
      confidence,
      decision_source: decisionSource,
      classification_trace: classificationTrace,
      header_comprehension: headerComprehension,
      vocabulary_bindings: vocabularyBindings,
      agent_scores: agentScores,
      human_correction_from: humanCorrectionFrom,
      scope: 'tenant',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SCI Signal] Write failed:', error.message);
    return null;
  }

  return data?.id ?? null;
}

// ── Prior Signal Lookup ──
// Called BEFORE scoring to check if this tenant has seen similar content before
export interface PriorSignal {
  classification: string;
  confidence: number;
  source: string;           // decision_source from the prior signal
  fingerprintMatch: boolean;
  signalId: string;
}

export async function lookupPriorSignals(
  tenantId: string,
  fingerprint: StructuralFingerprint,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<PriorSignal[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Match by tenant + structural fingerprint buckets
  // A match means: this tenant has uploaded structurally similar content before
  const { data, error } = await supabase
    .from('classification_signals')
    .select('id, classification, confidence, decision_source, structural_fingerprint')
    .eq('tenant_id', tenantId)
    .eq('scope', 'tenant')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) {
    console.error('[SCI Signal] Prior lookup failed:', error?.message);
    return [];
  }

  // Filter for structural fingerprint matches
  return data
    .filter(signal => matchesFingerprint(signal.structural_fingerprint, fingerprint))
    .map(signal => ({
      classification: signal.classification,
      confidence: signal.confidence,
      source: signal.decision_source,
      fingerprintMatch: true,
      signalId: signal.id,
    }));
}

function matchesFingerprint(
  stored: StructuralFingerprint,
  current: StructuralFingerprint
): boolean {
  // Match on bucketed structural properties
  // All buckets must match for a fingerprint match
  return (
    stored.numericFieldRatioBucket === current.numericFieldRatioBucket &&
    stored.categoricalFieldRatioBucket === current.categoricalFieldRatioBucket &&
    stored.identifierRepeatBucket === current.identifierRepeatBucket &&
    stored.hasTemporalColumns === current.hasTemporalColumns &&
    stored.hasIdentifier === current.hasIdentifier &&
    stored.rowCountBucket === current.rowCountBucket
  );
}

// ── Vocabulary Binding Storage ──
// Wires Phase B's vocabulary binding interface to database persistence
export async function storeVocabularyBindings(
  tenantId: string,
  bindings: Record<string, string>,  // columnHeader → semanticMeaning
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  // Store bindings as part of classification signals
  // They're also queryable independently for the LLM-skip optimization (Phase K)
  // For now, they're stored on each classification_signals row via writeClassificationSignal
  // Phase K will create a dedicated lookup for fast vocabulary retrieval
  
  // This function is a no-op in Phase E — bindings are stored per-signal via writeClassificationSignal.
  // The Phase B interface (lookupVocabularyBindings) should be wired to query the MOST RECENT
  // classification_signals row for this tenant and extract the vocabulary_bindings JSONB.
}

export async function recallVocabularyBindings(
  tenantId: string,
  columnHeaders: string[],
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<Map<string, string>> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Query the most recent signal for this tenant that has vocabulary_bindings
  const { data, error } = await supabase
    .from('classification_signals')
    .select('vocabulary_bindings')
    .eq('tenant_id', tenantId)
    .not('vocabulary_bindings', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    return new Map();
  }

  // Merge bindings from recent signals, most recent takes precedence
  const bindings = new Map<string, string>();
  for (const signal of data.reverse()) {
    if (signal.vocabulary_bindings && typeof signal.vocabulary_bindings === 'object') {
      for (const [header, meaning] of Object.entries(signal.vocabulary_bindings as Record<string, string>)) {
        if (columnHeaders.includes(header)) {
          bindings.set(header, meaning);
        }
      }
    }
  }

  return bindings;
}
```

### Proof Gates — Phase 1
- PG-01: `classification_signals` table exists in Supabase (verified by schema query)
- PG-02: Table has ALL Dev Plan columns: structural_fingerprint, classification_trace, vocabulary_bindings, human_correction_from, scope
- PG-03: RLS enabled with tenant isolation policy
- PG-04: `classification-signal-service.ts` created with writeClassificationSignal, lookupPriorSignals, computeStructuralFingerprint
- PG-05: `StructuralFingerprint` uses bucketed values (not exact counts)
- PG-06: `matchesFingerprint` compares on structural buckets
- PG-07: `recallVocabularyBindings` queries classification_signals for stored bindings
- PG-08: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Phase 1: Classification signal table + service — write, prior lookup, vocabulary recall" && git push origin dev`

---

## PHASE 2: PRIOR SIGNAL CONSULTATION IN SCORING PIPELINE

### 2A: Wire Prior Signals into Analyze Flow

Prior signal consultation runs BEFORE Round 1 scoring, AFTER tenant context query:

```typescript
// In analyze route — AFTER queryTenantContext, BEFORE agent scoring:

import { computeStructuralFingerprint, lookupPriorSignals } from '@/lib/sci/classification-signal-service';

// For each content unit:
for (const unit of contentUnits) {
  // Compute structural fingerprint from content profile
  const fingerprint = computeStructuralFingerprint(unit.profile);

  // Look up prior signals for this tenant with matching fingerprint
  const priorSignals = await lookupPriorSignals(
    tenantId,
    fingerprint,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // If prior signals found, boost the matching agent
  if (priorSignals.length > 0) {
    // Use the most recent, highest-confidence prior signal
    const bestPrior = priorSignals.reduce((best, s) =>
      s.confidence > best.confidence ? s : best
    );

    // Record in ClassificationTrace
    unit.trace.priorSignals = priorSignals.map(s => ({
      classification: s.classification,
      confidence: s.confidence,
      source: s.source,
      fingerprint_match: s.fingerprintMatch,
    }));

    // The boost is applied during scoring — pass priorSignals to the scoring function
    // or store them on SynapticIngestionState for agents to read
    state.priorSignals.set(unit.id, priorSignals);
  }
}
```

### 2B: Apply Prior Signal Boost in Agent Scoring

The prior signal boost is +0.10 to the matching agent. This is additive — it doesn't override signature floors.

```typescript
// In the scoring pipeline (wherever agent scores are computed):
// After Round 1 scores, before or during Round 2:

const priorSignals = state.priorSignals.get(unitId) ?? [];
if (priorSignals.length > 0) {
  const bestPrior = priorSignals[0]; // most recent, already sorted by lookup
  // Find the agent matching the prior classification
  const matchingAgent = round1Scores.find(s => s.agent === bestPrior.classification);
  if (matchingAgent) {
    matchingAgent.confidence += 0.10;
    // Record the adjustment
    trace.tenantContextApplied.push({
      signal: 'prior_signal_match',
      adjustment: +0.10,
      evidence: `Prior import classified similar content as ${bestPrior.classification} at ${Math.round(bestPrior.confidence * 100)}% (${bestPrior.source})`
    });
  }
}
```

**Note:** If prior signal came from a human_override, the boost should be stronger (+0.15) since human corrections are the highest-confidence data. If from heuristic/signature, use +0.10.

### Proof Gates — Phase 2
- PG-09: `computeStructuralFingerprint` called per content unit in analyze route
- PG-10: `lookupPriorSignals` called per content unit BEFORE Round 1 scoring
- PG-11: Prior signal boost (+0.10) applied to matching agent
- PG-12: Human override prior signals get stronger boost (+0.15)
- PG-13: `ClassificationTrace.priorSignals` populated when priors found
- PG-14: Prior signals stored in SynapticIngestionState (state.priorSignals map)
- PG-15: When no prior signals exist (first import), pipeline proceeds normally with empty priorSignals
- PG-16: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Phase 2: Prior signal consultation — fingerprint matching + agent boost before Round 1" && git push origin dev`

---

## PHASE 3: SIGNAL WRITE AT EXECUTE/CONFIRM TIME

### 3A: Wire Signal Write into Execute Route

When the user confirms (or overrides) a classification and executes, write one signal per content unit:

```typescript
// In the execute route — AFTER classification is confirmed and data is processed:

import { writeClassificationSignal, computeStructuralFingerprint } from '@/lib/sci/classification-signal-service';

for (const unit of confirmedUnits) {
  const fingerprint = computeStructuralFingerprint(unit.profile);

  // Determine decision source
  const decisionSource = unit.wasOverridden
    ? 'human_override'
    : unit.trace.decisionSource;  // 'signature', 'heuristic', 'llm', 'prior_signal'

  // Extract vocabulary bindings from header comprehension
  const vocabularyBindings = extractVocabularyBindings(unit.profile.headerComprehension);

  await writeClassificationSignal(
    tenantId,
    unit.sourceFileName,
    unit.sheetName,
    fingerprint,
    unit.finalClassification,
    unit.finalConfidence,
    decisionSource,
    unit.trace,                    // full ClassificationTrace
    unit.profile.headerComprehension ?? null,
    vocabularyBindings,
    extractAgentScores(unit.trace),
    unit.wasOverridden ? unit.originalClassification : null,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

### 3B: Extract Vocabulary Bindings

```typescript
function extractVocabularyBindings(
  hc: HeaderComprehension | null | undefined
): Record<string, string> | null {
  if (!hc?.interpretations) return null;

  const bindings: Record<string, string> = {};
  // HeaderComprehension.interpretations may be a Map or Record — check actual type from Phase B
  const entries = hc.interpretations instanceof Map
    ? Array.from(hc.interpretations.entries())
    : Object.entries(hc.interpretations);

  for (const [column, interpretation] of entries) {
    if (interpretation && typeof interpretation === 'object' && 'semanticMeaning' in interpretation) {
      bindings[column] = (interpretation as { semanticMeaning: string }).semanticMeaning;
    }
  }

  return Object.keys(bindings).length > 0 ? bindings : null;
}
```

### 3C: Human Override Signal Capture

When a user changes a classification via the override dropdown:

```typescript
// The override generates a signal with:
// - decision_source: 'human_override'
// - classification: the NEW (corrected) classification
// - human_correction_from: the ORIGINAL (AI-assigned) classification
// - confidence: 1.0 (human is authoritative)

// This is the highest-value flywheel data.
// The structural fingerprint is the same as the original classification.
// Next time similar content is uploaded, the prior signal will reflect the CORRECTED classification.
```

### Proof Gates — Phase 3
- PG-17: `writeClassificationSignal` called in execute route for every confirmed content unit
- PG-18: Signal includes structural_fingerprint JSONB
- PG-19: Signal includes full classification_trace JSONB
- PG-20: Signal includes vocabulary_bindings JSONB (when header comprehension was used)
- PG-21: Human override sets decision_source='human_override' and human_correction_from=originalClassification
- PG-22: Signal scope = 'tenant'
- PG-23: Verify signal written to Supabase (query after test import)
- PG-24: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Phase 3: Signal write at execute time — full trace, vocabulary bindings, human override capture" && git push origin dev`

---

## PHASE 4: VOCABULARY BINDING RECALL (WIRE PHASE B INTERFACE)

### 4A: Wire recallVocabularyBindings into Phase B's Interface

Phase B created `lookupVocabularyBindings` that returns an empty map. Phase E wires it to the database:

```typescript
// In header-comprehension.ts — find the lookupVocabularyBindings function
// Wire it to call recallVocabularyBindings from classification-signal-service.ts

// BEFORE the LLM call, check if stored bindings cover the headers:
// 1. Call recallVocabularyBindings(tenantId, columnHeaders)
// 2. If ALL headers are covered → skip LLM call, use stored bindings
// 3. If SOME headers are covered → send only UNCOVERED headers to LLM
// 4. If NO headers are covered → full LLM call (first import behavior)

// The measurement metrics (columnsFromBindings vs columnsFromLLM) should reflect this.
```

### 4B: Integration with Header Comprehension Flow

The exact integration depends on Phase B's implementation. The principle:

```
Import begins →
  recallVocabularyBindings(tenantId, allColumnHeaders) →
    if all bound → skip LLM, return stored interpretations
    if partial → LLM call for unbound headers only
    if none → full LLM call (standard Phase B behavior)
```

This is how LLM calls per import decrease for established tenants. The flywheel metric: `columnsFromBindings / columnsInterpreted` should increase over the tenant's lifetime.

### Proof Gates — Phase 4
- PG-25: `lookupVocabularyBindings` in header-comprehension.ts now queries database
- PG-26: When vocabulary bindings exist for all headers, LLM is NOT called (llmCalled = false in metrics)
- PG-27: When vocabulary bindings exist for some headers, only uncovered headers sent to LLM
- PG-28: Metrics correctly reflect columnsFromBindings vs columnsFromLLM split
- PG-29: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Phase 4: Vocabulary binding recall — wire Phase B interface to database persistence" && git push origin dev`

---

## PHASE 5: CLASSIFICATION TRACE API ENDPOINT

### 5A: Create Trace Query Endpoint

This endpoint returns the full ClassificationTrace for a given import session. This is required by the pre-CLT verification registry (Section 2.1) and supports both CC verification scripts and browser-based inspection.

Create `web/src/app/api/import/sci/trace/route.ts`:

```typescript
/**
 * GET /api/import/sci/trace?tenantId=X
 * Returns classification signals with full traces for the tenant.
 * 
 * Query params:
 * - tenantId (required): tenant UUID
 * - limit (optional): max signals to return (default 10)
 * - sourceFile (optional): filter by source file name
 */

export async function GET(request: Request) {
  // Parse query params
  // Query classification_signals for tenant
  // Return signals with full classification_trace, header_comprehension, agent_scores
  // Include structural_fingerprint and decision_source for each
  
  // Response shape:
  // {
  //   signals: [
  //     {
  //       id, sheet_name, source_file_name,
  //       classification, confidence, decision_source,
  //       structural_fingerprint,
  //       classification_trace: { ... full trace ... },
  //       header_comprehension: { ... },
  //       vocabulary_bindings: { ... },
  //       agent_scores: { ... },
  //       human_correction_from,
  //       created_at
  //     }
  //   ],
  //   count: number,
  //   tenant_id: string
  // }
}
```

### Proof Gates — Phase 5
- PG-30: `/api/import/sci/trace` endpoint exists and responds
- PG-31: Returns classification signals with full ClassificationTrace
- PG-32: Supports tenantId filter
- PG-33: Returns empty array when no signals exist (not an error)
- PG-34: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Phase 5: Classification trace API — queryable trace endpoint for verification and debugging" && git push origin dev`

---

## PHASE 6: BUILD + VERIFY + PR

### 6A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 6B: Code Review Verification

```bash
# 1. Verify classification-signal-service.ts exists
ls -la web/src/lib/sci/classification-signal-service.ts

# 2. Verify trace endpoint exists
ls -la web/src/app/api/import/sci/trace/route.ts

# 3. Verify ZERO Korean Test violations
grep -rn '"mes"\|"month"\|"nombre"\|"employee"\|"hub"\|"target"' \
  web/src/lib/sci/classification-signal-service.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 4. Verify ZERO period references
grep -rn "period\|Period" \
  web/src/lib/sci/classification-signal-service.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 5. Verify writeClassificationSignal called in execute route
grep -rn "writeClassificationSignal" \
  web/src/app/api/import/sci/ --include="*.ts" | head -10

# 6. Verify lookupPriorSignals called in analyze route
grep -rn "lookupPriorSignals\|priorSignals" \
  web/src/app/api/import/sci/analyze/ --include="*.ts" | head -10

# 7. Verify vocabulary binding recall wired in header-comprehension.ts
grep -rn "recallVocabularyBindings\|lookupVocabularyBindings" \
  web/src/lib/sci/header-comprehension.ts | head -10

# 8. Verify classification_signals table exists in Supabase
# Run in SQL Editor:
# SELECT column_name, data_type FROM information_schema.columns 
# WHERE table_name = 'classification_signals' ORDER BY ordinal_position;

# 9. Verify structural fingerprint uses buckets, not exact values
grep -n "bucketRatio\|bucketRepeat\|bucketRows\|Bucket" \
  web/src/lib/sci/classification-signal-service.ts | head -10
```

### 6C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160E: Classification Signals + Flywheel — the system remembers what it learned" \
  --body "Phase E of 12-phase SCI Development Plan. Implements SCI Spec Layer 6 + Tenant Flywheel.

## What Changed

### 1. Classification Signal Table + Service (NEW)
- classification_signals table with structural_fingerprint, classification_trace, vocabulary_bindings
- Signal written per content unit at execute/confirm time
- Full ClassificationTrace stored as flywheel raw material
- Human overrides captured with highest-value correction signal

### 2. Prior Signal Consultation (Tier 3)
- Before scoring, check if tenant has seen structurally similar content before
- Structural fingerprint matching using bucketed values (not exact counts)
- Prior signal boosts matching agent: +0.10 (heuristic) / +0.15 (human_override)
- Prior signals appear in ClassificationTrace.priorSignals

### 3. Vocabulary Binding Persistence
- Phase B's vocabulary binding interface now wired to database
- Header interpretations stored per import, recalled on subsequent imports
- When all headers have stored bindings → LLM call skipped
- Flywheel metric: LLM calls per import should decrease for established tenants

### 4. Classification Trace API
- GET /api/import/sci/trace — queryable endpoint for full trace inspection
- Returns all classification layers: Content Profile, Header Comprehension, Agent Scoring, Tenant Context, Prior Signals
- Supports verification scripts and browser-based debugging

## Implementation Completeness
SCI Spec Layer 6: 'Every agent claim, every user confirmation, every correction generates signals at three levels.'
Phase E delivers: Level 1 (Classification) + Level 2 (Comprehension) capture, prior signal consultation, vocabulary binding persistence.
Gap: Level 3 (Convergence) signals — Phase G."
```

### Proof Gates — Phase 6
- PG-35: `npm run build` exits 0
- PG-36: localhost:3000 responds
- PG-37: Zero Korean Test violations (grep returns zero)
- PG-38: Zero period references (grep returns zero)
- PG-39: classification_signals table exists with all Dev Plan columns (DB query)
- PG-40: writeClassificationSignal called in execute route
- PG-41: lookupPriorSignals called in analyze route
- PG-42: Vocabulary binding recall wired in header-comprehension.ts
- PG-43: /api/import/sci/trace endpoint responds
- PG-44: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160E Complete: Classification Signals + Flywheel — SCI Spec Layer 6" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- classification_signals table (create or extend from OB-86)
- StructuralFingerprint computation (bucketed)
- writeClassificationSignal (at execute/confirm time)
- lookupPriorSignals (before scoring)
- Prior signal boost application (+0.10/+0.15)
- recallVocabularyBindings (wire Phase B interface to DB)
- Human override signal capture
- ClassificationTrace.priorSignals population
- SynapticIngestionState.priorSignals map
- /api/import/sci/trace endpoint
- RLS policies for classification_signals

### OUT OF SCOPE — DO NOT TOUCH
- Agent scoring functions (Phase C — prior signals are an INPUT, not a modification)
- Composite signatures (Phase C)
- Tenant context logic (Phase D)
- Content Profile type detection (Phase A)
- Execute pipeline routing (Phase F)
- Convergence / input_bindings (Phase G)
- Cross-tenant flywheel (Phase I — tenant scope only in Phase E)
- Domain flywheel (Phase J)
- Synaptic density / adaptive execution (Phase K)
- Pattern promotion (Phase L)
- Auth files
- Calculation engine

### CRITICAL CONSTRAINTS

1. **Tenant scope only.** Phase E signals have `scope = 'tenant'`. Cross-tenant anonymization is Phase I. Domain scoping is Phase J.
2. **Prior signals INFORM, don't DICTATE.** +0.10/+0.15 boost is additive. It doesn't override signature floors (Decision 99).
3. **Structural fingerprints use BUCKETS.** Not exact counts. A file with 8 columns and one with 9 columns should match if their ratios are in the same bucket.
4. **Korean Test compliance.** Fingerprints use numeric ratios and boolean flags, not field names.
5. **Decision 92/93.** Zero period references in signal service or fingerprint computation.
6. **Vocabulary bindings are per-column-header.** Stored as `{ headerName: semanticMeaning }`. The header name is the customer's original text — this is NOT a Korean Test violation because the match is exact string equality on the customer's own column names, not a hardcoded dictionary.
7. **Signal write is defensive.** If writeClassificationSignal fails, the import continues. Signals are valuable but not blocking. Wrap in try/catch.
8. **OB-86 reconciliation.** If OB-86's signal service exists, Phase E's service is the authoritative replacement for SCI signals. OB-86's service may remain for non-SCI signal types (plan anomaly, etc.) but SCI classification signals use Phase E's service exclusively.

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-8 | Migration file without execution | Execute in SQL Editor AND verify with DB query |
| AP-25 | Korean Test — field name matching | Fingerprints use structural ratios, not field names |
| AP-30 | Period references in import code | Zero period awareness in signal service |
| AP-31 | Absence-based logic | Prior signals are presence-based: "similar content was seen before" |
| AP-32 | Dual code paths | Single signal service for all SCI signals |
| AP-33 | Partial specification reported as complete | Implementation Completeness Gate required |
| NEW | Exact-value fingerprints | Use bucketed values for fuzzy structural matching |
| NEW | Signal write blocking import | Defensive try/catch — signal failure doesn't block import |
| NEW | Prior signal overriding signatures | Additive boost only, not floor override |

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification Layer 6 says:**
"Every agent claim, every user confirmation, every correction generates signals at three levels."

**After Phase E:**
- Level 1 (Classification) signals: ✅ Written at execute/confirm time with full ClassificationTrace
- Level 2 (Comprehension) signals: ✅ Header interpretations stored as vocabulary_bindings
- Level 3 (Convergence) signals: ❌ Phase G — when input_bindings are generated
- Prior signal consultation: ✅ lookupPriorSignals runs before scoring, boosts matching agent
- Vocabulary binding persistence: ✅ recallVocabularyBindings wired to Phase B interface
- Human override capture: ✅ decision_source='human_override', human_correction_from stored
- Structural fingerprint: ✅ Bucketed fingerprint for fuzzy matching
- Measurement data: ✅ accuracy (confirmed vs overridden), LLM call rate (via binding coverage)
- Trace API: ✅ /api/import/sci/trace endpoint for debugging and verification
- Signal scope: ✅ tenant only (Phase I adds foundational, Phase J adds domain)

**Layer 6 is complete for tenant scope.** Phase F builds Layer 5 (Execute Pipeline + Routing).

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160E_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

### Completion Report Structure
1. **Interface verification results** — paste ALL grep output from Phase 0 (Gaps 1-6)
2. **Architecture Decisions** — signal write timing, fingerprint design, prior signal pipeline position
3. **Commits** — all with hashes, one per phase
4. **Files created** — classification-signal-service.ts, trace/route.ts
5. **Files modified** — analyze route, execute route, header-comprehension.ts, synaptic-ingestion-state.ts
6. **Migration** — paste the SQL executed + verification query results
7. **OB-86 reconciliation** — what existed, what was kept, what was replaced
8. **Structural fingerprint** — paste the bucketing logic
9. **Prior signal flow** — paste the integration code showing lookup → boost → trace
10. **Vocabulary binding flow** — paste the recall → LLM skip logic
11. **Proof gates** — 44 gates, each PASS/FAIL with pasted evidence
12. **Implementation Completeness Gate** — Layer 6 (tenant scope) complete after Phase E

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ Phase 0 interface verification complete (ALL 6 gaps inspected, output pasted)?
□ classification_signals table exists in Supabase (DB query evidence)?
□ Table has ALL Dev Plan columns (schema query pasted)?
□ RLS enabled with tenant isolation?
□ classification-signal-service.ts created?
□ writeClassificationSignal called in execute route?
□ lookupPriorSignals called in analyze route BEFORE scoring?
□ Prior signal boost is +0.10 (heuristic) / +0.15 (human_override)?
□ Prior signal boost is additive, not overriding signature floors?
□ computeStructuralFingerprint uses bucketed values?
□ recallVocabularyBindings wired into header-comprehension.ts?
□ LLM skipped when all headers have stored bindings?
□ Human override captures decision_source + human_correction_from?
□ /api/import/sci/trace endpoint exists and responds?
□ Signal write is defensive (try/catch, doesn't block import)?
□ OB-86 reconciliation documented?
□ ZERO Korean Test violations (grep)?
□ ZERO period references (grep)?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160E: "The first import is the hardest. The second is easier. By the tenth, the system knows your data. Not because someone taught it — because it remembered. Every classification, every confirmation, every correction becomes evidence for the next decision. That's not machine learning. That's intelligence through memory."*
