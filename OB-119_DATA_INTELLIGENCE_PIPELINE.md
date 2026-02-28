# OB-119: DATA INTELLIGENCE — AUTOMATED IMPORT PIPELINE
## Fix the six gaps between "data exists" and "engine can use it"

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt contains everything needed. Do not guess.

---

## CONTEXT

CLT-118 clean pipeline test result: **$0 out of expected $7,429,836.**

Plan Intelligence works (95-100% confidence, correct calculationIntent for all 4 plans). Engine Intelligence works (OB-117 rate detection, OB-118 metric derivation). The failure is entirely in **Data Intelligence** — the import pipeline cannot connect data to plans without manual wiring.

### The Six Gaps (from CLT-118)

| # | Gap | Root Cause | Impact |
|---|-----|-----------|--------|
| 1 | OfficerID → entity_id not mapped | `ENTITY_ID_TARGETS` hardcoded list doesn't include "OfficerID" | 98% of committed_data has NULL entity_id |
| 2 | DisbursementDate → period not extracted | `PERIOD_TARGETS` hardcoded list doesn't include "DisbursementDate" | 100% of committed_data has NULL period_id |
| 3 | input_bindings always `{}` | plan/import route hardcodes `input_bindings: {} as Json` | Engine finds no data for any entity |
| 4 | Metric derivation rules not auto-generated | OB-118 engine exists but rules require manual config | Insurance Referral $0 |
| 5 | data_type falls back to filename stem | No semantic classification during automated pipeline | findMatchingSheet() fails |
| 6 | AI metric names ≠ data field names | Plan says "total_loan_disbursement", data has "LoanAmount" | Even with linked data, metrics don't resolve |

### What This OB Solves

**Gaps 1 and 2: Entity resolution and period detection during automated import.**

The AI field mapping service (`/api/interpret-import`) already CAN identify OfficerID as an entity identifier and DisbursementDate as a temporal field. But the automated pipeline doesn't call it — it relies on hardcoded target lists. This OB makes the automated pipeline use the AI field mapping results for entity resolution and period extraction.

**Gap 3: input_bindings auto-population from plan + data context.**

When plans exist and data is imported, the platform should generate initial input_bindings by analyzing what data was imported and what the plan components need. This is not full Convergence (OB-121) — this is a practical bridge that uses the plan's calculationIntent and the imported data's field names/types to populate input_bindings at import time.

**Gap 5: Semantic data_type during import.**

Instead of falling back to filename stem (e.g., "CFG_Loan_Disbursements_Jan2024"), the commit step should use the AI sheet classification result (e.g., "loan_disbursement_transactions") as the data_type value.

**Gaps 4 and 6 are OB-120/121 scope** (Convergence Layer). This OB creates the foundation they need.

---

## CC FAILURE PATTERN WARNINGS

| # | Pattern | Risk in This OB | Mitigation |
|---|---------|-----------------|------------|
| 1 | Add entries to hardcoded dictionaries | Expanding ENTITY_ID_TARGETS with more strings | DO NOT add "OfficerID" to the list. Instead, make the pipeline use AI field mapping results. |
| 2 | Pattern match on column names | Matching "DisbursementDate" by name | Use AI classification result (field mapped as "date" type), not column name matching. |
| 5 | Build but don't wire | Creating AI pipeline service without connecting to import flow | Every phase includes proof that the automated pipeline uses the new logic. |
| 6 | Hardcode confidence scores | Setting confidence = 0.9 because it seems right | Confidence comes from AI classification response. |
| 10 | Auth file modifications | Touching middleware, auth, or RLS | Do NOT modify any auth files. |
| 14 | Report pass before browser verification | Claiming entity_id linkage works without DB proof | Every phase verified with SQL queries against live Supabase. |

---

## ARCHITECTURE DECISION (Required Before Implementation)

### Problem
The import pipeline has a 10-step commit process that handles entity resolution and period detection using hardcoded field name lists. The AI field mapping service exists and correctly classifies fields like OfficerID → entity_id, but it's only invoked during the manual UI flow, not during automated/programmatic import. How do we connect AI classifications to the commit pipeline?

### Option A: Call AI field mapping during commit
- At commit time, call `/api/interpret-import` for each file
- Use AI results to identify entity_id and period fields
- Write entity_id and period_id on committed_data rows
- Scale test: Additional API call per file at commit time. Works at 10x (each file is one call, not per-row).
- AI-first: Yes — no hardcoded field names
- Transport: No data through HTTP bodies (AI sees field names + sample values only)
- Atomicity: If AI call fails, fall back to hardcoded targets as Tier 2

### Option B: Auto-invoke AI during enhanced import stepper, persist results, use at commit
- When files are uploaded via enhanced import, automatically call AI classification
- Store AI field mapping results in import_batch metadata
- At commit time, read the stored AI results instead of re-calling
- Scale test: Works at 10x (one AI call per file at upload, results cached)
- AI-first: Yes
- Transport: No
- Atomicity: Cached results survive even if commit retries

### Option C: Expand hardcoded target lists
- Add "OfficerID", "DisbursementDate", etc. to ENTITY_ID_TARGETS and PERIOD_TARGETS
- Scale test: Works mechanically
- AI-first: **NO — this is AP-5 (hardcoded dictionaries)**
- Korean Test: **FAILS** — Korean column names won't be in the list

**CHOSEN: Option A** — Call AI field mapping at commit time. The AI classification API already exists and correctly maps non-standard column names. Calling it during commit is one API call per file (not per row), which scales fine. Deterministic fallback to hardcoded targets means no regression if AI fails.

**REJECTED: Option C** — Anti-Pattern AP-5. The whole point of Decision 64 is to stop adding strings to lists.

**REJECTED: Option B** — More complex than necessary. Option A achieves the same result without requiring state persistence between upload and commit steps.

---

## PHASE 0: DIAGNOSTIC — TRACE THE CURRENT COMMIT PIPELINE

### 0A: Find the import commit pipeline

```bash
echo "=== FIND COMMIT PIPELINE ==="
grep -rn "entity_id\|ENTITY_ID_TARGETS\|entityIdField\|entity.*resolution\|resolveEntit" \
  web/src/app/api/ --include="*.ts" | head -30

echo ""
echo "=== FIND PERIOD DETECTION ==="
grep -rn "period_id\|PERIOD_TARGETS\|periodField\|period.*detect\|resolvePeriod" \
  web/src/app/api/ --include="*.ts" | head -30

echo ""
echo "=== FIND data_type ASSIGNMENT ==="
grep -rn "data_type\|dataType\|sheetType\|sheet.*class" \
  web/src/app/api/data/import/ --include="*.ts" | head -30

echo ""
echo "=== FIND interpret-import API ==="
find web/src/app/api -path "*interpret*" -o -path "*classify*" -o -path "*field-map*" | head -10

echo ""
echo "=== FIND input_bindings ASSIGNMENT ==="
grep -rn "input_bindings" web/src/app/api/ --include="*.ts" | head -20
```

### 0B: Read the commit pipeline code

Based on 0A, read the actual commit function. Print the full function that:
1. Processes uploaded file data
2. Resolves entity_id for each row
3. Detects/assigns period_id for each row
4. Sets data_type on committed_data
5. Writes to committed_data table

Print the FULL function — not just the relevant lines. We need the complete pipeline.

### 0C: Read the AI field mapping API

```bash
echo "=== INTERPRET-IMPORT API ==="
cat web/src/app/api/interpret-import/route.ts 2>/dev/null || echo "Not found at this path"

echo ""
echo "=== OR CLASSIFY-FILE ==="
cat web/src/app/api/classify-file/route.ts 2>/dev/null || echo "Not found"

echo ""
echo "=== OR AI FIELD MAPPING ==="
find web/src/app/api -name "*.ts" | xargs grep -l "field.*map\|mapField\|classify.*field" 2>/dev/null | head -5
```

Read the full API route. Understand:
- What does it receive? (file content? headers? sample values?)
- What does it return? (field mappings with target types? confidence scores?)
- Does it identify entity_id candidates?
- Does it identify date/period fields?

### 0D: Read the plan import route

```bash
echo "=== PLAN IMPORT — input_bindings ==="
grep -rn "input_bindings" web/src/app/api/ --include="*.ts" -B 3 -A 3

echo ""
echo "=== PLAN ROUTE ==="
find web/src/app/api -path "*plan*" -name "route.ts" | head -5
```

Find where `input_bindings: {}` is hardcoded.

### 0E: Read the calculation engine's metric resolution

```bash
echo "=== HOW ENGINE RESOLVES METRICS ==="
grep -rn "input_bindings\|findMatchingSheet\|SHEET_COMPONENT_PATTERNS\|metric.*resolv" \
  web/src/app/api/ --include="*.ts" | head -30

echo ""
echo "=== RUN-CALCULATION ==="
find web/src/app/api -name "run-calculation*" | head -5
```

Read how the engine currently tries to find data for a component. This is what input_bindings needs to feed.

**Commit:** `OB-119 Phase 0: Diagnostic — complete import pipeline trace`

---

## PHASE 1: ENTITY RESOLUTION VIA AI FIELD MAPPING

### What to Build

Modify the commit pipeline to call the AI field mapping service BEFORE entity resolution. Use the AI's classification to identify which column contains entity identifiers, rather than relying on ENTITY_ID_TARGETS hardcoded list.

### Implementation Pattern

```typescript
// PSEUDOCODE — adapt to actual code structure found in Phase 0

async function resolveEntityField(
  headers: string[],
  sampleRows: Record<string, any>[],
  tenantId: string,
  existingEntities: { external_id: string, id: string }[]
): Promise<{ entityField: string | null, confidence: number, method: 'ai' | 'pattern' }> {
  
  // TIER 1: AI Classification
  // Call the existing interpret-import or classify-file API
  try {
    const aiResult = await callAIFieldMapping(headers, sampleRows, tenantId);
    
    // Find which field the AI mapped to entity_id or entity_name type
    const entityMapping = aiResult.mappings.find(m => 
      ['entity_id', 'entity_name', 'employee_id'].includes(m.target)
    );
    
    if (entityMapping && entityMapping.confidence >= 0.7) {
      return { 
        entityField: entityMapping.column, 
        confidence: entityMapping.confidence, 
        method: 'ai' 
      };
    }
  } catch (e) {
    console.warn('AI field mapping failed, falling back to pattern matching:', e);
  }
  
  // TIER 2: Value Matching (Deterministic Fallback)
  // For each column, check if values overlap with existing entity external_ids
  if (existingEntities.length > 0) {
    const entityIdSet = new Set(existingEntities.map(e => String(e.external_id).trim()));
    
    for (const header of headers) {
      const colValues = sampleRows.map(r => String(r[header] ?? '').trim());
      const matchCount = colValues.filter(v => entityIdSet.has(v)).length;
      
      if (matchCount > sampleRows.length * 0.5) {
        return { entityField: header, confidence: 0.85, method: 'pattern' };
      }
    }
  }
  
  // TIER 3: Hardcoded Targets (Last Resort — existing behavior)
  const ENTITY_ID_TARGETS = ['entityid', 'entity_id', 'employeeid', 'employee_id', 'external_id'];
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (ENTITY_ID_TARGETS.includes(normalizedHeaders[i])) {
      return { entityField: headers[i], confidence: 0.7, method: 'pattern' };
    }
  }
  
  return { entityField: null, confidence: 0, method: 'pattern' };
}
```

### Three-Tier Resolution Chain (Decision 64 / TMR)
1. **AI-Primary:** Call existing field mapping AI → find entity_id classified field
2. **Deterministic Fallback:** Value overlap matching against existing entities
3. **Last Resort:** Hardcoded ENTITY_ID_TARGETS (existing behavior — no regression)

### Critical Rules
- Do NOT add "OfficerID" or any other string to ENTITY_ID_TARGETS. That's AP-5.
- Do NOT modify the AI field mapping API itself. Use it as-is.
- The AI call happens once per file (passes headers + sample values), not per row.
- If all three tiers fail, entity_id remains NULL (same as current behavior — no regression).
- Log which tier resolved the entity field for debugging.

### Proof Gate Phase 1
```sql
-- After re-importing Caribe data files through the pipeline:
SELECT 
  data_type,
  COUNT(*) as total_rows,
  COUNT(entity_id) as linked_rows,
  ROUND(COUNT(entity_id)::numeric / COUNT(*)::numeric * 100, 1) as pct_linked
FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY data_type
ORDER BY data_type;

-- EXPECTED: >90% entity linkage on all data files (was 1.6% in CLT-118)
```

**Commit:** `OB-119 Phase 1: AI-driven entity resolution — three-tier chain`

---

## PHASE 2: PERIOD DETECTION VIA AI FIELD MAPPING

### What to Build

Use the same AI field mapping result from Phase 1 to identify date/period fields. Extract period values from those fields and link committed_data rows to the correct period_id.

### Implementation Pattern

```typescript
// PSEUDOCODE — adapt to actual code structure

async function resolvePeriodField(
  headers: string[],
  sampleRows: Record<string, any>[],
  aiMappingResult: AIFieldMapping[] | null,  // Reuse from Phase 1 AI call
  existingPeriods: { id: string, start_date: string, end_date: string, canonical_key: string }[]
): Promise<{ periodField: string | null, confidence: number }> {
  
  // TIER 1: AI Classification (reuse the result from entity resolution call)
  if (aiMappingResult) {
    const dateMapping = aiMappingResult.find(m => 
      ['date', 'period', 'transaction_date', 'event_date'].includes(m.target)
    );
    
    if (dateMapping && dateMapping.confidence >= 0.7) {
      return { periodField: dateMapping.column, confidence: dateMapping.confidence };
    }
  }
  
  // TIER 2: Deterministic — find columns with date-like values
  for (const header of headers) {
    const values = sampleRows.map(r => r[header]);
    if (looksLikeDateColumn(values)) {
      return { periodField: header, confidence: 0.75 };
    }
  }
  
  // TIER 3: Hardcoded PERIOD_TARGETS (existing behavior)
  // ... existing code ...
  
  return { periodField: null, confidence: 0 };
}

function looksLikeDateColumn(values: any[]): boolean {
  // Check for Excel serial dates (5-digit numbers in 40000-50000 range)
  // Check for ISO date strings (YYYY-MM-DD)
  // Check for common date formats
  const dateCount = values.filter(v => {
    if (typeof v === 'number' && v > 40000 && v < 55000) return true; // Excel serial
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return true; // ISO
    return false;
  }).length;
  
  return dateCount > values.length * 0.5;
}

function extractPeriodFromDate(
  dateValue: any,
  existingPeriods: { id: string, start_date: string, end_date: string }[]
): string | null {
  // Convert Excel serial to JS Date
  let date: Date;
  if (typeof dateValue === 'number') {
    // Excel serial date conversion
    date = new Date((dateValue - 25569) * 86400 * 1000);
  } else {
    date = new Date(dateValue);
  }
  
  if (isNaN(date.getTime())) return null;
  
  // Match to existing period by date range
  for (const period of existingPeriods) {
    const start = new Date(period.start_date);
    const end = new Date(period.end_date);
    if (date >= start && date <= end) {
      return period.id;
    }
  }
  
  return null;
}
```

### Critical Rules
- Reuse the AI classification from Phase 1 — do NOT make a second AI call.
- Excel serial date conversion: `(serialDate - 25569) * 86400 * 1000` gives Unix milliseconds.
- Period matching uses existing periods table — rows match to the period whose start_date ≤ row date ≤ end_date.
- If periods don't exist yet, create them from the detected date range (monthly granularity).
- Do NOT add column names like "DisbursementDate" to hardcoded lists. That's AP-5/AP-6.

### Proof Gate Phase 2
```sql
-- After re-importing with period detection:
SELECT 
  data_type,
  COUNT(*) as total_rows,
  COUNT(period_id) as period_linked,
  ROUND(COUNT(period_id)::numeric / COUNT(*)::numeric * 100, 1) as pct_linked
FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY data_type
ORDER BY data_type;

-- EXPECTED: >90% period linkage on all data files (was 0% in CLT-118)
```

**Commit:** `OB-119 Phase 2: AI-driven period detection — date field recognition + period matching`

---

## PHASE 3: SEMANTIC data_type CLASSIFICATION

### What to Build

When committing data, use the AI sheet classification result as the data_type value instead of the filename stem.

### Current Behavior (from CLT-118)
```
data_type values (filename stems):
  CFG_Loan_Disbursements_Jan2024
  CFG_Loan_Disbursements_Feb2024
  CFG_Mortgage_Closings_Q1_2024
  CFG_Insurance_Referrals_Q1_2024
  CFG_Deposit_Balances_Q1_2024
```

### Target Behavior
```
data_type values (semantic):
  loan_disbursement_transactions
  loan_disbursement_transactions
  mortgage_closing_transactions
  insurance_referral_events
  deposit_balance_snapshots
```

### Implementation

During the commit step, call the sheet classification API (or reuse the result from Phase 1/2 if the field mapping response includes sheet-level classification). Map the AI's classification to a standardized data_type string.

If the AI classification returns a descriptive type like "Loan Disbursement Data" or "Transaction — Loan Disbursements", normalize it:
- Lowercase
- Replace spaces with underscores
- Strip file-specific identifiers (dates, tenant names)
- Append structural suffix: `_transactions`, `_snapshots`, `_roster`, `_events`

### Fallback Chain
1. **AI classification** — semantic type from sheet analysis
2. **Filename heuristic** — parse filename for semantic keywords (e.g., "Loan_Disbursements" → "loan_disbursement")
3. **Original behavior** — filename stem (no regression)

### Why This Matters

The calculation engine's `findMatchingSheet()` function and `SHEET_COMPONENT_PATTERNS` match against data_type values. With filename stems, every tenant has different data_type values making pattern matching impossible. With semantic types, data_type becomes a structural concept that works across tenants — "loan_disbursement_transactions" means the same thing regardless of the customer's file naming.

### Proof Gate Phase 3
```sql
SELECT DISTINCT data_type 
FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
ORDER BY data_type;

-- EXPECTED: Semantic types, NOT filename stems
-- e.g., "loan_disbursement_transactions" not "CFG_Loan_Disbursements_Jan2024"
```

**Commit:** `OB-119 Phase 3: Semantic data_type from AI sheet classification`

---

## PHASE 4: input_bindings AUTO-POPULATION

### What to Build

When data is committed and plans exist, analyze the plan's calculationIntent metric names against the data's actual field names and generate initial input_bindings.

### Current State
`input_bindings: {}` hardcoded in plan/import route.

### Target State
After data import, for each plan that has calculationIntent, generate input_bindings that map the plan's expected metrics to the actual data field names.

### Implementation

After committing data (Phases 1-3), check if rule_sets exist for this tenant. For each rule_set with calculationIntent:

```typescript
async function generateInputBindings(
  ruleSet: RuleSet,
  committedDataTypes: string[],  // Distinct data_type values just committed
  committedFields: string[],     // Column names in committed_data.raw_data
  tenantId: string
): Promise<Record<string, any>> {
  const bindings: Record<string, any> = {};
  
  for (const component of ruleSet.components) {
    const intent = component.calculationIntent;
    if (!intent) continue;
    
    // Get the metric name the intent expects
    const metricName = intent.metric || intent.input?.metric;
    if (!metricName) continue;
    
    // Try to match metric to actual data field
    // Strategy 1: Direct name match (unlikely but check)
    if (committedFields.includes(metricName)) {
      bindings[component.name] = {
        data_type_pattern: findBestDataType(committedDataTypes, component.name),
        metric_field: metricName,
        aggregation: 'sum'
      };
      continue;
    }
    
    // Strategy 2: Semantic similarity
    // "total_loan_disbursement" should match "LoanAmount" in loan disbursement data
    const match = findSemanticMatch(metricName, committedFields, committedDataTypes, component);
    if (match) {
      bindings[component.name] = match;
    }
  }
  
  return bindings;
}

function findSemanticMatch(
  metricName: string,
  fields: string[],
  dataTypes: string[],
  component: any
): Record<string, any> | null {
  // Heuristic matching based on:
  // 1. Component name keywords → data_type keywords
  //    "Consumer Lending Commission" → data_type containing "loan" or "lending"
  // 2. Metric name keywords → field name keywords
  //    "total_loan_disbursement" → field containing "loan" AND "amount"
  // 3. Calculation type → expected field type
  //    scalar_multiply(rate × volume) → needs a currency amount field
  
  const componentKeywords = component.name.toLowerCase().split(/[\s_]+/);
  const metricKeywords = metricName.toLowerCase().split(/[\s_]+/);
  
  // Find matching data_type
  const matchingDataType = dataTypes.find(dt => {
    const dtLower = dt.toLowerCase();
    return componentKeywords.some(kw => dtLower.includes(kw));
  });
  
  if (!matchingDataType) return null;
  
  // Find matching field within that data type
  const matchingField = fields.find(f => {
    const fLower = f.toLowerCase();
    return metricKeywords.some(kw => fLower.includes(kw)) ||
           (fLower.includes('amount') && metricKeywords.some(kw => kw.includes('amount') || kw.includes('volume') || kw.includes('disbursement')));
  });
  
  if (!matchingField) return null;
  
  return {
    data_type_pattern: matchingDataType,
    metric_field: matchingField,
    aggregation: 'sum'
  };
}
```

### Update Existing Rule Sets

After generating bindings, UPDATE the rule_set's input_bindings:

```sql
UPDATE rule_sets 
SET input_bindings = $generatedBindings
WHERE id = $ruleSetId 
AND (input_bindings IS NULL OR input_bindings = '{}');
-- Only update if currently empty — don't overwrite manually configured bindings
```

### Critical Rules
- Only populate input_bindings if currently empty (`{}` or NULL). Never overwrite manual configuration.
- This is a heuristic bridge, not the full Convergence Layer (OB-121). It uses keyword matching, not full semantic reasoning.
- Log all binding decisions for later analysis.
- If no match is found for a component, leave that component's binding empty (don't guess).
- The engine already reads input_bindings (from OB-116). This phase just populates them automatically.

### Proof Gate Phase 4
```sql
SELECT name, input_bindings
FROM rule_sets 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND status = 'active'
ORDER BY name;

-- EXPECTED: Non-empty input_bindings for at least Consumer Lending and Mortgage
-- Previously: ALL were {}
```

**Commit:** `OB-119 Phase 4: Auto-populate input_bindings from plan intent + data field analysis`

---

## PHASE 5: INTEGRATED TEST — CLEAN RESET AND REIMPORT

### What to Do

1. **Clean reset** — Delete all MBC committed_data, calculation_results, entities, periods (same as CLT-118 pre-test)
2. **Import all data files** through the commit pipeline (which now includes Phases 1-4)
3. **Run calculation** for all 4 plans
4. **Record results**

### Clean Reset SQL
```sql
-- Same reset as CLT-118
DELETE FROM calculation_results WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
DELETE FROM entity_period_outcomes WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
DELETE FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
DELETE FROM entities WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
DELETE FROM periods WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
DELETE FROM import_batches WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');
-- Do NOT delete rule_sets — plans were imported through UI with correct calculationIntent
```

Wait — rule_sets also need re-import if we want to test the full pipeline. But the plan import route's input_bindings hardcoding is what Phase 4 addresses. Decision: **Keep existing rule_sets** (they have correct calculationIntent from CLT-118). Delete data only. This isolates the data intelligence test.

### Verification Queries
```sql
-- Phase 1 proof: Entity linkage
SELECT data_type, COUNT(*) as total, COUNT(entity_id) as linked,
  ROUND(COUNT(entity_id)::numeric / COUNT(*)::numeric * 100, 1) as pct
FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY data_type ORDER BY data_type;

-- Phase 2 proof: Period linkage
SELECT data_type, COUNT(*) as total, COUNT(period_id) as period_linked,
  ROUND(COUNT(period_id)::numeric / COUNT(*)::numeric * 100, 1) as pct
FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY data_type ORDER BY data_type;

-- Phase 3 proof: Semantic data_type
SELECT DISTINCT data_type FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc') ORDER BY data_type;

-- Phase 4 proof: input_bindings populated
SELECT name, input_bindings FROM rule_sets 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc') AND status = 'active' ORDER BY name;

-- Final: Calculation results
SELECT rs.name as plan, p.canonical_key as period,
  COUNT(cr.id) as results, SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY rs.name, p.canonical_key ORDER BY rs.name, p.canonical_key;
```

### Expected Results

| Plan | CLT-118 (Before) | OB-119 Target | Benchmark |
|------|------------------|---------------|-----------|
| Consumer Lending | $0 | > $0 (some calculation) | $6,319,876 |
| Mortgage | $0 | > $0 | $985,410 |
| Insurance Referral | $0 | $0 (needs OB-120 metric derivation auto-gen) | $124,550 |
| Deposit Growth | $0 | $0 (needs convergence + targets) | TBD |
| **Total** | **$0** | **> $0** | **$7,429,836** |

This OB does NOT need to achieve $7.4M. Success = entity linkage + period linkage + semantic data_type + non-empty input_bindings. The calculation total will improve but may not match the benchmark because:
- Insurance Referral needs metric_derivation rules (OB-120 scope)
- Deposit Growth needs target data + attainment computation (OB-121 scope)
- Metric name reconciliation may still have gaps (OB-121 scope)

**Success criteria: entity_id linkage > 90%, period_id linkage > 90%, input_bindings non-empty for ≥2 plans, and Consumer Lending + Mortgage produce non-zero totals.**

**Commit:** `OB-119 Phase 5: Integrated test — clean reset and reimport through intelligence pipeline`

---

## PHASE 6: BUILD + COMPLETION REPORT + PR

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

Save as `OB-119_COMPLETION_REPORT.md` at project root. Include:

1. **Architecture Decision** — Option A chosen, three-tier resolution chain
2. **Phase 1 Results** — Entity resolution: AI tier success rate, value matching fallback, hardcoded fallback
3. **Phase 2 Results** — Period detection: AI date field identification, Excel serial conversion, period matching
4. **Phase 3 Results** — Semantic data_type: before/after comparison
5. **Phase 4 Results** — input_bindings: which plans got auto-populated, what bindings generated
6. **Phase 5 Results** — Integrated test: entity%, period%, calculation totals
7. **Remaining Gaps** — What still needs OB-120 (metric derivation auto-gen) and OB-121 (convergence)

### PR Creation
```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-119: Data Intelligence — AI-driven entity resolution, period detection, semantic data_type, input_bindings auto-population" \
  --body "Addresses 4 of 6 CLT-118 gaps. Three-tier resolution chain (AI → deterministic → hardcoded). Entity linkage: X%. Period linkage: X%. Non-zero calculations for Consumer Lending and Mortgage without manual wiring."
```

---

## PROOF GATE SUMMARY

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | npm run build exits 0 | Clean build |
| PG-02 | Entity linkage > 90% | SQL query: COUNT(entity_id) / COUNT(*) on committed_data |
| PG-03 | Period linkage > 90% | SQL query: COUNT(period_id) / COUNT(*) on committed_data |
| PG-04 | Semantic data_type values | SQL: DISTINCT data_type shows semantic types, not filenames |
| PG-05 | input_bindings non-empty for ≥2 plans | SQL: rule_sets.input_bindings != '{}' |
| PG-06 | Consumer Lending total > $0 | SQL: SUM(total_payout) from calculation_results |
| PG-07 | Mortgage total > $0 | SQL: SUM(total_payout) from calculation_results |
| PG-08 | No auth files modified | git diff --name-only confirms |
| PG-09 | Zero hardcoded field names added to target lists | grep -c "OfficerID\|DisbursementDate" in commit pipeline = 0 |
| PG-10 | AI classification logged | Console output shows which tier resolved entity/period fields |
| PG-11 | Korean Test: no language-specific strings in new code | Code review: no English/Spanish column names in logic |
| PG-12 | Completion report with Phase 0-5 evidence | File exists at project root |

---

## QUICK CHECKLIST (Section F)

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
```

---

*OB-119 — "If you have to hand it the answer, it's not intelligence — it's a lookup table."*
*CLT-118 proved the engine works. This OB proves the pipeline can feed it.*
