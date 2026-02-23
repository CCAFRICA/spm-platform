# OB-77: AI-NATIVE INTENT PRODUCTION + TRAINING SIGNAL CAPTURE + TRACE UI

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Calculation_Intent_Specification.md` — the Intent vocabulary
4. `OB-76_COMPLETION_REPORT.md` — what was just built
5. `OB-76_PHASE0_DIAGNOSTIC.md` — current engine structure and AI context shape

**Read all five before writing any code.**

---

## WHAT THIS OB BUILDS

OB-76 proved the Calculation Intent Layer works: a deterministic transformer converts current PlanComponent JSONB into ComponentIntents, and the Intent executor produces identical results (100.0% concordance, 719/719).

OB-77 takes three steps toward native agentic architecture:

1. **AI-Native Intent Production** — The AI Plan Interpreter produces ComponentIntents directly. No transformer needed for new plans. The AI becomes the Domain Agent.
2. **Training Signal Capture** — Every human confirmation or correction writes to the training signal pipeline. First flywheel writes.
3. **Execution Trace UI** — Calculation traces visible in browser. Every payout explainable with a click.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language in intent-types.ts, intent-executor.ts.**
8. Domain language acceptable in: intent-transformer.ts (bridge), ai-plan-interpreter.ts (Domain Agent), training signal labels, UI display strings.

---

## PHASE 0: PREREQUISITES + DIAGNOSTIC

### 0-PRE: Verify and create PRs for prior OBs

OB-75 and OB-76 pushed to dev but may not have created PRs. Fix this first.

```bash
echo "=== OPEN PRs ==="
gh pr list --state open

echo ""
echo "=== COMMITS ON DEV NOT ON MAIN ==="
git log main..dev --oneline | head -30
```

If NO open PR exists for the dev branch, create one that covers all outstanding work:

```bash
gh pr create --base main --head dev \
  --title "OB-75 + OB-76: AI Pipeline Proof + Calculation Intent Layer" \
  --body "OB-75: 100.7% accuracy, AI Import Context, zero hardcoding, 20/20 gates. OB-76: 7 structural primitives, Intent executor, 100% dual-path concordance, 108 tests pass."
```

If a PR already exists, verify it includes the latest OB-76 commits. Move on.

**Commit:** `OB-77: Verify PR state for OB-75/76`

### 0A: Read the AI Plan Interpreter

```bash
echo "=== AI PLAN INTERPRETER ==="
cat src/lib/ai/ai-plan-interpreter.ts | head -100

echo ""
echo "=== SYSTEM PROMPT ==="
grep -n -A 80 "system.*prompt\|systemPrompt\|SYSTEM\|You are\|instructions" \
  src/lib/ai/ai-plan-interpreter.ts | head -120

echo ""
echo "=== RETURN SHAPE ==="
grep -n -A 20 "interface.*Plan\|type.*Plan\|return.*component\|parse.*response" \
  src/lib/ai/ai-plan-interpreter.ts | head -60
```

### 0B: Read the OB-76 Intent types and transformer

```bash
echo "=== COMPONENT INTENT INTERFACE ==="
cat src/lib/calculation/intent-types.ts

echo ""
echo "=== TRANSFORMER MAPPING ==="
grep -n "function transform\|case.*lookup\|case.*percentage\|case.*matrix\|case.*conditional" \
  src/lib/calculation/intent-transformer.ts | head -20
```

### 0C: Read the training signal infrastructure

```bash
echo "=== CLASSIFICATION_SIGNALS IN SCHEMA ==="
grep -n -A 10 "classification_signals" SCHEMA_REFERENCE.md

echo ""
echo "=== EXISTING SIGNAL CODE ==="
grep -rn "classification_signal\|training_signal\|captureSignal\|recordSignal" \
  src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== AI SERVICE TRAINING HOOKS ==="
grep -rn "training\|signal\|capture\|feedback" \
  src/lib/ai/ --include="*.ts" | head -20
```

### 0D: Read calculation results display

```bash
echo "=== CALCULATE PAGE ==="
cat src/app/admin/launch/calculate/page.tsx | head -100

echo ""
echo "=== ENTITY DETAIL DISPLAY ==="
grep -n "metadata\|trace\|component\|breakdown\|detail" \
  src/app/admin/launch/calculate/page.tsx | head -30
```

**Document all findings. Commit:** `OB-77 Phase 0: Diagnostic`

---

## ARCHITECTURE DECISIONS (MANDATORY)

```
ARCHITECTURE DECISION RECORD — OB-77
=====================================

DECISION 1: How does the AI produce Intents?
  Option A: Modify the AI system prompt to return ComponentIntent JSON alongside PlanComponent
    - AI returns both formats. PlanComponent for backward compat. ComponentIntent for executor.
    Pro: Single AI call produces both. Intent reflects AI's actual understanding.
    Con: Larger response, more complex prompt, risk of AI formatting errors.
  Option B: AI returns PlanComponent (as today), then a second AI call converts to Intent
    Pro: No change to plan interpretation prompt. Intent generation is separate concern.
    Con: Two API calls, double the cost and latency.
  Option C: AI returns ONLY ComponentIntent (replace PlanComponent entirely)
    Pro: Clean break. No dual format.
    Con: Breaks all existing code that reads PlanComponent. Too aggressive for this OB.
  CHOSEN: ___ because ___

DECISION 2: How to validate AI-produced Intents?
  Option A: Triple-path — current engine + transformer Intent + AI Intent. All three must match.
    Pro: Maximum confidence. Catches AI formatting errors AND transformer bugs.
    Con: Complex, three code paths running simultaneously.
  Option B: Dual-path — AI Intent vs transformer Intent only. Current engine already validated.
    Pro: Simpler. OB-76 already proved transformer matches engine. Just need AI to match transformer.
    Con: Relies on OB-76 proof remaining valid.
  CHOSEN: ___ because ___

DECISION 3: Where do training signals write?
  Option A: classification_signals table (if it exists in schema)
    Pro: Purpose-built table, already designed.
    Con: May not exist or may have wrong shape.
  Option B: New training_signals table
    Pro: Clean design for this specific purpose.
    Con: Another migration.
  Option C: Append to import_batches.metadata or calculation_results.metadata
    Pro: No new table. JSONB absorbs anything.
    Con: Not queryable for ML pipeline, hard to aggregate across tenants.
  CHOSEN: ___ because ___

DECISION 4: Trace UI — where does it surface?
  Option A: Expand entity row in calculate page to show per-component trace
    Pro: Minimal new UI. Inline expansion pattern.
    Con: Calculate page is already complex.
  Option B: Dedicated /operate/trace/:entityId page
    Pro: Full-page detail view. Room for rich visualization.
    Con: Another page to build and maintain.
  Option C: Modal/drawer from entity row click
    Pro: Contextual. No navigation. Quick access.
    Con: Modal can't hold complex trace data well.
  CHOSEN: ___ because ___
```

**Commit:** `OB-77 Phase 0: Architecture decisions`

---

## MISSION 1: AI-NATIVE INTENT PRODUCTION

### The Goal

When the AI Plan Interpreter reads a plan document, it produces ComponentIntents directly — not just PlanComponents that later need transformation. The AI IS the Domain Agent. It reads the plan, understands the domain, and translates into the structural vocabulary.

### 1A: Extend the AI system prompt

The current AI prompt tells the model to extract components with `componentType`, `tierConfig`, `matrixConfig`, etc. Add instructions to ALSO produce `calculationIntent` per component using the structural vocabulary.

The prompt addition should explain the 7 primitives and instruct the AI to produce:

```json
{
  "name": "Store Sales Incentive",
  "componentType": "tier_lookup",
  "tierConfig": { ... },
  "calculationIntent": {
    "operation": "bounded_lookup_1d",
    "input": {
      "source": "ratio",
      "sourceSpec": { "numerator": "metric:actual", "denominator": "metric:target" }
    },
    "boundaries": [
      { "min": 0, "max": 0.9999 },
      { "min": 1.0, "max": 1.0499 },
      ...
    ],
    "outputs": [0, 150, 300, 500],
    "noMatchBehavior": "zero"
  }
}
```

CRITICAL: The AI prompt must explain:
- The 7 primitive operations and when to use each
- Input sources (metric, ratio, aggregate, constant, entity_attribute)
- Boundary format (min, max, minInclusive, maxInclusive)
- Variant routing for components with entity-attribute-based variants
- Modifiers (cap, floor, proration)
- The output MUST be valid ComponentIntent per intent-types.ts

### 1B: Parse and validate AI-produced Intents

After the AI returns its response, validate each `calculationIntent`:
- Is the operation one of the 7 primitives?
- Are boundaries properly ordered (min < max)?
- Do boundary arrays and output arrays match in length?
- Are input sources valid?
- Does the grid match rowBoundaries.length × columnBoundaries.length for 2D lookups?

If validation fails, log the error and fall back to the transformer (OB-76 bridge). The transformer remains as a safety net.

```typescript
function validateComponentIntent(intent: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  // Check operation type
  // Check boundary ordering
  // Check array length consistency
  // Check input source validity
  return { valid: errors.length === 0, errors };
}
```

### 1C: Wire into rule_sets storage

When saving the rule set to Supabase, each component's JSONB now includes both the traditional fields AND `calculationIntent`. The calculation engine reads `calculationIntent` when present.

### 1D: Validate — Re-import the Pipeline Test Co plan PPTX

**Do NOT re-import data.** Only re-import the plan PPTX so the AI produces fresh Intents.

Then compare:
- AI-produced Intent vs transformer-produced Intent for each of the 6 components
- Boundary values must match
- Output values must match
- Operation types must match

```bash
cat << 'EOF' > scripts/ob77-compare-intents.ts
import { createClient } from '@supabase/supabase-js';
import { transformComponentToIntent } from '../src/lib/calculation/intent-transformer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) { console.error('No rule set'); return; }

  // Access the components (handle variant structure)
  const variants = (data.components as any).variants || [];
  const allComponents = variants.flatMap((v: any) => v.components || []);
  
  let matches = 0, mismatches = 0;
  
  allComponents.forEach((comp: any, i: number) => {
    const aiIntent = comp.calculationIntent;
    const transformerIntent = transformComponentToIntent(comp, i);
    
    if (!aiIntent) {
      console.log(`Component ${i} (${comp.name}): NO AI Intent — transformer only`);
      return;
    }
    
    const aiOp = aiIntent.operation || aiIntent.intent?.operation;
    const txOp = transformerIntent.intent?.operation;
    
    if (aiOp === txOp) {
      matches++;
      console.log(`Component ${i} (${comp.name}): MATCH — ${aiOp}`);
    } else {
      mismatches++;
      console.log(`Component ${i} (${comp.name}): MISMATCH — AI=${aiOp} TX=${txOp}`);
    }
  });
  
  console.log(`\nTotal: ${matches} matches, ${mismatches} mismatches`);
}
main();
EOF
npx tsx scripts/ob77-compare-intents.ts
```

**Proof gates:**
- PG-1: AI system prompt includes structural vocabulary instructions
- PG-2: AI returns `calculationIntent` per component
- PG-3: Validation function catches malformed Intents
- PG-4: Fallback to transformer works when AI Intent is invalid
- PG-5: AI Intent operation types match transformer Intent for all 6 components
- PG-6: AI Intent boundary values are numerically correct (within ±0.01)

**Commit:** `OB-77 Mission 1: AI-native Intent production — AI is the Domain Agent`

---

## MISSION 2: TRAINING SIGNAL CAPTURE

### The Goal

Every human action that confirms or corrects an AI decision writes a training signal. This is the first write to the ML flywheel. The system starts learning.

### 2A: Create training signal service

Create `src/lib/ai/training-signal-service.ts`:

```typescript
// ============================================================
// TRAINING SIGNAL SERVICE — First Flywheel Writes
// Captures human confirmations and corrections of AI decisions.
// Every signal is tagged with scope: tenant, foundational, domain.
// ============================================================

export interface TrainingSignal {
  id: string;
  tenantId: string;
  signalType: 'field_mapping_confirmed' | 'field_mapping_corrected' 
    | 'component_classification_confirmed' | 'component_classification_corrected'
    | 'calculation_result_accepted' | 'calculation_result_disputed'
    | 'intent_validated' | 'intent_corrected'
    | 'plan_interpretation_confirmed' | 'plan_interpretation_corrected';
  flywheel: 'tenant' | 'foundational' | 'domain';
  context: {
    entityType?: string;       // what kind of entity was involved
    operation?: string;        // what AI operation produced the decision
    aiDecision: any;           // what the AI decided
    humanAction: any;          // what the human confirmed/corrected
    confidence?: number;       // AI's original confidence
    wasCorrect: boolean;       // did the human confirm or correct?
  };
  metadata?: Record<string, any>;
  createdAt: string;
}

export async function captureSignal(signal: Omit<TrainingSignal, 'id' | 'createdAt'>): Promise<void> {
  // Write to Supabase (classification_signals table or equivalent)
  // Tag with flywheel scope
  // Include tenant_id for tenant flywheel isolation
}

export async function getSignalStats(tenantId: string): Promise<{
  total: number;
  confirmed: number;
  corrected: number;
  accuracyRate: number;
}> {
  // Aggregate signals for dashboard display
}
```

### 2B: Wire signal capture into field mapping confirmation

When the user confirms or changes a field mapping during import:

```typescript
// In the enhanced import page, when user accepts AI field mapping:
await captureSignal({
  tenantId,
  signalType: 'field_mapping_confirmed',
  flywheel: 'tenant',  // customer-specific preference
  context: {
    operation: 'field_mapping',
    aiDecision: { sourceColumn: 'Monto Acotado', semanticType: 'capped_amount', confidence: 0.85 },
    humanAction: { confirmed: true },
    confidence: 0.85,
    wasCorrect: true,
  }
});

// When user CHANGES an AI field mapping:
await captureSignal({
  tenantId,
  signalType: 'field_mapping_corrected',
  flywheel: 'tenant',
  context: {
    operation: 'field_mapping',
    aiDecision: { sourceColumn: 'Monto Acotado', semanticType: 'attainment', confidence: 0.72 },
    humanAction: { correctedTo: 'capped_amount' },
    confidence: 0.72,
    wasCorrect: false,
  }
});
```

### 2C: Wire signal capture into calculation acceptance

When calculation results are accepted (lifecycle advances) or disputed:

```typescript
// In the lifecycle/approval flow:
await captureSignal({
  tenantId,
  signalType: 'calculation_result_accepted',
  flywheel: 'foundational',  // structural accuracy learning
  context: {
    operation: 'calculation',
    aiDecision: { totalPayout: 1262865, entityCount: 719 },
    humanAction: { approved: true },
    wasCorrect: true,
  }
});
```

### 2D: Wire signal capture into Intent validation

When the dual-path comparison runs (OB-76), capture the concordance as a signal:

```typescript
// After dual-path comparison in run-calculation:
await captureSignal({
  tenantId,
  signalType: 'intent_validated',
  flywheel: 'foundational',
  context: {
    operation: 'dual_path_comparison',
    aiDecision: { intentTotal: 1262865, concordanceRate: 1.0 },
    humanAction: { autoValidated: true },
    wasCorrect: true,
  }
});
```

### 2E: Create Supabase migration (if needed)

If `classification_signals` table doesn't exist or has wrong shape, create migration:

```sql
CREATE TABLE IF NOT EXISTS training_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  signal_type TEXT NOT NULL,
  flywheel TEXT NOT NULL CHECK (flywheel IN ('tenant', 'foundational', 'domain')),
  context JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_signals_tenant ON training_signals(tenant_id);
CREATE INDEX idx_training_signals_type ON training_signals(signal_type);
CREATE INDEX idx_training_signals_flywheel ON training_signals(flywheel);

-- RLS
ALTER TABLE training_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON training_signals
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### 2F: Verify signals are being written

```bash
cat << 'EOF' > scripts/ob77-check-signals.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
async function main() {
  const { data, count } = await supabase
    .from('training_signals')
    .select('signal_type, flywheel, context', { count: 'exact' })
    .eq('tenant_id', 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`Total signals: ${count}`);
  data?.forEach((s: any) => {
    console.log(`  ${s.signal_type} [${s.flywheel}] correct=${s.context?.wasCorrect}`);
  });
}
main();
EOF
npx tsx scripts/ob77-check-signals.ts
```

**Proof gates:**
- PG-7: Training signal service exists with `captureSignal()` export
- PG-8: Supabase table exists (migration applied) with RLS
- PG-9: Field mapping confirmation writes a signal
- PG-10: Calculation acceptance writes a signal
- PG-11: Dual-path concordance writes a signal
- PG-12: Signals have correct `flywheel` tags (tenant/foundational/domain)

**Commit:** `OB-77 Mission 2: Training signal capture — first flywheel writes`

---

## MISSION 3: EXECUTION TRACE UI

### The Goal

Every entity's payout is explainable with a click. The execution trace (stored in calculation_results.metadata.intentTraces by OB-76) becomes visible in the browser.

### 3A: Build trace display component

Create `src/components/calculation/ExecutionTraceView.tsx`:

This component receives an entity's trace data and renders:

1. **Summary bar:** Entity ID, total payout, number of components, confidence
2. **Per-component breakdown:** Expandable sections showing:
   - Component label (from metadata.domainLabel — display only)
   - Operation type (human-readable: "Tier Lookup" not "bounded_lookup_1d")
   - Input values with labels (e.g., "Performance Ratio: 0.95 (actual: $285,000 / target: $300,000)")
   - Boundary match (e.g., "Matched tier 3: 90.0% — 99.9%")
   - Output value (e.g., "$1,100")
   - Modifiers applied (e.g., "Floor: $0 → no change")
   - Confidence score with visual indicator
3. **Variant routing** (if applicable): Which variant was selected and why

Design rules:
- Use Tailwind utility classes only
- Dark theme consistent with platform design (VL_DARK backgrounds)
- No external component libraries beyond what's already installed
- Expandable/collapsible per component (default collapsed)
- Responsive — works on narrow and wide viewports

### 3B: Wire into calculate page

Add trace access to the entity results table on the calculate page:

Option A (inline expansion): Clicking an entity row expands to show the trace below
Option B (drawer): Clicking a "View Trace" button opens a side drawer
Option C (modal): Clicking opens a modal with the trace

Choose based on Architecture Decision 4. The trace data comes from `calculation_results.metadata.intentTraces`.

### 3C: Human-readable operation labels

Map structural vocabulary to human-readable labels for the UI:

```typescript
const OPERATION_LABELS: Record<string, string> = {
  'bounded_lookup_1d': 'Tier Lookup',
  'bounded_lookup_2d': 'Matrix Lookup',
  'scalar_multiply': 'Percentage Calculation',
  'conditional_gate': 'Conditional Check',
  'aggregate': 'Aggregation',
  'ratio': 'Ratio Computation',
  'constant': 'Fixed Value',
};
```

NOTE: These labels are UI display strings, NOT in the Foundational Agent code. The executor still speaks structural vocabulary. The UI translates for humans.

### 3D: Verify trace UI

Navigate to localhost:3000, go to the calculate page, find an entity with a non-zero payout, and verify:
- Trace is accessible (click/expand)
- All components show their calculation chain
- Input values are displayed with context
- Boundary matches are identified
- Output values match the entity's payout
- Confidence scores are visible

Take a screenshot or log evidence.

**Proof gates:**
- PG-13: ExecutionTraceView component exists and renders
- PG-14: Trace accessible from entity row on calculate page
- PG-15: Per-component breakdown shows inputs, boundaries, outputs
- PG-16: Variant routing displayed when applicable
- PG-17: Operation labels are human-readable (not raw primitive names)
- PG-18: npm run build exits 0 with trace UI

**Commit:** `OB-77 Mission 3: Execution trace UI — every payout explainable`

---

## HARD CHECKPOINTS

### After Mission 1 (AI Intent production):
- If AI returns malformed Intents for all 6 components → STOP. The prompt is wrong. Fix prompt, not data.
- If AI Intents match transformer Intents for < 4 of 6 components → STOP. Diagnose before proceeding.
- If re-import breaks existing Pipeline Test Co data → STOP. Verify data integrity.

### After Mission 2 (Training signals):
- If migration fails → STOP. Fix schema before proceeding.
- If signals don't write → STOP. Check RLS policy, check service role key.
- Must see at least 1 signal in the table before proceeding to Mission 3.

---

## PROOF GATE SUMMARY

| PG | Mission | Description | Pass Criteria |
|----|---------|-------------|---------------|
| 1 | M1 | AI prompt includes structural vocabulary | Intent instructions in system prompt |
| 2 | M1 | AI returns calculationIntent per component | Non-null on re-imported plan |
| 3 | M1 | Validation catches malformed Intents | Test with bad data |
| 4 | M1 | Fallback to transformer works | Invalid Intent → transformer used |
| 5 | M1 | AI Intent operations match transformer | 6/6 components match |
| 6 | M1 | AI Intent boundaries numerically correct | Within ±0.01 of transformer |
| 7 | M2 | Training signal service exists | captureSignal() exported |
| 8 | M2 | Supabase table with RLS | Migration applied, policy active |
| 9 | M2 | Field mapping writes signal | Signal in table after import |
| 10 | M2 | Calculation acceptance writes signal | Signal in table after calc |
| 11 | M2 | Dual-path concordance writes signal | Signal in table after dual-path |
| 12 | M2 | Flywheel tags correct | tenant/foundational/domain |
| 13 | M3 | Trace component exists | ExecutionTraceView renders |
| 14 | M3 | Trace accessible from calculate page | Click/expand on entity row |
| 15 | M3 | Per-component breakdown visible | Inputs, boundaries, outputs |
| 16 | M3 | Variant routing displayed | When applicable |
| 17 | M3 | Human-readable operation labels | Not raw primitive names |
| 18 | M3 | Build passes with trace UI | npm run build exits 0 |

**18 proof gates. All must PASS or be documented FAIL with root cause.**

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report:
□ CC_STANDING_ARCHITECTURE_RULES.md read and complied with?
□ Architecture Decisions committed before implementation?
□ Anti-Pattern Registry checked?
□ Zero domain words in intent-types.ts and intent-executor.ts?
□ AI prompt produces valid ComponentIntents?
□ Fallback to transformer works?
□ Training signals writing to Supabase?
□ Execution traces visible in browser?
□ All Supabase queries use SCHEMA_REFERENCE.md columns?
□ npm run build exits 0?
□ localhost:3000 responds?
□ gh pr create executed?
```

---

## COMPLETION REPORT

Save as `OB-77_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **Architecture Decisions** — all decisions with rationale
2. **Commits** — all with hashes
3. **Files created** — every new file
4. **Files modified** — every changed file
5. **Proof gates** — 18 gates, each PASS/FAIL with evidence
6. **AI Intent comparison** — AI vs transformer per component
7. **Training signal sample** — actual signal JSON from Supabase
8. **Trace UI evidence** — what the trace looks like in browser
9. **Korean Test** — grep output for foundational code
10. **Known issues** — honest gaps

---

*"The AI is the Domain Agent. The executor is the Foundational Agent. The Intent is their contract. The training signals are their memory. The trace is their proof."*

*OB-77 — February 22, 2026*
  const { data,