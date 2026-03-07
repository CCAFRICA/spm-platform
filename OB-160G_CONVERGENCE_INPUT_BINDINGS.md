# OB-160G PHASE G: CONVERGENCE + input_bindings
## "The engine knows which data satisfies which component"
## SCI Development Plan Phase G of 12 (A through L)
## Target: Current release
## Depends on: OB-160F (PR #188 — must be merged)
## Priority: P0 — Implements Decision 64 Convergence Layer + populates input_bindings
## CLT after ALL phases (A-L) complete. NO browser testing until after Phase L.

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference (rule_sets.input_bindings, rule_sets.components)
3. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 5: Routing and Semantic Binding
4. `web/src/app/api/import/sci/execute/route.ts` — Phase F's execute route (calls convergeBindings already?)
5. `web/src/lib/sci/classification-signal-service.ts` — Phase E signal service (Level 3 signals written here)

---

## MANDATORY INTERFACE VERIFICATION (Learn from Phase F)

Phase F's verification revealed that ALL five execute pipelines already existed in the codebase. This phase MUST do the same discovery before proposing any code. Convergence may already be built, partially built, or stubbed.

Before writing ANY code, run ALL of the following and paste the COMPLETE output:

```bash
# 1. Does convergence code already exist?
grep -rn "convergence\|converge\|Convergence\|convergeBindings\|input_bindings" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -40

# 2. Find ALL convergence-related files
find web/src/ -name "*convergence*" -o -name "*converge*" -o -name "*binding*" | grep -v node_modules

# 3. What does the current convergence function look like?
grep -rn "function converge\|async function converge\|export.*converge" \
  web/src/lib/ --include="*.ts" | head -10

# 4. How is convergence called from execute route?
grep -B 5 -A 15 "converge" \
  web/src/app/api/import/sci/execute/route.ts | head -60

# 5. What does rule_sets.input_bindings look like for Meridian right now?
# Run in Supabase SQL Editor:
# SELECT name, input_bindings FROM rule_sets 
# WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

# 6. What do Meridian's components look like? (calculationIntent structure)
# Run in Supabase SQL Editor:
# SELECT name, jsonb_array_length(components) as comp_count,
#   jsonb_path_query_array(components, '$[*].name') as comp_names
# FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

# 7. What does committed_data look like for Meridian?
# Run in Supabase SQL Editor:
# SELECT count(*) as rows, 
#   count(DISTINCT entity_id) as entities,
#   count(DISTINCT source_date) as dates,
#   array_agg(DISTINCT data_type) as data_types
# FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

# 8. What does reference_data look like for Meridian?
# Run in Supabase SQL Editor:
# SELECT id, name, key_field FROM reference_data 
# WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

# 9. Sample committed_data row_data keys (what columns are available?)
# Run in Supabase SQL Editor:
# SELECT DISTINCT jsonb_object_keys(row_data) as column_name
# FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
# LIMIT 50;

# 10. How does the calculation engine consume input_bindings?
grep -rn "input_bindings" \
  web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts" | head -20

# 11. What format does the engine expect input_bindings to be in?
grep -B 5 -A 20 "input_bindings" \
  web/src/lib/calculation/ --include="*.ts" | head -60

# 12. Header comprehension — what column meanings were detected for Meridian's data?
# (Available via Phase E trace API if signals exist, or from header-comprehension.ts output)
grep -rn "HeaderInterpretation\|columnRole\|semanticMeaning" \
  web/src/lib/sci/sci-types.ts | head -10

# 13. What is the existing convergeBindings return type / structure?
grep -A 30 "interface.*Convergence\|type.*Convergence\|ConvergenceResult\|BindingProposal" \
  web/src/lib/ --include="*.ts" -r | head -40
```

**CRITICAL: Paste ALL output.** This phase depends on understanding what convergence infrastructure already exists, what input_bindings the engine expects, and what data is available in committed_data. Assumptions here cause calculation failures.

Document your findings as:
- **EXISTS AND WORKING:** [list what already exists]
- **EXISTS BUT INCOMPLETE:** [list what needs enhancement]
- **DOES NOT EXIST:** [list what must be built]

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Phase 0: Interface verification — convergence infrastructure discovery" && git push origin dev`

---

## CONTEXT

### What Phase G Delivers

Phase G is the bridge between "data in tables" and "engine can calculate." The plan's components each need specific data inputs. The committed_data table has columns of data. Convergence matches them — semantically, not by string matching.

After Phase G:
- Every component knows which committed_data column feeds it
- `rule_sets.input_bindings` is populated with confirmed matches
- Gaps are surfaced (component needs X, data doesn't have X)
- The engine can calculate because input_bindings tell it where to find each metric
- Level 3 (Convergence) classification signals are captured

### Meridian Components (5)

| Component | Type | What It Needs |
|---|---|---|
| Rendimiento de Ingreso | 2D matrix (bounded_lookup_2d) | Revenue attainment metric (actual vs target) + variant dimension |
| Entrega a Tiempo | 1D tier (bounded_lookup_1d) | On-time delivery percentage |
| Cuentas Nuevas | Scalar (scalar_multiply) | New accounts count |
| Seguridad | Conditional gate (conditional_gate) | Safety compliance metric |
| Utilización de Flota | Ratio (ratio + aggregate) | Fleet utilization rate (may reference hub data) |

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
  Phase B: Header Comprehension ✅ (PR #183)
  Phase C: Agent Scoring + Signatures + Negotiation ✅ (PR #184)
  Phase D: Tenant Context ✅ (PR #185)
  Phase E: Classification Signals + Flywheel ✅ (PR #186)
  HF-092: Schema Correction ✅ (PR #187)
  Phase F: Execute Pipeline + Routing ✅ (PR #188)
→ PHASE G: Convergence + input_bindings ← YOU ARE HERE
  Phase H: Field-Level PARTIAL Claims
  Phase I: Cross-Tenant Flywheel
  Phase J: Domain Flywheel
  Phase K: Synaptic Density for SCI
  Phase L: Pattern Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 25 | Korean Test | Convergence matches on semantic meaning (from header comprehension) + data distribution, NOT column name strings |
| 64 | Convergence Layer | "Convergence output IS the input_bindings source. Confirmed matches write input_bindings on the rule set. Engine consumes deterministically." |
| 92 | Temporal binding | Engine binds committed_data to periods via source_date. Convergence does NOT reference periods. |
| 101 | Headers are content to be understood | Header comprehension interpretations (Phase B) inform convergence matching |
| 107 | Three-level classification signals | Level 3 (Convergence) signals captured in this phase |

---

## ARCHITECTURE DECISION GATE

**IMPORTANT:** The decisions below are PROVISIONAL. Phase 0 verification may reveal existing convergence infrastructure that changes the approach. If convergence code exists and works, the decision should be "enhance in-place" — not "build new." Apply the Phase F lesson.

```
DECISION 1: How should convergence matching work?

  The plan's calculationIntent specifies what each component needs.
  committed_data's row_data has columns of actual data.
  Header comprehension (Phase B) interpreted what each column means.
  
  Matching approach:
  1. Extract REQUIREMENTS from each component's calculationIntent
     - What metric does it need? (revenue, count, percentage, rate)
     - What operation does it perform? (lookup_1d, lookup_2d, scalar, gate, ratio)
     - What input sources does it reference?
  
  2. Profile AVAILABLE DATA from committed_data row_data columns
     - Use header comprehension semanticMeaning (Phase B stored in vocabulary_bindings)
     - Use data distribution (numeric range, percentage-like, count-like)
     - Use column role from header comprehension (measure, attribute, temporal, identifier)
  
  3. Match requirements to available columns
     - Semantic match: component needs "attainment percentage" → column interpreted as "compliance percentage"
     - Distribution match: component expects 0-1 range → column has values 0.45-0.98
     - Role match: component needs a "measure" → column has role "measure"
  
  4. Score each match with confidence
     - HIGH (≥0.85): semantic + distribution + role all align
     - MEDIUM (0.50-0.84): partial alignment
     - LOW (<0.50): weak match, manual mapping needed
  
  Alpha behavior: ALL matches surface for human review. Auto-confirm is Phase K optimization.
  
  CHOSEN: Semantic + distribution + role triple-match scoring

DECISION 2: How should convergence be triggered?

  Option A: Automatically after execute (Phase F already calls convergeBindings)
    - Pro: seamless user experience
    - Con: may need data from all sheets before converging
  
  Option B: Separate API endpoint, triggered by UI "Prepare Calculation" button
    - Pro: user controls when convergence runs
    - Con: extra step in workflow
  
  Option C: Both — auto after execute + manual re-trigger available
    CHOSEN: Auto after execute (Phase F already has this pattern), manual re-trigger available

DECISION 3: What format does input_bindings need to be?

  This depends on how the engine consumes input_bindings.
  Phase 0 verification #10 and #11 will reveal the expected format.
  DO NOT assume a format — verify from the calculation engine code.
  
  CHOSEN: Match whatever format the engine already reads. Document the format.

DECISION 4: How are Level 3 (Convergence) signals captured?

  Use the Phase E classification signal service.
  Each convergence match/gap/opportunity is a signal:
  - signal_type: convergence match, convergence gap, convergence opportunity
  - Stored with structural fingerprint for flywheel learning
  - Written to classification_signals with dedicated columns (HF-092)
  
  CHOSEN: Extend Phase E signal service for Level 3 signals
```

---

## PHASE 1: CONVERGENCE DISCOVERY + ENHANCEMENT

Based on Phase 0 findings, this phase will be ONE of:

### Path A: Convergence Exists and Works
If Phase 0 reveals a working convergence system (like Phase F revealed existing pipelines):
1. Document what exists
2. Identify specific gaps against the Dev Plan v2 specification
3. Enhance in-place: add gap detection, add Level 3 signals, improve matching quality
4. Do NOT rewrite — apply the Phase F lesson

### Path B: Convergence Exists but Is Incomplete
If convergence is stubbed or partially working:
1. Document what exists vs what's needed
2. Complete the implementation within the existing code structure
3. Wire missing pieces: semantic matching, gap detection, signal capture

### Path C: Convergence Does Not Exist
If no convergence infrastructure exists:
1. Create convergence service
2. Wire into execute route (post-import trigger)
3. Create separate trigger endpoint
4. Implement full specification

**The decision between paths A/B/C is made AFTER Phase 0 verification. Do not pre-commit to a path.**

### What Convergence Must Deliver (Regardless of Path)

1. **For each component in the rule_set:**
   - Extract input requirements from calculationIntent
   - Match against available committed_data columns
   - Score each match with confidence
   - Record in ConvergenceReport

2. **Write confirmed matches to input_bindings:**
   ```typescript
   // The exact format depends on Phase 0 discovery (#10, #11)
   // But conceptually:
   // rule_sets.input_bindings = {
   //   component_1: { metric_field: 'column_name_in_row_data', confidence: 0.92 },
   //   component_2: { metric_field: 'another_column', confidence: 0.87 },
   //   ...
   // }
   ```

3. **Surface gaps:**
   - "Component Seguridad needs a compliance metric but no column in committed_data matches"
   - "Component Utilización de Flota needs hub fleet data — reference_data exists for this"

4. **Level 3 signals:**
   ```typescript
   // After convergence completes, write signals per match/gap:
   await writeClassificationSignal(
     tenantId, 'convergence', componentName,
     fingerprint, 'convergence_match', confidence,
     'convergence', convergenceTrace,
     null, null, // no header comprehension or vocab for convergence signals
     { componentName, matchedColumn, matchType },
     null, // no human correction yet
     supabaseUrl, supabaseServiceKey
   );
   ```

### Proof Gates — Phase 1
- PG-01: Phase 0 verification complete (ALL 13 commands output pasted)
- PG-02: Path A/B/C determined with evidence
- PG-03: Convergence extracts component input requirements from calculationIntent
- PG-04: Convergence profiles committed_data columns (using header comprehension + data distribution)
- PG-05: Matching uses semantic meaning, NOT column name string matching (Korean Test)
- PG-06: Match confidence scored (HIGH/MEDIUM/LOW)
- PG-07: input_bindings written to rule_sets in the format the engine expects
- PG-08: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Phase 1: Convergence implementation — semantic matching + input_bindings generation" && git push origin dev`

---

## PHASE 2: GAP DETECTION + CONVERGENCE REPORT

### 2A: Gap Detection

After matching, identify components whose input requirements are NOT satisfied:

```typescript
interface ConvergenceReport {
  tenantId: string;
  ruleSetId: string;
  ruleSetName: string;
  matches: ConvergenceMatch[];
  gaps: ConvergenceGap[];
  opportunities: ConvergenceOpportunity[];
  overallReadiness: 'ready' | 'partial' | 'blocked';
}

interface ConvergenceMatch {
  componentName: string;
  requirement: string;           // what the component needs
  matchedColumn: string;         // which committed_data column satisfies it
  matchType: 'semantic' | 'distribution' | 'role' | 'combined';
  confidence: number;
  evidence: string;              // human-readable explanation
}

interface ConvergenceGap {
  componentName: string;
  requirement: string;
  guidance: string;              // actionable — what the user should do
  severity: 'blocking' | 'degraded';  // blocking = can't calculate, degraded = partial results
  referenceDataAvailable?: boolean;   // true if reference_data could fill this gap
}

interface ConvergenceOpportunity {
  unmatchedColumn: string;
  semanticMeaning: string;
  suggestion: string;            // "This data could support a new component for X"
}
```

### 2B: Reference Data Integration

If a component needs data from reference_data (e.g., Utilización de Flota needs hub fleet data):
- Check if reference_data exists for this tenant
- Check if the reference key_field can link to committed_data entities
- Propose a binding that references both committed_data and reference_data

### Proof Gates — Phase 2
- PG-09: ConvergenceReport structure implemented
- PG-10: Gaps detected for unmapped component requirements
- PG-11: Each gap includes actionable guidance string
- PG-12: Reference data integration checked (reference_data queried for potential matches)
- PG-13: Opportunities surfaced for unmatched committed_data columns
- PG-14: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Phase 2: Gap detection + convergence report — actionable guidance for unmapped requirements" && git push origin dev`

---

## PHASE 3: LEVEL 3 CLASSIFICATION SIGNALS

### 3A: Capture Convergence Signals

Every convergence decision generates a Level 3 signal:

```typescript
// Signal types for convergence:
// - 'convergence_match': component requirement matched to data column
// - 'convergence_gap': component requirement has no data match
// - 'convergence_opportunity': data column not used by any component

// Use existing Phase E signal service with dedicated columns (HF-092):
for (const match of report.matches) {
  try {
    await writeClassificationSignal(
      tenantId,
      'convergence',           // source_file_name — 'convergence' as source
      match.componentName,     // sheet_name — component name as unit
      fingerprint,             // structural fingerprint of the data
      'convergence_match',     // classification
      match.confidence,
      'convergence',           // decision_source
      { matchedColumn: match.matchedColumn, requirement: match.requirement, evidence: match.evidence },
      null,                    // no header comprehension for convergence signals
      null,                    // no vocabulary bindings for convergence signals
      { component: match.componentName, column: match.matchedColumn, type: match.matchType },
      null,                    // no human correction
      supabaseUrl, supabaseServiceKey
    );
  } catch (e) {
    console.error('[Convergence] Signal write failed:', e);
  }
}

// Same pattern for gaps and opportunities
```

### 3B: Human Confirmation of Convergence Matches

In alpha, all matches surface for human review. When the user confirms or corrects a match:
- Confirmed: signal with `decision_source: 'human_confirmed'`
- Corrected: signal with `decision_source: 'human_override'`, `human_correction_from: originalMatch`

This feeds the flywheel — confirmed convergence matches become priors for future tenants (Phase I/J).

### Proof Gates — Phase 3
- PG-15: Level 3 signals written per convergence match
- PG-16: Level 3 signals written per convergence gap
- PG-17: Signal service (Phase E) used for all signal writes
- PG-18: Signals use dedicated columns (HF-092 compliance)
- PG-19: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Phase 3: Level 3 convergence signals — every match and gap captured for flywheel" && git push origin dev`

---

## PHASE 4: CONVERGENCE TRIGGER + API

### 4A: Auto-Trigger After Execute

If Phase F's execute route already calls `convergeBindings`, enhance that call. If not, add it:

```typescript
// In execute route, AFTER all content units are processed:
// Trigger convergence for all active rule_sets in the tenant
const convergenceReport = await runConvergence(
  tenantId,
  supabaseUrl,
  supabaseServiceKey
);

// Include convergence report in execute response
results.convergence = convergenceReport;
```

### 4B: Manual Re-Trigger Endpoint

Create or verify `POST /api/convergence/run`:

```typescript
// POST /api/convergence/run
// Body: { tenantId: string, ruleSetId?: string }
// Response: ConvergenceReport
//
// Allows manual re-trigger of convergence:
// - After additional data is imported
// - After manual field mapping corrections
// - After plan component changes
```

### Proof Gates — Phase 4
- PG-20: Convergence runs automatically after execute completes
- PG-21: Manual trigger endpoint exists (POST /api/convergence/run or equivalent)
- PG-22: Convergence report returned in execute response
- PG-23: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Phase 4: Convergence triggers — auto after execute + manual re-trigger endpoint" && git push origin dev`

---

## PHASE 5: ENGINE CONTRACT VERIFICATION

### 5A: Verify Engine Contract After Convergence

After convergence runs for Meridian, verify the engine contract is satisfied:

```sql
-- Engine Contract verification (run in Supabase SQL Editor)
SELECT 
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;

-- input_bindings populated?
SELECT name, 
  input_bindings IS NOT NULL as has_bindings,
  jsonb_typeof(input_bindings) as bindings_type,
  CASE WHEN input_bindings IS NOT NULL 
    THEN length(input_bindings::text) 
    ELSE 0 END as bindings_size
FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Convergence signals captured?
SELECT count(*) as convergence_signals
FROM classification_signals 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND classification LIKE 'convergence%';
```

**Note:** These verification queries are for the completion report, not for runtime. At this point in the 12-phase plan, data may not be in the database yet (import hasn't been run through the browser). The queries document what WILL be verified during CLT after Phase L. Include them in the completion report as "CLT verification queries" with expected results.

### Proof Gates — Phase 5
- PG-24: Engine contract verification queries documented in completion report
- PG-25: input_bindings format matches what engine expects (from Phase 0 #10/#11)
- PG-26: Convergence report shows matches for Meridian's 5 components (or documents gaps)
- PG-27: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Phase 5: Engine contract verification queries + convergence report documentation" && git push origin dev`

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
# 1. Verify convergence code exists
grep -rn "function.*convergence\|function.*converge\|runConvergence\|convergeBindings" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -10

# 2. Verify input_bindings are written to rule_sets
grep -rn "input_bindings.*update\|\.update.*input_bindings" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -10

# 3. Verify Korean Test — no column name string matching in convergence
grep -rn '"Ingreso"\|"Entrega"\|"Cuentas"\|"Seguridad"\|"Flota"\|"revenue"\|"delivery"' \
  web/src/lib/sci/ web/src/lib/convergence/ --include="*.ts" | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 4. Verify Level 3 signals written
grep -rn "convergence_match\|convergence_gap\|convergence_opportunity" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -10

# 5. Verify convergence triggered after execute
grep -rn "converge\|convergence" \
  web/src/app/api/import/sci/execute/route.ts | head -10

# 6. Verify zero period references in convergence
grep -rn "period\|Period" \
  web/src/lib/convergence/ web/src/lib/sci/*convergence* --include="*.ts" 2>/dev/null | grep -v "// "
# Should return ZERO

# 7. Verify gap detection with actionable guidance
grep -rn "guidance\|ConvergenceGap\|gap.*detect\|blocked\|degraded" \
  web/src/lib/ --include="*.ts" | head -10
```

### 6C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160G: Convergence + input_bindings — the engine knows which data satisfies which component" \
  --body "Phase G of 12-phase SCI Development Plan. Implements Decision 64 Convergence Layer.

## What Changed

### 1. Convergence Matching
Semantic matching between component input requirements (from calculationIntent) and
available committed_data columns (profiled via header comprehension + data distribution).
Triple-match scoring: semantic meaning + data distribution + column role.
Korean Test compliant: matches on meaning, not column name strings.

### 2. input_bindings Generation
Confirmed matches write to rule_sets.input_bindings in the format the engine expects.
Engine consumes input_bindings deterministically at calculation time.

### 3. Gap Detection + Actionable Guidance
Every unmapped component requirement surfaced with actionable guidance:
- What the component needs
- Why no data matches
- What the user should do (upload additional data, adjust plan, etc.)
Reference data integration: checks if reference_data could fill gaps.

### 4. Level 3 Classification Signals
Every convergence match, gap, and opportunity captured as a Level 3 signal.
Uses Phase E signal service with dedicated columns (HF-092).
Feeds the flywheel: confirmed convergence matches become priors for future tenants.

### 5. Convergence Triggers
Auto-trigger after execute (Phase F integration).
Manual re-trigger endpoint for subsequent data imports or plan changes.

## Implementation Completeness
Decision 64: 'Convergence output IS the input_bindings source. Confirmed matches write
input_bindings on the rule set. Engine consumes deterministically.'
Phase G delivers: semantic matching, input_bindings generation, gap detection, Level 3 signals.
After Phase G: engine can calculate when data is imported through the browser.
Gap: PARTIAL claims (Phase H), cross-tenant flywheel (Phase I)."
```

### Proof Gates — Phase 6
- PG-28: `npm run build` exits 0
- PG-29: localhost:3000 responds
- PG-30: Zero Korean Test violations in convergence code
- PG-31: Zero period references in convergence code
- PG-32: input_bindings written to rule_sets
- PG-33: Level 3 signals written to classification_signals
- PG-34: Convergence triggered after execute
- PG-35: Gap detection with actionable guidance
- PG-36: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160G Complete: Convergence + input_bindings — Decision 64" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Convergence matching (semantic + distribution + role)
- input_bindings generation and write to rule_sets
- Gap detection with actionable guidance
- Reference data integration (checking if reference_data fills gaps)
- Convergence report (matches, gaps, opportunities)
- Level 3 classification signals
- Auto-trigger after execute (Phase F integration)
- Manual re-trigger endpoint
- Convergence confidence scoring
- Engine contract verification queries

### OUT OF SCOPE — DO NOT TOUCH
- Calculation engine (reads input_bindings — no changes needed)
- Agent scoring (Phases A-D)
- Classification signal service internals (Phase E — just call writeClassificationSignal)
- Execute pipelines (Phase F — just add convergence call at end)
- PARTIAL claims (Phase H)
- Cross-tenant flywheel (Phase I)
- Auth files

### CRITICAL CONSTRAINTS

1. **Korean Test.** Convergence matches on SEMANTIC MEANING from header comprehension and DATA DISTRIBUTION from column analysis. Never on column name strings. "Revenue attainment" ↔ "Cumplimiento de Ingresos" must match through meaning, not string equality.
2. **Decision 92.** Convergence does NOT reference periods. It matches data columns to component inputs. The engine handles temporal binding separately.
3. **input_bindings format.** Must match what the engine already reads. Phase 0 verification #10/#11 determines this. Do NOT invent a new format.
4. **Alpha behavior.** All convergence matches surface for human review. Auto-confirm is a Phase K optimization. For now, all matches are proposals.
5. **Decision 64.** "Convergence output IS the input_bindings source." This is not a suggestion — it's the architecture. input_bindings come from convergence, not from manual population or hardcoded patterns.
6. **Scale by Design.** Convergence must work for 50 components × 200 data columns. The matching algorithm must be O(n×m) at worst, not exponential. No per-row scanning of committed_data — profile columns once, match once.
7. **Existing code first.** If convergeBindings already exists and works, enhance it. Do not create parallel convergence code (AP-32).

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-5 | Hardcoded field name dictionaries | Semantic matching from header comprehension, not string patterns |
| AP-17 | Duplicate code paths for same feature | One convergence pipeline (if convergeBindings exists, enhance it) |
| AP-25 | Korean Test — column name matching | Match on semanticMeaning + data distribution + columnRole |
| AP-30 | Period references | Zero period awareness in convergence |
| AP-32 | Dual code paths | Single convergence function |
| AP-34 | JSONB blob for structured data | Use dedicated columns (HF-092 pattern) |

---

## IMPLEMENTATION COMPLETENESS GATE

**Decision 64 says:**
"Convergence output IS the input_bindings source. Confirmed matches write input_bindings on the rule set. Engine consumes deterministically."

**After Phase G:**
- Semantic matching: ✅ Component requirements matched to committed_data columns via meaning + distribution + role
- input_bindings: ✅ Written to rule_sets in engine-expected format
- Gap detection: ✅ Unmapped requirements surfaced with actionable guidance
- Reference integration: ✅ Reference data checked as potential gap filler
- Level 3 signals: ✅ Every match/gap/opportunity captured
- Auto-trigger: ✅ Runs after execute completes
- Manual re-trigger: ✅ API endpoint available
- Korean Test: ✅ Zero column name string matching

**The Convergence Layer is complete.** Phase H builds PARTIAL claims (field-level routing for mixed-content sheets).

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160G_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification

### Completion Report Structure
1. **Phase 0 discovery** — paste ALL 13 verification outputs. Document EXISTS/INCOMPLETE/MISSING for each capability.
2. **Path determination** — A (exists), B (incomplete), or C (new). With evidence.
3. **Architecture Decisions** — matching approach, trigger mechanism, input_bindings format (from engine code)
4. **Commits** — all with hashes, one per phase
5. **Convergence matching logic** — paste the matching function showing semantic + distribution + role scoring
6. **input_bindings format** — paste the actual format written to rule_sets (must match engine expectation)
7. **Gap detection** — paste the gap detection logic with guidance generation
8. **Level 3 signals** — paste the signal write calls
9. **Engine contract queries** — paste the verification queries with expected results
10. **Korean Test verification** — paste grep results
11. **Proof gates** — 36 gates, each PASS/FAIL with pasted evidence
12. **Implementation Completeness Gate** — Decision 64 convergence layer complete

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read?
□ Phase 0 verification complete (ALL 13 commands, output pasted)?
□ Path A/B/C determined with evidence?
□ Existing convergence code discovered and documented?
□ Convergence matching uses semantic meaning, not column names?
□ input_bindings format matches engine expectation (from Phase 0 #10/#11)?
□ input_bindings written to rule_sets?
□ Gap detection with actionable guidance?
□ Reference data integration checked?
□ Level 3 signals written per match/gap?
□ Convergence auto-triggered after execute?
□ Manual re-trigger endpoint exists?
□ ZERO Korean Test violations (grep)?
□ ZERO period references (grep)?
□ Engine contract verification queries in completion report?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160G: "The plan says what it needs. The data says what it has. Convergence is the intelligence that connects them — not by matching strings, but by understanding meaning. 'Cumplimiento de Ingresos' feeds 'Revenue Attainment' because they mean the same thing. The system knows. In any language."*
