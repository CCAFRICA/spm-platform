# OB-127: SYNAPTIC CONTENT INGESTION — FOUNDATION
## Content Profile + Agent Scoring + Routing + Target Wiring
## Date: 2026-03-01
## Type: Overnight Batch
## Estimated Duration: 18-22 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — the architecture this OB implements
4. `Vialuce_Synaptic_State_Specification.md` — the Synaptic Surface this extends

---

## WHAT THIS OB DOES

Implements the foundation of Synaptic Content Ingestion (SCI) — Decision 77. This replaces the two-path import model (Configure → Plan Import vs Operate → DPI) with a unified intake where specialist agents classify content units and route them to the correct processing pipeline.

**After OB-127:**
1. A new API endpoint (`POST /api/import/sci/analyze`) accepts parsed file data and returns an agent-classified proposal
2. Four specialist agents (Plan, Entity, Target, Transaction) score each content unit using structural heuristics
3. The highest-scoring agent claims each content unit and routes it to the correct pipeline
4. Semantic bindings preserve customer vocabulary alongside platform types
5. A new API endpoint (`POST /api/import/sci/execute`) processes confirmed proposals through the correct pipelines
6. The DG Tab 2 target data can be correctly routed, committed with semantic role, and wired through convergence — closing F-04

**What this does NOT do (deferred to OB-128+):**
- Round 2 negotiation (spatial intelligence between agents)
- Field-level PARTIAL claims (agents claim full tabs only in Phase 1)
- The proposal UI (API-only in this OB — UI built separately)
- Flywheel signal capture and weight evolution
- PDF plan document parsing through SCI (existing Plan Import path remains for PDFs)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-127: Synaptic Content Ingestion Foundation" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary in SCI infrastructure.** Korean Test applies to ALL new files.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

### 0A: Current import infrastructure

```bash
echo "=== CURRENT IMPORT ROUTES ==="
find web/src/app/api/import -name "*.ts" | sort
find web/src/app/operate/import -name "*.tsx" -o -name "*.ts" | sort

echo ""
echo "=== SHEET ANALYSIS / CLASSIFICATION ==="
grep -rn "classif\|analyzeWorkbook\|sheetClassif\|data_type" web/src/app/api/import/ --include="*.ts" | head -20

echo ""
echo "=== resolveDataType FUNCTION (OB-124) ==="
grep -n "resolveDataType\|sheetData.length" web/src/app/api/import/commit/route.ts | head -15

echo ""
echo "=== CONVERGENCE SERVICE ==="
find web/src -name "*convergence*" | sort
cat web/src/lib/convergence/convergence-service.ts | head -60

echo ""
echo "=== PLAN INTERPRETATION ==="
find web/src -name "*plan-interpret*" -o -name "*ai-plan*" | sort
grep -n "interpretPlan\|planInterpret" web/src/ -r --include="*.ts" | head -10

echo ""
echo "=== COMMITTED DATA SCHEMA ==="
grep -rn "committed_data" web/src/app/api/ --include="*.ts" | grep "insert\|from(" | head -15

echo ""
echo "=== EXISTING SYNAPTIC STATE ==="
find web/src/lib/calculation -name "synaptic*" | sort
```

### 0B: Current DG state (F-04 context)

```bash
echo "=== DG DERIVATION ==="
cat web/scripts/hf083-phase2-recalculate.ts | head -40

echo ""
echo "=== DG INPUT BINDINGS ==="
# Check what input_bindings exist for the DG plan
grep -rn "input_bindings\|inputBindings" web/src/lib/convergence/ --include="*.ts" | head -15

echo ""
echo "=== DG TARGET DATA IN DB ==="
# Check how target data was stored from CLT-126 import
grep -rn "component_data\|reference:" web/scripts/hf083-phase0-diagnostic.ts | head -10
```

### 0C: Supabase batch limits and existing patterns

```bash
echo "=== EXISTING BULK INSERT PATTERNS ==="
grep -rn "\.insert\|\.upsert" web/src/app/api/import/ --include="*.ts" | head -15

echo ""
echo "=== SUPABASE CLIENT USAGE ==="
grep -rn "createClient\|supabaseAdmin\|serviceRole" web/src/lib/ --include="*.ts" | head -10
```

**Commit:** `OB-127 Phase 0: Diagnostic — import infrastructure, convergence, DG state`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-127
=====================================

Problem: Replace two-path import with unified agent-based content ingestion.

Option A: New standalone SCI service with separate API routes
  - Scale test: Works at 10x? YES — stateless API, Content Profile is lightweight
  - AI-first: Any hardcoding? NO — agent weights are configurable, not hardcoded patterns
  - Transport: Data through HTTP bodies? YES for analysis (Content Profile only, not raw data)
  - Atomicity: Clean state on failure? YES — analyze returns proposal, execute is idempotent

Option B: Modify existing DPI routes to add agent layer
  - Scale test: Inherits DPI limitations
  - AI-first: Risk of entangling with existing hardcoded patterns
  - Transport: Already has file handling
  - Atomicity: Existing DPI is not atomic

Option C: Add agent middleware that intercepts before existing routes
  - Scale test: YES
  - AI-first: YES
  - Transport: Adds complexity to middleware chain
  - Atomicity: Depends on downstream routes

CHOSEN: Option A — clean separation. SCI is new infrastructure in /api/import/sci/.
  Existing DPI routes remain operational (not deleted) but are deprecated.
  SCI routes call into existing pipelines (plan interpretation, committed_data insert)
  as downstream processors.

REJECTED: Option B — entanglement risk with legacy patterns. Pattern 21 (dual code path)
  risk if we modify in place.

REJECTED: Option C — middleware approach creates hidden dependencies.
```

**Commit:** `OB-127 Phase 1: Architecture decision — standalone SCI service`

---

## PHASE 2: SCI TYPE DEFINITIONS

Create the following file. These types are EXACT — do not modify, add, or remove fields.

### File: `web/src/lib/sci/sci-types.ts`

```typescript
// Synaptic Content Ingestion — Type Definitions
// Decision 77 — OB-127
// Zero domain vocabulary. Korean Test applies.

// ============================================================
// LAYER 1: CONTENT PROFILE
// ============================================================

export interface ContentProfile {
  contentUnitId: string;
  sourceFile: string;
  tabName: string;
  tabIndex: number;

  structure: {
    rowCount: number;
    columnCount: number;
    sparsity: number;               // 0-1, percentage of null/empty cells
    headerQuality: 'clean' | 'auto_generated' | 'missing';
    // clean = human-readable headers
    // auto_generated = __EMPTY pattern (SheetJS default)
    // missing = no discernible header row
  };

  fields: FieldProfile[];

  patterns: {
    hasEntityIdentifier: boolean;
    hasDateColumn: boolean;
    hasCurrencyColumns: number;       // count
    hasPercentageValues: boolean;
    hasDescriptiveLabels: boolean;
    rowCountCategory: 'reference' | 'moderate' | 'transactional';
    // reference: < 50 rows
    // moderate: 50-500 rows
    // transactional: 500+ rows
  };
}

export interface FieldProfile {
  fieldName: string;                  // original column header — customer vocabulary
  fieldIndex: number;

  dataType: 'integer' | 'decimal' | 'currency' | 'percentage' | 'date' | 'text' | 'boolean' | 'mixed';
  nullRate: number;                   // 0-1
  distinctCount: number;

  distribution: {
    min?: number;
    max?: number;
    mean?: number;
    isSequential?: boolean;
    categoricalValues?: string[];     // max 20 for low-cardinality text
  };

  nameSignals: {
    containsId: boolean;
    containsName: boolean;
    containsTarget: boolean;
    containsDate: boolean;
    containsAmount: boolean;
    containsRate: boolean;
  };
}

// ============================================================
// LAYER 2: AGENTS
// ============================================================

export type AgentType = 'plan' | 'entity' | 'target' | 'transaction';

export interface AgentScore {
  agent: AgentType;
  confidence: number;                 // 0-1
  signals: AgentSignal[];             // what contributed to the score
  reasoning: string;                  // human-readable explanation
}

export interface AgentSignal {
  signal: string;                     // signal name
  weight: number;                     // contribution to score (positive or negative)
  evidence: string;                   // what in the Content Profile triggered this
}

// ============================================================
// LAYER 3: CLAIMS
// ============================================================

export type ClaimType = 'FULL' | 'PARTIAL' | 'DERIVED';

export interface ContentClaim {
  contentUnitId: string;
  agent: AgentType;
  claimType: ClaimType;
  confidence: number;
  fields?: string[];                  // for PARTIAL claims
  sharedFields?: string[];            // fields needed by multiple agents
  semanticBindings: SemanticBinding[];
  reasoning: string;
}

// ============================================================
// LAYER 5: SEMANTIC BINDING
// ============================================================

export type SemanticRole =
  | 'entity_identifier'       // links data to an entity
  | 'entity_name'             // display name for an entity
  | 'entity_attribute'        // categorical property of an entity
  | 'entity_relationship'     // hierarchical link (manager, parent)
  | 'entity_license'          // permission/product access
  | 'performance_target'      // goal/quota/benchmark for an entity
  | 'baseline_value'          // starting value for delta/growth calculations
  | 'transaction_amount'      // monetary value of an individual event
  | 'transaction_count'       // count of events
  | 'transaction_date'        // when the event occurred
  | 'transaction_identifier'  // unique ID for a transaction
  | 'period_marker'           // temporal grouping reference
  | 'category_code'           // product type, branch code, etc.
  | 'rate_value'              // percentage or rate
  | 'tier_boundary'           // threshold value in a tier structure
  | 'payout_amount'           // reward/payment amount
  | 'descriptive_label'       // text label or description
  | 'unknown'                 // agent couldn't determine role
  ;

export interface SemanticBinding {
  sourceField: string;                // customer vocabulary — immutable
  platformType: string;               // platform internal type
  semanticRole: SemanticRole;
  displayLabel: string;               // what the UI shows (defaults to sourceField)
  displayContext: string;             // generated explanation of purpose
  claimedBy: AgentType;
  confidence: number;
}

// ============================================================
// PROPOSAL (API Response)
// ============================================================

export interface SCIProposal {
  proposalId: string;
  tenantId: string;
  sourceFiles: string[];
  contentUnits: ContentUnitProposal[];
  processingOrder: string[];          // contentUnitIds in dependency order
  overallConfidence: number;
  requiresHumanReview: boolean;
  timestamp: string;
}

export interface ContentUnitProposal {
  contentUnitId: string;
  sourceFile: string;
  tabName: string;
  classification: AgentType;
  confidence: number;
  reasoning: string;
  action: string;                     // human-readable action description
  fieldBindings: SemanticBinding[];
  allScores: AgentScore[];            // scores from all 4 agents for transparency
  warnings: string[];
}

// ============================================================
// EXECUTION (Processing confirmed proposals)
// ============================================================

export interface SCIExecutionRequest {
  proposalId: string;
  tenantId: string;
  contentUnits: ContentUnitExecution[];
}

export interface ContentUnitExecution {
  contentUnitId: string;
  confirmedClassification: AgentType; // may differ from proposal if user corrected
  confirmedBindings: SemanticBinding[];
  rawData: Record<string, unknown>[];  // the actual rows to process
}

export interface SCIExecutionResult {
  proposalId: string;
  results: ContentUnitResult[];
  overallSuccess: boolean;
}

export interface ContentUnitResult {
  contentUnitId: string;
  classification: AgentType;
  success: boolean;
  rowsProcessed: number;
  pipeline: string;                   // which pipeline handled it
  error?: string;
}
```

**Korean Test:** Zero domain vocabulary in this file. No "compensation", "commission", "loan", "officer", "plan" as identifiers. Only structural types.

**Commit:** `OB-127 Phase 2: SCI type definitions — Content Profile, Agents, Claims, Semantic Binding`

---

## PHASE 3: CONTENT PROFILE GENERATOR

Create the Content Profile generator. This is purely structural observation — no interpretation, no AI.

### File: `web/src/lib/sci/content-profile.ts`

**Input:** SheetJS parsed data (the same format the existing DPI receives after file upload)
**Output:** `ContentProfile` for each tab

Implementation requirements:

1. **`generateContentProfile(tabName: string, tabIndex: number, sourceFile: string, columns: string[], rows: Record<string, unknown>[]): ContentProfile`**

2. **Field type detection** — For each column, sample ALL rows (not just first 5):
   - `integer`: all non-null values are whole numbers
   - `decimal`: all non-null values are numbers with decimal places
   - `currency`: numbers with 2 decimal places AND (magnitude > 100 OR column name contains currency signals)
   - `percentage`: values between 0-1 OR values between 0-100 with % in header
   - `date`: parseable as dates (ISO, MM/DD/YYYY, etc.)
   - `text`: string values
   - `boolean`: only true/false/yes/no/0/1 values
   - `mixed`: multiple types in same column

3. **Header quality detection:**
   - `auto_generated`: any column contains `__EMPTY`
   - `missing`: first row values look like data, not headers (all numeric, etc.)
   - `clean`: human-readable text headers

4. **Pattern detection:**
   - `hasEntityIdentifier`: at least one column with sequential integers OR column name contains ID signals
   - `hasDateColumn`: at least one date-type column
   - `hasCurrencyColumns`: count of currency-type columns
   - `hasPercentageValues`: any column has percentage type
   - `hasDescriptiveLabels`: any text column with < 10 distinct values that aren't names
   - `rowCountCategory`: `< 50` → reference, `50-500` → moderate, `500+` → transactional

5. **Name signals per field** — case-insensitive, multilingual:
   - `containsId`: "id", "no", "number", "code", "código", "번호" in header
   - `containsName`: "name", "nombre", "이름" in header
   - `containsTarget`: "target", "goal", "quota", "meta", "objetivo", "목표" in header
   - `containsDate`: "date", "period", "month", "year", "fecha", "날짜" in header
   - `containsAmount`: "amount", "total", "balance", "monto", "sum", "금액" in header
   - `containsRate`: "rate", "%", "percentage", "tasa", "비율" in header

6. **Distribution stats** for numeric fields: min, max, mean, isSequential (consecutive integers with no gaps)

7. **Categorical values** for text fields with ≤ 20 distinct values: store the distinct values

**Tests:** Create `web/scripts/ob127-test-content-profile.ts`:
- Test 1: Clean tabular data (5 columns, 12 rows) → headerQuality = 'clean', correct field types
- Test 2: Plan rules data (__EMPTY columns, sparse) → headerQuality = 'auto_generated', hasDescriptiveLabels = true
- Test 3: Transaction data (dates, amounts, high row count) → hasDateColumn = true, rowCountCategory = 'transactional'
- Test 4: Korean column headers → nameSignals detect Korean keywords
- Test 5: Empty/null handling → sparsity calculated correctly
- Test 6: Currency detection → currency vs decimal correctly distinguished

**Commit:** `OB-127 Phase 3: Content Profile generator — structural observation, zero interpretation`

---

## PHASE 4: AGENT SCORING MODELS

Create the four agent scoring functions. Each agent takes a `ContentProfile` and returns an `AgentScore`.

### File: `web/src/lib/sci/agents.ts`

**CRITICAL: Use EXACTLY these weights. Do not modify.**

#### Plan Agent Weights

| Signal | Weight | Condition |
|--------|--------|-----------|
| auto_generated_headers | +0.25 | headerQuality === 'auto_generated' |
| high_sparsity | +0.20 | sparsity > 0.30 |
| percentage_values | +0.15 | hasPercentageValues === true |
| descriptive_labels | +0.15 | hasDescriptiveLabels === true |
| low_row_count | +0.10 | rowCountCategory === 'reference' |
| no_entity_id | +0.05 | hasEntityIdentifier === false |
| has_currency | -0.03 | hasCurrencyColumns > 0 |
| has_date | -0.10 | hasDateColumn === true |
| high_row_count | -0.15 | rowCountCategory === 'transactional' |
| has_entity_id | -0.10 | hasEntityIdentifier === true |

#### Entity Agent Weights

| Signal | Weight | Condition |
|--------|--------|-----------|
| has_entity_id | +0.25 | hasEntityIdentifier === true |
| has_name_field | +0.20 | any field with nameSignals.containsName |
| moderate_rows | +0.15 | rowCountCategory === 'moderate' |
| categorical_attributes | +0.10 | ≥ 2 text fields with < 20 distinct values |
| has_license_field | +0.10 | any field name contains "license", "licencia", "product" |
| no_date | +0.05 | hasDateColumn === false |
| high_currency | -0.10 | hasCurrencyColumns > 2 |
| transactional_rows | -0.15 | rowCountCategory === 'transactional' |
| auto_generated_headers | -0.20 | headerQuality === 'auto_generated' |

#### Target Agent Weights

| Signal | Weight | Condition |
|--------|--------|-----------|
| has_entity_id | +0.20 | hasEntityIdentifier === true |
| has_target_field | +0.25 | any field with nameSignals.containsTarget |
| reference_rows | +0.15 | rowCountCategory === 'reference' |
| has_currency | +0.10 | hasCurrencyColumns > 0 AND hasCurrencyColumns ≤ 3 |
| no_date | +0.10 | hasDateColumn === false |
| clean_headers | +0.05 | headerQuality === 'clean' |
| no_entity_id | -0.25 | hasEntityIdentifier === false |
| transactional_rows | -0.15 | rowCountCategory === 'transactional' |
| auto_generated_headers | -0.15 | headerQuality === 'auto_generated' |
| high_sparsity | -0.10 | sparsity > 0.30 |

#### Transaction Agent Weights

| Signal | Weight | Condition |
|--------|--------|-----------|
| has_date | +0.25 | hasDateColumn === true |
| has_entity_id | +0.15 | hasEntityIdentifier === true |
| has_currency | +0.15 | hasCurrencyColumns > 0 |
| transactional_rows | +0.20 | rowCountCategory === 'transactional' |
| moderate_rows | +0.05 | rowCountCategory === 'moderate' |
| clean_headers | +0.05 | headerQuality === 'clean' |
| no_date | -0.25 | hasDateColumn === false |
| reference_rows | -0.10 | rowCountCategory === 'reference' |
| auto_generated_headers | -0.15 | headerQuality === 'auto_generated' |
| high_sparsity | -0.10 | sparsity > 0.30 |

#### Scoring Function

```typescript
export function scoreContentUnit(profile: ContentProfile): AgentScore[] {
  // 1. Each agent evaluates all applicable signals
  // 2. Sum weights (clamp to 0.0 - 1.0)
  // 3. Return all 4 scores sorted by confidence descending
  // 4. Include signals array showing what contributed
  // 5. Generate reasoning string from top 3 signals
}
```

**Claim resolution (Phase 1 — no negotiation):**
```typescript
export function resolveClaimsPhase1(scores: AgentScore[]): ContentClaim {
  // Highest score wins FULL claim
  // If gap between #1 and #2 < 0.10, set requiresHumanReview = true
  // Generate semantic bindings for each field based on winning agent
}
```

**Semantic binding generation per agent:**

When the **Plan Agent** wins: all fields get semanticRole based on content pattern:
- Percentage fields → `rate_value` or `tier_boundary`
- Currency fields → `payout_amount`
- Text fields → `descriptive_label`
- Display context: "Plan rule definition — [field pattern description]"

When the **Entity Agent** wins:
- ID fields → `entity_identifier`
- Name fields → `entity_name`
- Low-cardinality text → `entity_attribute`
- License-like fields → `entity_license`
- Display context: "[field name] — [role description]"

When the **Target Agent** wins:
- ID fields → `entity_identifier` (shared — for linkage)
- Fields with target/goal signals → `performance_target`
- Other currency fields → `baseline_value`
- Text fields → `entity_attribute` or `category_code`
- Display context: "[field name] — [target/goal description]"

When the **Transaction Agent** wins:
- ID fields → `entity_identifier`
- Date fields → `transaction_date`
- Currency fields → `transaction_amount`
- Count/integer fields → `transaction_count`
- Text fields → `category_code`
- Display context: "[field name] — [transaction description]"

**Tests:** Create `web/scripts/ob127-test-agents.ts`:
- Test 1: DG Tab 1 profile → Plan Agent wins (confidence > 0.70)
- Test 2: DG Tab 2 profile → Target Agent wins (confidence > 0.60)
- Test 3: Loan disbursements profile → Transaction Agent wins (confidence > 0.70)
- Test 4: Personnel roster profile → Entity Agent wins (confidence > 0.60)
- Test 5: All scores sum signals correctly (manual weight verification)
- Test 6: Claim resolution picks highest score
- Test 7: Close scores (gap < 0.10) → requiresHumanReview = true
- Test 8: Korean Test — zero domain words in agents.ts

**Commit:** `OB-127 Phase 4: Agent scoring models — 4 agents, exact weights, claim resolution`

---

## PHASE 5: SCI ANALYZE API

Create the API endpoint that accepts parsed file data and returns a proposal.

### File: `web/src/app/api/import/sci/analyze/route.ts`

**Endpoint:** `POST /api/import/sci/analyze`

**Request body:**
```typescript
{
  tenantId: string;
  files: Array<{
    fileName: string;
    sheets: Array<{
      sheetName: string;
      columns: string[];
      rows: Record<string, unknown>[];  // max 50 rows for analysis (sample)
      totalRowCount: number;
    }>;
  }>;
}
```

**Response:** `SCIProposal`

**Implementation:**
1. For each sheet in each file:
   a. Generate `ContentProfile` using content-profile.ts
   b. Score with all 4 agents using agents.ts
   c. Resolve claim (highest score wins)
   d. Generate semantic bindings based on winning agent
2. Determine processing order based on classification:
   - Plan-classified units first (plan must exist before targets can link)
   - Entity-classified units second (entities must exist before transactions)
   - Target-classified units third (targets link to entities and plans)
   - Transaction-classified units last (transactions link to everything)
3. Compute overall confidence (average of all unit confidences)
4. Set `requiresHumanReview` if ANY unit has confidence < 0.50 or gap < 0.10

**Security:** Require authenticated session. Verify tenant access via RLS.

**Tests:** Create `web/scripts/ob127-test-analyze-api.ts`:
- Test 1: DG plan file (2 tabs) → Tab 1 classified as plan, Tab 2 as target
- Test 2: Single CSV transaction file → classified as transaction
- Test 3: Processing order is plan → target (not target → plan)
- Test 4: Low confidence → requiresHumanReview = true
- Test 5: Empty file → appropriate error response

**Commit:** `OB-127 Phase 5: SCI analyze API — proposal generation from parsed files`

---

## PHASE 6: SCI EXECUTE API + TARGET ROUTING

Create the API endpoint that processes confirmed proposals. This is where content actually gets committed.

### File: `web/src/app/api/import/sci/execute/route.ts`

**Endpoint:** `POST /api/import/sci/execute`

**Request body:** `SCIExecutionRequest`

**Response:** `SCIExecutionResult`

**Implementation per classification:**

#### Plan-classified content:
- Route to existing plan interpretation pipeline
- This OB does NOT modify plan interpretation — it just routes to it
- If plan interpretation is not callable as a function (only via UI), create a thin wrapper
- Result: plan interpreted, rule_set created/updated

#### Entity-classified content:
- Route to existing entity creation pipeline
- Extract entity_identifier and entity_name fields from semantic bindings
- Deduplicate against existing entities (OB-125 confirmed dedup works)
- Result: entities created/updated

#### Target-classified content:
- **NEW PIPELINE** — this is the critical addition
- Commit rows to `committed_data` with:
  - `data_type`: normalized from tab name using existing `resolveDataType()` logic + `__` separator for multi-tab
  - `semantic_roles`: JSONB field storing the semantic binding for each field (NEW)
  - Standard fields: tenant_id, raw_data, field_mappings, import_batch_id
- After commit: trigger convergence re-run for the associated plan
  - Find the plan linked to this target data (from proposal or tenant context)
  - Re-run convergence service to generate new derivations that reference the target data_type
  - This is what wires F-04: the engine gets a derivation that points to the target data

#### Transaction-classified content:
- Route to existing committed_data insert (same as current DPI commit)
- Apply period detection from date fields
- Result: transaction data committed

**Key implementation detail for Target routing:**
```typescript
// After committing target data to committed_data:
// 1. Find which plan this target data serves
//    - Check if proposal linked it to a plan (from processing order)
//    - OR use token overlap matching between data_type and plan component names
// 2. Re-run convergence for that plan
//    - Call the convergence service with updated committed_data inventory
//    - Convergence should now generate a derivation referencing the target data_type
// 3. The engine will see the new derivation on next calculation run
```

**Schema addition:** Add `semantic_roles` JSONB column to `committed_data` table if not present.

```sql
-- Only if column doesn't exist
ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS semantic_roles JSONB DEFAULT '{}';
```

**Tests:** Create `web/scripts/ob127-test-execute-api.ts`:
- Test 1: Execute target-classified content → rows appear in committed_data with semantic_roles
- Test 2: Execute target-classified content → convergence re-runs → new derivation exists for DG
- Test 3: Execute transaction-classified content → rows in committed_data (standard path)
- Test 4: Idempotent execution → re-executing same proposal doesn't duplicate data
- Test 5: Verify committed_data row count after execution matches expectation

**Commit:** `OB-127 Phase 6: SCI execute API — routing + target pipeline + convergence re-wire`

---

## PHASE 7: F-04 PROOF — DG END-TO-END VIA SCI

This phase proves SCI works by running the DG plan file through the new pipeline.

### Step 7.1: Analyze DG file through SCI

Create script `web/scripts/ob127-phase7-f04-proof.ts` that:

1. Reads the DG plan file data (or reconstructs the same data structure from the CLT-126 import)
2. Calls `POST /api/import/sci/analyze` with the two-tab data
3. Verifies: Tab 1 classified as `plan` (confidence > 0.60), Tab 2 classified as `target` (confidence > 0.60)
4. Logs the full proposal

### Step 7.2: Execute the proposal (target only)

1. Call `POST /api/import/sci/execute` with Tab 2 confirmed as target
2. Verify: target data committed to committed_data with semantic_roles
3. Verify: convergence re-ran and DG now has a derivation referencing target data
4. Skip Tab 1 execution (plan already interpreted from Configure)

### Step 7.3: Delete stale DG results and recalculate

1. DELETE existing DG calculation_results (48 rows)
2. Recalculate DG for all 4 periods via `POST /api/calculation/run`
3. Query results

### Step 7.4: F-04 verdict

```
IF DG payouts vary by entity:
  F-04 = RESOLVED by OB-127
  Record per-entity payout amounts for each period
  
IF DG payouts still uniform $30K:
  F-04 = STILL OPEN
  Document what the convergence produced
  Document what the derivation references
  Identify the remaining gap
```

### Step 7.5: Regression

```sql
-- CL, MO, IR must be IDENTICAL to HF-083 baseline
-- MBC must be IDENTICAL
```

**Commit:** `OB-127 Phase 7: F-04 proof — DG end-to-end via SCI`

---

## PHASE 8: KOREAN TEST + BUILD CLEAN

### Step 8.1: Korean Test on all new files

```bash
# Zero domain vocabulary in SCI files
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/lib/sci/ --include="*.ts"

# Expected output: 0 matches
```

### Step 8.2: Build clean

```bash
cd web && rm -rf .next && npm run build
# Must exit 0
```

### Step 8.3: Localhost verification

```bash
npm run dev
# Verify localhost:3000 loads
# Verify existing pages still work (login, operate, calculate)
```

**Commit:** `OB-127 Phase 8: Korean Test PASS + build clean`

---

## PHASE 9: COMPLETION REPORT + PR

Create `OB-127_COMPLETION_REPORT.md` at project root.

### Proof Gates — Hard

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | npm run build clean |
| PG-02 | Content Profile generates correctly | 6 test cases pass |
| PG-03 | Plan Agent scores DG Tab 1 highest | Plan Agent confidence > 0.60 for sparse/descriptive tab |
| PG-04 | Target Agent scores DG Tab 2 highest | Target Agent confidence > 0.60 for entity+target tab |
| PG-05 | Transaction Agent scores CSV data highest | Transaction Agent confidence > 0.60 for dated transaction data |
| PG-06 | Entity Agent scores roster highest | Entity Agent confidence > 0.60 for personnel data |
| PG-07 | SCI analyze API returns valid proposal | 2-tab file → 2 classified content units with processing order |
| PG-08 | SCI execute API commits target data | Rows in committed_data with semantic_roles JSONB |
| PG-09 | Convergence re-run produces DG target derivation | DG input_bindings reference target data_type |
| PG-10 | DG results after recalculation | Document uniform vs variable (F-04 status) |
| PG-11 | CL unchanged | 100 results, $6,540,774.36 |
| PG-12 | Mortgage unchanged | 56 results, $989,937.41 |
| PG-13 | IR unchanged | 64 results, $366,600.00 |
| PG-14 | MBC regression | 240 results, $3,245,212.66 ± $0.10 |
| PG-15 | Korean Test | 0 domain vocabulary matches in web/src/lib/sci/ |
| PG-16 | No auth files modified | Middleware and auth-shell unchanged |

### Proof Gates — Soft

| # | Gate | Criterion |
|---|------|-----------|
| SPG-01 | Processing order correct | plan before target before transaction |
| SPG-02 | Semantic bindings generated | Every field in target content has a semantic role |
| SPG-03 | Close confidence gap detected | requiresHumanReview when gap < 0.10 |

**Create PR:** `gh pr create --base main --head dev --title "OB-127: Synaptic Content Ingestion Foundation — Agent Classification + Target Routing" --body "Decision 77 implementation. Content Profile generation, 4 specialist agents with structural heuristic scoring, SCI analyze/execute APIs, target data pipeline with convergence re-wire. F-04 status: [result from Phase 7]."`

**Commit:** `OB-127 Phase 9: Completion report + PR`

---

## FILES CREATED (Expected)

| File | Purpose |
|------|---------|
| `web/src/lib/sci/sci-types.ts` | All SCI type definitions |
| `web/src/lib/sci/content-profile.ts` | Content Profile generator |
| `web/src/lib/sci/agents.ts` | 4 agent scoring models + claim resolution |
| `web/src/app/api/import/sci/analyze/route.ts` | SCI analyze API |
| `web/src/app/api/import/sci/execute/route.ts` | SCI execute API + target routing |
| `web/scripts/ob127-test-content-profile.ts` | Content Profile tests |
| `web/scripts/ob127-test-agents.ts` | Agent scoring tests |
| `web/scripts/ob127-test-analyze-api.ts` | Analyze API tests |
| `web/scripts/ob127-test-execute-api.ts` | Execute API tests |
| `web/scripts/ob127-phase7-f04-proof.ts` | DG end-to-end proof |
| `OB-127_COMPLETION_REPORT.md` | Completion report |

---

## WHAT SUCCESS LOOKS LIKE

After OB-127, you can programmatically:
1. Send any XLSX file to `/api/import/sci/analyze` and get back an agent-classified proposal with semantic bindings
2. Send the confirmed proposal to `/api/import/sci/execute` and have target data correctly committed and wired through convergence
3. The DG plan file's Tab 2 targets are correctly identified by the Target Agent, committed with semantic roles, and wired to the engine via convergence

The old DPI path still works (not deleted). But SCI is the path forward. OB-128 adds the proposal UI, Round 2 negotiation, and field-level claims.

---

*"The platform receives content. The agents comprehend it. The customer confirms. That's the entire import experience."*
