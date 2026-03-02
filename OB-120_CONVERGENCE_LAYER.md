# OB-120: CONVERGENCE LAYER — METRIC RECONCILIATION AND SURFACE-DRIVEN BINDING
## Bridge the vocabulary gap between what plans expect and what data provides

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. `OB-119_COMPLETION_REPORT.md` — **Data Intelligence results: what was built, what works, what gaps remain**
4. `ViaLuce_TMR_Addendum10_Mar2026.md` — Synaptic Communication Framework (TMR Addendum 10)
5. `DECISION_64_DUAL_INTELLIGENCE_SPECIFICATION.md` — Dual Intelligence Architecture
6. This prompt contains everything needed. Do not guess.

---

## CONTEXT

### Where We Are

| OB | Status | What It Built |
|----|--------|---------------|
| OB-116 | ✅ DONE | Manual input_bindings for Consumer Lending (pattern matching) |
| OB-117 | ✅ DONE | Rate detection heuristic — Mortgage $0.18 → $985,410 |
| OB-118 | ✅ DONE | Metric derivation engine — Insurance Referral $0 → $124,550 |
| OB-119 | ✅ DONE (PR #131) | Data Intelligence — Tier 2 entity/period detection, semantic data_type, input_bindings heuristic. $1,046,891 grand total. |
| **OB-120** | **THIS** | **Convergence Layer — compound operation fix + Insurance Referral auto-derivation + surface-driven bindings** |

### OB-119 Actual Results (PR #131)

| Metric | Result |
|--------|--------|
| Entity linkage | **100%** (1,588/1,588) |
| Period linkage | **98.4%** (1,563/1,588) |
| Semantic data_types | **4** (loan_disbursements, deposit_balances, insurance_referrals, loan_defaults) |
| input_bindings populated | **3/4** plans (Consumer Lending, Mortgage, Deposit Growth) |
| Grand total | **$1,046,891** |

**Key finding: AI field mapping returned confidence=0 for ALL files.** Tier 2 deterministic detection carried 100% of the workload. The three-tier resolution chain worked — the fallback IS the feature. OB-120's convergence MUST NOT depend on AI field mapping confidence.

### The Three Remaining Problems

**Problem 1: Consumer Lending produces $1 instead of ~$6.3M.**
OB-119 successfully generated `input_bindings` with `sum(LoanAmount)` → `total_loan_disbursement`. The metric derivation engine produces the correct sum. But the intent executor's `bounded_lookup_1d` returns the tier RATE (e.g., 0.01) without applying `postProcessing` — the final scalar_multiply(rate × volume) never executes. The engine handles the lookup but not the compound operation that follows.

**Problem 2: Insurance Referral produces $0 — no input_bindings generated.**
OB-119's heuristic matching (SHEET_COMPONENT_PATTERNS) found no match between `insurance_referrals` data_type and the Insurance Referral plan's 5 component names. The plan needs per-product COUNT with filters (ProductCode='Vida' AND Qualified='Sí'). OB-118's metric derivation engine can execute these rules — but nobody generates them.

**Problem 3: Metric name reconciliation incomplete.**
OB-119 generated bindings using `SHEET_COMPONENT_PATTERNS` — a deterministic pattern table. This worked for Consumer Lending and Mortgage but failed for Insurance Referral. The convergence layer must replace pattern-table dependency with semantic matching.

### Current Payout State (Post OB-119)

| Plan | OB-119 Result | Problem | Benchmark |
|------|--------------|---------|-----------|
| Consumer Lending | **$1.00** | bounded_lookup_1d returns rate, no postProcessing multiply | $6,319,876 |
| Mortgage | **$1,046,890** | ✅ Working | $985,410 |
| Insurance Referral | **$0** | No input_bindings — pattern matching missed it | $124,550 |
| Deposit Growth | **$0** | Raw sum fed to ratio tier — needs goal data | TBD |
| **Grand Total** | **$1,046,891** | | **$7,429,836** |

### What OB-119 Provides (Confirmed Outputs)

- **100% entity linkage** — Tier 2 value-based detection (OfficerID values matched to entity external_ids)
- **98.4% period linkage** — Tier 2 Excel serial date analysis
- **Semantic data_types**: loan_disbursements, deposit_balances, insurance_referrals, loan_defaults
- **input_bindings on 3/4 plans** — Consumer Lending (sum LoanAmount), Mortgage (sum OriginalAmount), Deposit Growth (sum TotalDepositBalance)
- **MetricDerivationRule extended** — `sum` operation + `source_field` added alongside existing `count` + `filters`
- **component.enabled fix** — `undefined` now treated as enabled (was blocking all AI-interpreted components)

This OB builds ON TOP of OB-119's foundation.

---

## CC FAILURE PATTERN WARNINGS

| # | Pattern | Risk in This OB | Mitigation |
|---|---------|-----------------|------------|
| 1 | Add entries to hardcoded dictionaries | Hardcoding "LoanAmount" → "total_loan_disbursement" as a mapping table | Build semantic matching, not a lookup table. Korean Test. |
| 2 | Pattern match on column names | Matching "LoanAmount" by the string "Loan" + "Amount" | Use structural type matching and keyword overlap from data_type + field names. |
| 5 | Build but don't wire | Building convergence logic that isn't called by the pipeline | Phase 8 auto-trigger proves end-to-end. |
| 10 | Auth file modifications | Touching middleware, auth, or RLS | Do NOT modify any auth files. |
| 14 | Report pass before verification | Claiming convergence works without calculation proof | Proof gate = non-zero calculation totals from convergence bindings. |

### OB-119 Learning: AI Confidence = 0

**CRITICAL**: OB-119 proved that AI field mapping returns confidence=0 for all Caribe data files. Tier 2 deterministic detection carried 100% of the workload. This means:
- Do NOT design convergence to depend on AI field classification confidence scores
- Do NOT assume AI semantic types are available on committed_data fields
- DO design convergence to work from: (a) OB-119's deterministic data_type values, (b) actual field names in raw_data, (c) sample values, (d) plan calculationIntent metric names
- AI disambiguation (Option C) remains available but is the LAST resort, not the primary path

---

## ARCHITECTURE DECISION (Required Before Implementation)

### Problem

Plan Intelligence produces metric names (e.g., `total_loan_disbursement`). Data Intelligence produces field names (e.g., `LoanAmount`). These are different vocabularies for the same thing. The engine needs a mapping. How do we generate that mapping?

### Option A: AI Convergence Call
- After plans and data are both imported, make a dedicated AI call with both the plan's calculationIntent and the data's field inventory
- AI produces explicit mappings: "total_loan_disbursement = SUM(LoanAmount) WHERE data_type matches loan disbursement"
- Scale test: One AI call per plan × data combination. At 50 tenants, 50 calls. Acceptable but not decreasing.
- AI-first: Yes
- Korean Test: Yes — AI reasons about semantics, not strings
- TMR Addendum 10 compliance: Partial — still an AI call for convergence, not a surface read

### Option B: Synaptic Surface Matching (TMR Addendum 10)
- Plan interpretation already decomposes requirements into typed fields (e.g., "needs currency amount, summed per entity per period")
- Data classification already decomposes fields into typed semantics (e.g., "LoanAmount is currency, in transactional file, per entity")
- Convergence = structural join: match requirement.semantic_type to capability.semantic_type
- No additional AI call needed for high-confidence matches
- AI disambiguation only for ambiguous cases (e.g., two currency fields — which one?)
- Scale test: O(synapses) in-memory. Cost decreases with usage.
- TMR Addendum 10 compliance: Full

### Option C: Hybrid — Surface Matching First, AI Refinement for Gaps
- Attempt Option B structural matching first
- For unmatched requirements or ambiguous matches (multiple candidates), make a targeted AI call
- AI call includes ONLY the unresolved items, not the full plan+data context
- Scale test: Most matches resolve structurally. AI calls only for edge cases. Decreasing cost with usage.
- TMR compliance: Full — convergence defaults to surface, AI is disambiguation tier

**CHOSEN: Option C** — Hybrid approach. Structural surface matching resolves the common cases (currency amount → currency field, count → count field). AI disambiguation handles the edge cases (two currency fields — which is loan vs mortgage?). This honors TMR Addendum 10 (convergence as observation, not computation) while maintaining quality for ambiguous cases.

**REJECTED: Option A** — Violates TMR Addendum 10 Rule 3 (convergence must not make AI calls for high-confidence matches). Doesn't decrease with usage.

**REJECTED: Option B in isolation** — Structural matching alone can't resolve all cases. When a plan needs "loan disbursement volume" and data has both "LoanAmount" and "ClosingAmount" (both currency), structural matching ties. AI disambiguation is needed for quality.

---

## PHASE 0: DIAGNOSTIC — READ OB-119 OUTPUT AND ENGINE STATE

### 0A: Confirm OB-119 state

OB-119 (PR #131) delivered: 100% entity linkage, 98.4% period linkage, 4 semantic data_types, 3/4 plans with input_bindings. Verify this is still the live state:

```bash
echo "=== CONFIRM OB-119 STATE ==="
cd /Users/AndrewAfrica/spm-platform

echo "Entity/period linkage:"
echo "SELECT COUNT(*) as total, COUNT(entity_id) as entity_linked, COUNT(period_id) as period_linked
FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');"

echo ""
echo "Current calculation totals:"
echo "SELECT rs.name, SUM(cr.total_payout) as total
FROM calculation_results cr JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY rs.name ORDER BY rs.name;"
```

### 0B: Trace the compound operation failure (Consumer Lending $1)

This is the highest-value diagnostic. Find exactly where the intent executor stops at the rate instead of multiplying by volume.

```bash
echo "=== INTENT EXECUTOR CODE ==="
cat web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== INTENT TYPES ==="
cat web/src/lib/calculation/intent-types.ts 2>/dev/null || \
  grep -rn "executeOperation\|IntentOperation\|CalculationIntent\|bounded_lookup\|scalar_multiply" \
  web/src/lib/calculation/ --include="*.ts"

echo ""  
echo "=== HOW bounded_lookup_1d RESULT IS USED ==="
grep -rn "bounded_lookup\|lookup.*result\|tier.*result\|rate.*volume\|postProcess" \
  web/src/lib/calculation/ --include="*.ts" -A 5 | head -60

echo ""
echo "=== CONSUMER LENDING calculationIntent ==="
echo "SELECT name, components->0->'calculationIntent' as intent
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND name LIKE '%Consumer%';"
```

We need to see:
1. The exact calculationIntent structure for Consumer Lending (is it nested scalar_multiply wrapping bounded_lookup_1d, or flat with postProcessing?)
2. Where the executor handles compound/nested operations (or doesn't)
3. What the executor returns for a $750K loan volume input

### 0C: Read Insurance Referral plan structure

```bash
echo "=== INSURANCE REFERRAL COMPONENTS ==="
echo "SELECT name, 
  jsonb_array_length(components::jsonb) as component_count,
  components::jsonb->0->>'name' as first_component,
  components::jsonb->0->'calculationIntent' as first_intent
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND name LIKE '%Insurance%';"

echo ""
echo "=== INSURANCE DATA FIELDS ==="
echo "SELECT DISTINCT jsonb_object_keys(raw_data::jsonb) as field
FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND data_type = 'insurance_referrals';"

echo ""
echo "=== INSURANCE SAMPLE ROWS ==="
echo "SELECT raw_data FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND data_type = 'insurance_referrals' LIMIT 5;"
```

We need to see:
1. The 5 component names and their calculationIntent metric names
2. The actual field names in insurance_referrals data (ProductCode? ProductType? Qualified? Status?)
3. Sample values for filter generation

### 0D: Read the OB-118 metric derivation engine

```bash
echo "=== METRIC DERIVATION RULE TYPE ==="
grep -rn "MetricDerivationRule\|metric_derivations\|applyMetricDerivations" \
  web/src/ --include="*.ts" -A 10 | head -50

echo ""
echo "=== HOW DERIVATIONS ARE CONSUMED ==="
grep -rn "derivation\|derived.*metric" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

Understand the exact MetricDerivationRule structure so Phase 4 generates compatible rules.

### 0E: Read input_bindings current state

```bash
echo "=== CURRENT INPUT_BINDINGS ==="
echo "SELECT name, jsonb_pretty(input_bindings::jsonb) as bindings
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND status = 'active' ORDER BY name;"
```

Record what OB-119 auto-generated. Convergence will enrich, not replace.

**Commit:** `OB-120 Phase 0: Diagnostic — OB-119 state confirmation + compound operation trace`

---

## PHASE 1: FIX COMPOUND OPERATION — CONSUMER LENDING $1 → $6.3M

### What's Broken

The Consumer Lending plan's calculationIntent is structured as a compound operation:
```
scalar_multiply(
  input: metric("total_loan_disbursement"),      // the loan volume
  rate: bounded_lookup_1d(                        // tiered rate lookup
    input: metric("total_loan_disbursement"),     
    boundaries: [0, 500000, 1000000],
    outputs: [0.008, 0.01, 0.012]
  )
)
```

OB-119's metric derivation generates `total_loan_disbursement = SUM(LoanAmount)` correctly. The engine resolves this metric. But when the intent executor encounters `bounded_lookup_1d`, it returns the RATE (0.01) as the final result instead of recognizing that this lookup is NESTED inside a `scalar_multiply` that should multiply rate × volume.

Result: 25 entities × 4 periods × $0.01 rate = ~$1.00 total instead of ~$6.3M.

### Root Cause

Find the intent executor code:
```bash
echo "=== INTENT EXECUTOR ==="
grep -rn "executeOperation\|bounded_lookup\|scalar_multiply\|postProcess" \
  web/src/lib/calculation/ --include="*.ts" | head -30

echo ""
echo "=== HOW COMPOUND OPERATIONS EXECUTE ==="
cat web/src/lib/calculation/run-calculation.ts | head -200
```

The issue is one of:
1. The executor handles `bounded_lookup_1d` and `scalar_multiply` as FLAT operations — it doesn't recognize nesting
2. The `postProcessing` field on the calculationIntent is present but the executor ignores it
3. The executor returns after the FIRST operation instead of chaining

### Fix

Ensure the intent executor handles compound operations. When an operation's `rate` or `input` field is itself an operation (not a scalar), execute recursively:

```typescript
function executeIntent(intent: any, metricValue: number): number {
  if (intent.operation === 'scalar_multiply') {
    const input = typeof intent.input === 'number' ? intent.input : 
                  intent.input?.operation ? executeIntent(intent.input, metricValue) : 
                  metricValue;
    const rate = typeof intent.rate === 'number' ? intent.rate :
                 intent.rate?.operation ? executeIntent(intent.rate, metricValue) :
                 intent.rate;
    return input * rate;
  }
  
  if (intent.operation === 'bounded_lookup_1d') {
    const input = typeof intent.input === 'number' ? intent.input :
                  intent.input?.operation ? executeIntent(intent.input, metricValue) :
                  metricValue;
    // Find the tier
    for (let i = intent.boundaries.length - 1; i >= 0; i--) {
      if (input >= intent.boundaries[i]) {
        return intent.outputs[i];
      }
    }
    return intent.outputs[0];
  }
  
  // ... other operations
}
```

The key insight: `scalar_multiply` with a nested `bounded_lookup_1d` as `rate` should:
1. Resolve the input metric (total_loan_disbursement = $750,000)
2. Execute the nested bounded_lookup_1d to get the RATE (0.01 for $500K-$999K tier)
3. Multiply: $750,000 × 0.01 = $7,500

### Proof Gate Phase 1
```sql
-- Consumer Lending should now produce meaningful totals
SELECT rs.name, p.canonical_key, SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND rs.name LIKE '%Consumer%'
GROUP BY rs.name, p.canonical_key ORDER BY p.canonical_key;

-- EXPECTED: Non-zero totals in the millions range (benchmark: $6,319,876)
-- Previous: $1.00 total (rate only, no multiplication)
```

**Commit:** `OB-120 Phase 1: Fix compound operation execution — nested bounded_lookup inside scalar_multiply`

---

## PHASE 2: PLAN REQUIREMENTS EXTRACTION

### What to Build

Extract structured requirements from each plan's calculationIntent. For each component, produce a requirement record stating WHAT the component needs from data — in semantic terms, not field names.

### Implementation

```typescript
interface ComponentRequirement {
  componentName: string;
  componentIndex: number;
  
  // What this component needs
  metricName: string;              // AI-assigned metric name (e.g., "total_loan_disbursement")
  semanticType: string;            // What kind of data: 'currency_sum' | 'count' | 'ratio' | 'delta'
  aggregation: string;             // How to aggregate: 'sum' | 'count' | 'avg' | 'delta' | 'ratio'
  scope: string;                   // Aggregation scope: 'per_entity_per_period'
  
  // Hints for matching
  keywords: string[];              // Semantic keywords from metric name: ['loan', 'disbursement']
  calculationType: string;         // From calculationIntent: 'scalar_multiply', 'bounded_lookup_1d', etc.
  
  // For metric derivations (Insurance Referral style)
  requiresFiltering: boolean;      // Does this need row-level filters?
  filterHints: string[];           // Keywords suggesting filters: ['qualified', 'vida', 'product']
}

function extractRequirements(ruleSet: any): ComponentRequirement[] {
  const requirements: ComponentRequirement[] = [];
  
  for (let i = 0; i < ruleSet.components.length; i++) {
    const component = ruleSet.components[i];
    const intent = component.calculationIntent;
    if (!intent) continue;
    
    // Parse metric name from calculationIntent
    const metricName = extractMetricName(intent);
    
    // Determine semantic type from calculation operation
    const semanticType = inferSemanticType(intent);
    
    // Extract keywords from metric name
    const keywords = metricName.toLowerCase()
      .split(/[_\s]+/)
      .filter(w => !['total', 'per', 'the', 'of', 'and', 'a'].includes(w));
    
    // Check if this needs row-level filtering (Insurance Referral pattern)
    const requiresFiltering = keywords.some(kw => 
      ['qualified', 'product', 'type', 'category', 'status'].includes(kw)
    ) || ruleSet.components.length >= 3; // Multiple components often mean product-level splits
    
    requirements.push({
      componentName: component.name || `Component ${i}`,
      componentIndex: i,
      metricName,
      semanticType,
      aggregation: inferAggregation(intent),
      scope: 'per_entity_per_period',
      keywords,
      calculationType: intent.operation || 'unknown',
      requiresFiltering,
      filterHints: requiresFiltering ? extractFilterHints(component, intent) : []
    });
  }
  
  return requirements;
}

function inferSemanticType(intent: any): string {
  const op = intent.operation;
  if (op === 'scalar_multiply') return 'currency_sum';       // rate × volume
  if (op === 'bounded_lookup_1d') {
    // Check if input is a ratio
    if (intent.input?.operation === 'ratio') return 'ratio';
    return 'currency_sum';                                     // tier lookup on amount
  }
  if (op === 'ratio') return 'ratio';
  if (op === 'conditional_gate') return 'count';
  return 'currency_sum'; // default
}

function inferAggregation(intent: any): string {
  const op = intent.operation;
  if (op === 'ratio') return 'delta';           // ratio often means delta/goal
  if (op === 'conditional_gate') return 'count'; // gate usually counts
  return 'sum';                                  // default for currency
}
```

### Proof Gate Phase 2
```
Print requirements for each of the 4 MBC plans:
- Consumer Lending: 1 requirement (currency_sum, sum, keywords: [loan, disbursement])
- Mortgage: 1 requirement (currency_sum, sum, keywords: [mortgage, closing])
- Insurance Referral: 5 requirements (count, each with filter hints per product)
- Deposit Growth: 1 requirement (ratio, delta, keywords: [deposit, growth])
```

**Commit:** `OB-120 Phase 2: Plan requirements extraction — semantic demands per component`

---

## PHASE 3: DATA CAPABILITY INVENTORY

### What to Build

For each data_type in committed_data, produce a capability record stating WHAT this data CAN provide — in semantic terms matching the requirement vocabulary.

### Implementation

```typescript
interface DataCapability {
  dataType: string;                 // Semantic data_type from OB-119
  fieldName: string;                // Actual column name in raw_data
  
  // What this field provides
  semanticType: string;             // 'currency' | 'count' | 'identifier' | 'date' | 'category' | 'boolean'
  aggregationCapability: string[];  // What operations are valid: ['sum', 'count', 'avg', 'min', 'max']
  scope: string;                    // 'per_row' | 'per_entity_per_period' | 'point_in_time'
  
  // For matching
  keywords: string[];               // Semantic keywords from field name + data_type
  sampleValues: any[];              // First 5 distinct values
  
  // For filtering
  isFilterable: boolean;            // Categorical field good for WHERE clauses
  distinctValues: string[] | null;  // Distinct values if filterable
}

async function buildDataCapabilities(
  tenantId: string,
  supabase: any
): Promise<DataCapability[]> {
  const capabilities: DataCapability[] = [];
  
  // Get distinct data_types
  const { data: dataTypes } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null);
  
  const uniqueTypes = [...new Set(dataTypes.map((r: any) => r.data_type))];
  
  for (const dt of uniqueTypes) {
    // Get sample rows for this data_type (limit 20 for analysis)
    const { data: sampleRows } = await supabase
      .from('committed_data')
      .select('raw_data')
      .eq('tenant_id', tenantId)
      .eq('data_type', dt)
      .limit(20);
    
    if (!sampleRows?.length) continue;
    
    // Extract fields from first row
    const fields = Object.keys(sampleRows[0].raw_data);
    
    for (const field of fields) {
      const values = sampleRows.map((r: any) => r.raw_data[field]).filter(Boolean);
      const cap = classifyFieldCapability(field, values, dt);
      capabilities.push(cap);
    }
  }
  
  return capabilities;
}

function classifyFieldCapability(
  fieldName: string, 
  sampleValues: any[], 
  dataType: string
): DataCapability {
  // Determine semantic type from values
  const numericCount = sampleValues.filter(v => typeof v === 'number' || !isNaN(Number(v))).length;
  const isNumeric = numericCount > sampleValues.length * 0.7;
  
  // Check for currency (large numbers, decimals)
  const isCurrency = isNumeric && sampleValues.some(v => Number(v) > 100);
  
  // Check for count (small integers)
  const isCount = isNumeric && sampleValues.every(v => Number(v) < 1000 && Number(v) % 1 === 0);
  
  // Check for boolean/status
  const uniqueValues = [...new Set(sampleValues.map(String))];
  const isBoolean = uniqueValues.length <= 5 && sampleValues.length > 5;
  
  // Keywords from field name + data_type
  const keywords = [
    ...fieldName.toLowerCase().replace(/([A-Z])/g, '_$1').split(/[_\s]+/),
    ...dataType.toLowerCase().split(/[_\s]+/)
  ].filter(w => w.length > 2 && !['cfg', 'q1', '2024', 'the', 'and'].includes(w));
  
  return {
    dataType,
    fieldName,
    semanticType: isCurrency ? 'currency' : isCount ? 'count' : isBoolean ? 'category' : 'text',
    aggregationCapability: isCurrency ? ['sum', 'count', 'avg', 'min', 'max'] : 
                           isCount ? ['sum', 'count', 'avg'] :
                           isBoolean ? ['count'] : [],
    scope: 'per_row',
    keywords: [...new Set(keywords)],
    sampleValues: uniqueValues.slice(0, 5),
    isFilterable: isBoolean || uniqueValues.length < 20,
    distinctValues: isBoolean ? uniqueValues : null
  };
}
```

### Proof Gate Phase 3
```
Print capabilities for MBC data:
- loan_disbursements: LoanAmount (currency, sum), OfficerID (identifier), ...
- mortgage data (check actual data_type): OriginalAmount (currency, sum), ...
- insurance_referrals: ProductCode (category, filterable), Qualified (boolean), ...
- deposit_balances: TotalDepositBalance (currency, sum/delta), ...
```

**Commit:** `OB-120 Phase 3: Data capability inventory — semantic supply per field`

---

## PHASE 4: CONVERGENCE MATCHING — SURFACE READ

### What to Build

Match plan requirements (Phase 1) to data capabilities (Phase 2) through semantic type alignment and keyword overlap. This is the core of Decision 64's Convergence Layer (C-43).

### Implementation

```typescript
interface ConvergenceMatch {
  requirement: ComponentRequirement;
  capability: DataCapability;
  confidence: number;
  matchType: 'semantic_type' | 'keyword_overlap' | 'ai_disambiguation';
  resolution: {
    dataType: string;         // Which data_type to query
    metricField: string;      // Which field in raw_data
    aggregation: string;      // sum | count | delta | ratio
    filter?: {                // For Insurance Referral style
      field: string;
      value: string;
    };
  };
}

interface ConvergenceResult {
  matches: ConvergenceMatch[];
  gaps: { requirement: ComponentRequirement; reason: string; action: string }[];
  opportunities: { capability: DataCapability; suggestion: string }[];
}

function converge(
  requirements: ComponentRequirement[],
  capabilities: DataCapability[]
): ConvergenceResult {
  const matches: ConvergenceMatch[] = [];
  const gaps: any[] = [];
  const matchedCapabilities = new Set<string>();
  
  for (const req of requirements) {
    // TIER 1: Semantic type match
    const typeMatches = capabilities.filter(cap => {
      if (req.semanticType === 'currency_sum' && cap.semanticType === 'currency') return true;
      if (req.semanticType === 'count' && (cap.semanticType === 'count' || cap.isFilterable)) return true;
      if (req.semanticType === 'ratio' && cap.semanticType === 'currency') return true; // ratio needs currency for delta
      return false;
    });
    
    if (typeMatches.length === 0) {
      gaps.push({
        requirement: req,
        reason: `No data field matches semantic type '${req.semanticType}'`,
        action: `Upload data containing ${req.semanticType} values related to ${req.keywords.join(', ')}`
      });
      continue;
    }
    
    // TIER 2: Keyword overlap to disambiguate among type matches
    let bestMatch: DataCapability | null = null;
    let bestScore = 0;
    
    for (const cap of typeMatches) {
      const overlap = req.keywords.filter(kw => 
        cap.keywords.some(ck => ck.includes(kw) || kw.includes(ck))
      ).length;
      
      // Boost score if data_type keywords also match
      const dtOverlap = req.keywords.filter(kw =>
        cap.dataType.toLowerCase().includes(kw)
      ).length;
      
      const score = (overlap + dtOverlap) / Math.max(req.keywords.length, 1);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cap;
      }
    }
    
    if (bestMatch && bestScore > 0.2) {
      const confidence = Math.min(0.95, 0.5 + bestScore * 0.4);
      
      matches.push({
        requirement: req,
        capability: bestMatch,
        confidence,
        matchType: 'keyword_overlap',
        resolution: {
          dataType: bestMatch.dataType,
          metricField: bestMatch.fieldName,
          aggregation: req.aggregation,
          filter: req.requiresFiltering && bestMatch.isFilterable ? 
            { field: 'to_be_determined', value: 'to_be_determined' } : undefined
        }
      });
      matchedCapabilities.add(`${bestMatch.dataType}:${bestMatch.fieldName}`);
    } else if (bestMatch) {
      // Type match but no keyword overlap — low confidence
      matches.push({
        requirement: req,
        capability: bestMatch,
        confidence: 0.45,
        matchType: 'semantic_type',
        resolution: {
          dataType: bestMatch.dataType,
          metricField: bestMatch.fieldName,
          aggregation: req.aggregation
        }
      });
      matchedCapabilities.add(`${bestMatch.dataType}:${bestMatch.fieldName}`);
    } else {
      gaps.push({
        requirement: req,
        reason: `Type matches found but no keyword overlap for '${req.metricName}'`,
        action: `Review field mappings for ${req.keywords.join(', ')}`
      });
    }
  }
  
  // Opportunities: data capabilities that no plan requirement matched
  const opportunities = capabilities
    .filter(cap => !matchedCapabilities.has(`${cap.dataType}:${cap.fieldName}`))
    .filter(cap => cap.semanticType === 'currency' || cap.semanticType === 'count')
    .map(cap => ({
      capability: cap,
      suggestion: `${cap.fieldName} (${cap.semanticType}) in ${cap.dataType} is not used by any plan component`
    }));
  
  return { matches, gaps, opportunities };
}
```

### Special Case: Insurance Referral (Multi-Component with Filters)

Insurance Referral has 5 components, each needing a COUNT of rows filtered by ProductCode. The convergence must generate metric_derivation rules, not simple field mappings.

```typescript
function generateMetricDerivations(
  matches: ConvergenceMatch[],
  capabilities: DataCapability[]
): MetricDerivationRule[] {
  const derivations: MetricDerivationRule[] = [];
  
  for (const match of matches) {
    if (!match.requirement.requiresFiltering) continue;
    
    // Find the filterable fields in this data_type
    const filterFields = capabilities.filter(cap => 
      cap.dataType === match.capability.dataType && cap.isFilterable
    );
    
    if (filterFields.length === 0) continue;
    
    // For each filter hint, try to match to a filterable field's distinct values
    for (const hint of match.requirement.filterHints) {
      for (const filterCap of filterFields) {
        if (!filterCap.distinctValues) continue;
        
        // Check if any distinct value matches the hint
        const matchingValue = filterCap.distinctValues.find(v =>
          v.toLowerCase().includes(hint.toLowerCase()) ||
          hint.toLowerCase().includes(v.toLowerCase())
        );
        
        if (matchingValue) {
          derivations.push({
            metricName: match.requirement.metricName,
            operation: 'count',
            sourceDataType: match.capability.dataType,
            filters: [
              { field: filterCap.fieldName, operator: '=', value: matchingValue }
            ]
          });
          break;
        }
      }
    }
  }
  
  return derivations;
}
```

### Proof Gate Phase 4
```
Convergence report for MBC:

MATCHES:
- Consumer Lending: total_loan_disbursement → LoanAmount in loan_disbursements (0.85+)
- Mortgage: total_mortgage_closing_amount → OriginalAmount in mortgage data (0.80+)

PARTIAL (needs filter generation):
- Insurance Referral: 5 components → ProductCode + Qualified filters in insurance_referrals

GAPS:
- Deposit Growth: needs ratio(delta/goal), balance data exists but no goal values

OPPORTUNITIES:
- Loan default data not used by any plan
```

**Commit:** `OB-120 Phase 4: Convergence matching — semantic type + keyword overlap`

---

## PHASE 5: WRITE INPUT_BINDINGS FROM CONVERGENCE

### What to Build

Convert convergence matches into actual input_bindings and metric_derivation rules on each rule_set. This is the step that turns intelligence into action — the Thermostat Principle.

### Implementation

```typescript
async function writeConvergenceBindings(
  tenantId: string,
  convergenceResult: ConvergenceResult,
  metricDerivations: MetricDerivationRule[],
  supabase: any
): Promise<void> {
  // Group matches by rule_set
  const bindingsByRuleSet = new Map<string, Record<string, any>>();
  
  for (const match of convergenceResult.matches) {
    if (match.confidence < 0.50) continue; // Skip very low confidence
    
    const ruleSetId = match.requirement.ruleSetId; // Need to thread this through
    if (!bindingsByRuleSet.has(ruleSetId)) {
      bindingsByRuleSet.set(ruleSetId, {});
    }
    
    const bindings = bindingsByRuleSet.get(ruleSetId)!;
    
    // Standard field mapping
    bindings[match.requirement.componentName] = {
      data_type_pattern: match.resolution.dataType,
      metric_field: match.resolution.metricField,
      aggregation: match.resolution.aggregation,
      convergence_confidence: match.confidence,
      match_type: match.matchType
    };
  }
  
  // Add metric derivations to the appropriate rule_set bindings
  for (const derivation of metricDerivations) {
    // Find which rule_set this derivation belongs to
    // (match derivation.metricName to requirement.metricName)
    for (const [ruleSetId, bindings] of bindingsByRuleSet) {
      if (!bindings.metric_derivations) {
        bindings.metric_derivations = [];
      }
      // Add if this derivation's metric matches a component in this rule set
      bindings.metric_derivations.push(derivation);
    }
  }
  
  // Write to database — only update if current bindings are empty
  for (const [ruleSetId, bindings] of bindingsByRuleSet) {
    const { data: current } = await supabase
      .from('rule_sets')
      .select('input_bindings')
      .eq('id', ruleSetId)
      .single();
    
    const currentBindings = current?.input_bindings || {};
    
    // Merge: convergence fills gaps, doesn't overwrite existing manual bindings
    const merged = { ...bindings };
    for (const [key, value] of Object.entries(currentBindings)) {
      if (value && Object.keys(value as any).length > 0) {
        merged[key] = value; // Keep existing manual binding
      }
    }
    
    await supabase
      .from('rule_sets')
      .update({ input_bindings: merged })
      .eq('id', ruleSetId);
    
    console.log(`Convergence: Updated input_bindings for rule_set ${ruleSetId}`);
    console.log(`  Bindings: ${JSON.stringify(merged, null, 2)}`);
  }
}
```

### Critical Rules
- **Merge, don't overwrite.** If OB-116/117/118 manually configured bindings exist, keep them. Convergence fills gaps only.
- **Log everything.** Every binding decision goes to console with confidence and match type. This is the audit trail.
- **Confidence threshold: 0.50.** Below 0.50, don't write — surface as a gap for human review instead.
- **metric_derivations are additive.** If OB-118 manually wrote derivation rules, convergence adds new ones but doesn't replace existing.

### Proof Gate Phase 5
```sql
SELECT name, jsonb_pretty(input_bindings::jsonb) as bindings
FROM rule_sets 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND status = 'active' ORDER BY name;

-- EXPECTED:
-- Consumer Lending: { data_type_pattern: "loan_disbursements", metric_field: "LoanAmount", aggregation: "sum" }
-- Mortgage: { data_type_pattern: <mortgage data_type>, metric_field: "OriginalAmount", aggregation: "sum" }
-- Insurance Referral: { metric_derivations: [...5 rules with product filters...] }
-- Deposit Growth: gap logged (no goal data)
```

**Commit:** `OB-120 Phase 5: Write convergence bindings to rule_sets`

---

## PHASE 6: INTEGRATED TEST — CALCULATE FROM CONVERGENCE

### What to Do

1. Verify OB-119 left MBC in a usable state (entities linked, periods linked)
2. Run convergence (Phases 1-4) to generate input_bindings
3. Run calculation for all 4 plans
4. Record results and compare to benchmark

### Verification Queries

```sql
-- Pre-calculation: Convergence bindings
SELECT name, input_bindings 
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND status = 'active' ORDER BY name;

-- Run calculation (trigger via API or UI)

-- Post-calculation: Results
SELECT rs.name as plan, p.canonical_key as period,
  COUNT(cr.id) as results, SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY rs.name, p.canonical_key ORDER BY rs.name, p.canonical_key;

-- Grand total
SELECT SUM(total_payout) as grand_total
FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
```

### Expected Results

| Plan | OB-119 Actual | OB-120 Target | Benchmark |
|------|--------------|---------------|-----------|
| Consumer Lending | $1.00 | > $1M (compound op fix) | $6,319,876 |
| Mortgage | $1,046,890 | ~$1,046,890 (maintain) | $985,410 |
| Insurance Referral | $0 | > $0 (convergence-generated derivation rules) | $124,550 |
| Deposit Growth | $0 | $0 (expected — no goal data, OB-121) | TBD |
| **Total** | **$1,046,891** | **> $2M** | **$7,429,836** |

**Success criteria:**
- Consumer Lending produces total > $1M from compound operation fix (Phase 1)
- Mortgage maintains ~$1M (no regression)
- Insurance Referral produces non-zero from convergence-generated metric_derivation rules
- Deposit Growth $0 is expected and documented as a gap
- Convergence report produced with matches, gaps, and opportunities
- Zero hardcoded field name strings in convergence logic
- Korean Test: convergence logic uses semantic types, not field name patterns
- Classification signals captured for every convergence match decision

**The $7.4M benchmark may not be fully reached** — Consumer Lending's exact accuracy depends on whether the compound operation handles all tier boundaries correctly. But the gap should close from $1M to >$7M.

**Commit:** `OB-120 Phase 6: Integrated test — convergence-driven calculation`

---

## PHASE 7: CONVERGENCE AS API ENDPOINT

### What to Build

Expose convergence as a callable API endpoint so it can be triggered:
1. Automatically after data import completes (post-OB-119 commit)
2. Manually from the UI (future: Bloodwork convergence panel)
3. Re-run when plans are updated

```typescript
// POST /api/intelligence/converge
// Body: { tenantId: string }
// Returns: ConvergenceResult + binding decisions

export async function POST(request: Request) {
  const { tenantId } = await request.json();
  
  // 1. Extract plan requirements
  const ruleSets = await getRuleSets(tenantId);
  const allRequirements = ruleSets.flatMap(rs => 
    extractRequirements(rs).map(req => ({ ...req, ruleSetId: rs.id }))
  );
  
  // 2. Build data capabilities
  const capabilities = await buildDataCapabilities(tenantId, supabase);
  
  // 3. Run convergence matching
  const convergenceResult = converge(allRequirements, capabilities);
  
  // 4. Generate metric derivations for filtered components
  const derivations = generateMetricDerivations(convergenceResult.matches, capabilities);
  
  // 5. Write bindings (only for confidence >= 0.50)
  await writeConvergenceBindings(tenantId, convergenceResult, derivations, supabase);
  
  // 6. Log classification signals for every match decision
  for (const match of convergenceResult.matches) {
    await supabase.from('classification_signals').insert({
      tenant_id: tenantId,
      signal_type: 'convergence_match',
      signal_value: {
        requirement: match.requirement.metricName,
        matched_field: match.capability.fieldName,
        matched_data_type: match.capability.dataType,
        confidence: match.confidence,
        match_type: match.matchType,
        resolution: match.resolution
      },
      confidence: match.confidence,
      source: 'convergence_layer'
    });
  }
  
  return Response.json({
    matches: convergenceResult.matches.length,
    gaps: convergenceResult.gaps.length,
    opportunities: convergenceResult.opportunities.length,
    bindingsWritten: convergenceResult.matches.filter(m => m.confidence >= 0.50).length,
    details: convergenceResult
  });
}
```

### Proof Gate Phase 7
- API returns 200 with convergence report
- Classification signals written for every match
- Endpoint callable from test script

**Commit:** `OB-120 Phase 7: Convergence API endpoint with signal capture`

---

## PHASE 8: WIRE CONVERGENCE INTO IMPORT PIPELINE

### What to Build

After data import commits (OB-119's enhanced pipeline), automatically trigger convergence if plans exist for this tenant.

Find the data import commit endpoint. After successful commit, add:

```typescript
// After data commit succeeds:
// Check if plans exist for this tenant
const { data: ruleSets } = await supabase
  .from('rule_sets')
  .select('id')
  .eq('tenant_id', tenantId)
  .eq('status', 'active')
  .limit(1);

if (ruleSets && ruleSets.length > 0) {
  // Trigger convergence
  console.log('Plans exist — running convergence...');
  try {
    const convergenceResponse = await fetch(`${baseUrl}/api/intelligence/converge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId })
    });
    const result = await convergenceResponse.json();
    console.log(`Convergence complete: ${result.matches} matches, ${result.gaps} gaps, ${result.bindingsWritten} bindings written`);
  } catch (e) {
    console.warn('Convergence failed — bindings not auto-generated:', e);
    // Non-fatal — manual binding still works
  }
}
```

Also wire after plan import: when a new plan is imported and data already exists, trigger convergence.

### Critical Rules
- Convergence failure is NON-FATAL. If the AI or matching fails, the import still succeeds. Manual binding remains as fallback.
- Convergence runs AFTER commit, not during. Data must be in committed_data before capabilities can be inventoried.
- Log convergence trigger source: 'post_data_import' or 'post_plan_import'.

### Proof Gate Phase 8
- Fresh data import triggers convergence automatically
- Console shows convergence results
- input_bindings populated without manual intervention

**Commit:** `OB-120 Phase 8: Auto-trigger convergence on import`

---

## PHASE 9: BUILD + COMPLETION REPORT + PR

### Build
```bash
cd /Users/AndrewAfrica/spm-platform
pkill -f "next dev" 2>/dev/null || true
cd web && rm -rf .next && npm run build 2>&1 | tail -30
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### Completion Report

Save as `OB-120_COMPLETION_REPORT.md` at project root. Include:

1. **Architecture Decision** — Option C (hybrid surface + AI disambiguation)
2. **Phase 0 Results** — OB-119 state, plan intent inventory, data field inventory
3. **Phase 1-2 Results** — Requirements extracted per plan, capabilities inventoried per data_type
4. **Phase 3 Results** — Convergence report: matches with confidence, gaps, opportunities
5. **Phase 4 Results** — input_bindings written: which plans, what bindings
6. **Phase 5 Results** — Calculation totals: before vs after convergence
7. **Phase 6-7 Results** — API endpoint working, auto-trigger wired
8. **Remaining Gaps** — Deposit Growth (OB-121), SHEET_COMPONENT_PATTERNS removal (OB-122)
9. **TMR Addendum 10 Compliance** — convergence as surface read, signal capture, cost trajectory

### PR Creation
```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-120: Convergence Layer — metric reconciliation, auto-generated bindings, surface-driven matching" \
  --body "Decision 64 Convergence Layer (C-43). Semantic matching of plan requirements to data capabilities. Auto-generates input_bindings and metric_derivation rules. Consumer Lending: \$X. Mortgage: \$X. Insurance Referral: \$X. Zero hardcoded field names. TMR Addendum 10 compliant."
```

---

## PROOF GATE SUMMARY

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | npm run build exits 0 | Clean build |
| PG-02 | Consumer Lending total > $1M | Compound operation fix — rate × volume executing |
| PG-03 | Mortgage total maintained ~$1M | No regression from OB-119 |
| PG-04 | Plan requirements extracted for all 4 plans | Print + verify semantic requirements |
| PG-05 | Data capabilities inventoried for all data_types | Print + verify field semantics |
| PG-06 | Convergence matches ≥ 2 plans | Consumer Lending + Mortgage minimum |
| PG-07 | Convergence gaps include Deposit Growth | Gap documented with action |
| PG-08 | Insurance Referral input_bindings generated from convergence | metric_derivation rules with product filters |
| PG-09 | Insurance Referral total > $0 | Calculation from convergence-generated derivations |
| PG-10 | Grand total > $2M | Up from $1,046,891 |
| PG-11 | Convergence API endpoint returns 200 | curl test |
| PG-12 | Classification signals captured for matches | SQL: COUNT from classification_signals WHERE signal_type = 'convergence_match' |
| PG-13 | Auto-trigger fires after data import | Console log verification |
| PG-14 | Zero hardcoded field names in convergence code | grep verification |
| PG-15 | Korean Test: no language-specific strings | Code review |
| PG-16 | No auth files modified | git diff confirms |
| PG-17 | Completion report with all phase evidence | File at project root |

---

## QUICK CHECKLIST (Section F)

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ TMR Addendum 10: convergence uses surface matching, not standalone AI call?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ Classification signals captured for every convergence decision?
```

---

*OB-120 — "The data tells you what it can do. The plan tells you what it needs. Intelligence is knowing what happens when they meet."*
*Convergence is not a third AI call. It's reading the surface.*
