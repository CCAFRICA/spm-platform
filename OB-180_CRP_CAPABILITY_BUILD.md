# OB-180: CRP Capability Build — Platform Ready for Login-to-Login Test

## Date: March 20, 2026
## Type: OB (Objective Build)
## Scope: Build ALL missing capabilities so Andrew can execute the CRP login-to-login test

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Open and read `CC_STANDING_ARCHITECTURE_RULES.md` in the repository root. It contains:
- Governing Principles (Decisions 123 & 124)
- Architecture Decision Gate (mandatory before implementation)
- Anti-Pattern Registry (DO NOT repeat these mistakes)
- Standing Rules 1-39 + proposed 40 (diagnostic-first)

**Every phase in this OB must comply with all standing rules.**

---

## WHAT THIS OB IS — AND IS NOT

**IS:** CC builds every missing platform capability so that when Andrew logs in, the entire user journey works end-to-end. CC builds functionality. CC does NOT import data, run calculations, or test the platform.

**IS NOT:** CC does NOT upload files, create CRP entities, import plans, run calculations, generate results, or verify reconciliation. Andrew does ALL of that through the browser as the login-to-login test. CC's job is to make the platform capable of handling Andrew's journey.

**Andrew's Test Journey (what must work after this OB):**

```
1. Log in as VL Admin → provision CRP tenant + CRP admin user
2. Log in as CRP Admin
3. Upload 4 PDF plan documents → SCI classifies, interprets, creates 4 rule sets
4. Upload roster CSV → SCI creates 32 entities with hierarchy
5. Upload 3 transaction CSVs → SCI commits data with source_date binding
6. Assign entities to plans (multi-plan: reps get 3 plans, managers get 1)
7. Create periods (4 bi-weekly + 2 monthly)
8. Calculate → results appear per entity, per plan, per period
9. View commission statements → per-entity transaction-level trace
10. Upload GT file → reconcile → 100% match or findings
11. Move through lifecycle: PREVIEW → RECONCILE → OFFICIAL → APPROVE → POST
    (each stage must have a clear reason visible to the user)
12. Run payroll export → CSV download
13. Log in as CRP Manager → see team performance for their district
14. Log in as CRP Rep → see personal compensation, every transaction
15. View commission intelligence for each persona
```

CC builds whatever is missing so steps 1-15 work. CC does NOT execute steps 1-15.

---

## STANDING RULES APPLICABLE TO THIS OB

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 4:** GT values NEVER provided to CC
- **Rule 11:** Production discipline from Day One
- **Rule 13:** profiles.id ≠ auth.uid(). Use auth_user_id.
- **Rule 25-28:** Completion report enforcement
- **Rule 34:** No bypass recommendations
- **Rule 39:** Compliance verification gate
- **Proposed Rule 40:** Diagnostic-first — every mission starts with Phase 0

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### SQL VERIFICATION GATE (FP-49)
Before writing ANY SQL, query the live schema:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = '{TABLE}' ORDER BY ordinal_position;
```

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC (Rule 40)

**READ-ONLY. NO CODE CHANGES.**

OB-179 diagnostics confirmed that several capabilities already exist but are unverified. Before building ANYTHING, CC must determine the current state of EVERY capability Andrew's journey requires.

For each capability below, CC must:
1. Search the codebase (grep, file listing, code inspection)
2. Determine: EXISTS AND FUNCTIONAL / EXISTS BUT INCOMPLETE / DOES NOT EXIST
3. Paste evidence (code snippet, file listing, function signature)

### Capabilities to Diagnose

| # | Capability | Andrew's Step | OB-179 Status |
|---|-----------|--------------|---------------|
| D1 | VL Admin can provision a new tenant + admin user | Step 1 | Unknown — check /platform routes |
| D2 | PDF upload through /operate/import | Step 3 | NOT BUILT per ICM Audit |
| D3 | SCI processes PDF content (text extraction + classification) | Step 3 | NOT BUILT per ICM Audit |
| D4 | SCI interprets plan from PDF → creates rule_set with components | Step 3 | NOT BUILT per ICM Audit |
| D5 | CSV upload through /operate/import | Step 5 | NOT BUILT per ICM Audit |
| D6 | SCI processes CSV content (parsing + classification) | Step 5 | Unknown — check OB-133 universal ingestion |
| D7 | Entity creation from roster-classified CSV | Step 4 | Unknown |
| D8 | Multi-plan rule_set_assignments per entity | Step 6 | Unknown — check constraints |
| D9 | Bi-weekly period creation | Step 7 | Unknown — Decision 92 designed for this |
| D10 | Mixed cadence (bi-weekly + monthly in same tenant) | Step 7 | NOT BUILT — never tested |
| D11 | New primitive: linear_function (y = mx + b) | Step 8 | NOT BUILT |
| D12 | New primitive: piecewise_linear (accelerator curve) | Step 8 | NOT BUILT |
| D13 | New primitive: uncapped component modifier | Step 8 | NOT BUILT |
| D14 | Per-transaction calculation | Step 8 | NOT BUILT per ICM Audit |
| D15 | Multi-plan calculation (select/display multiple plans) | Step 8 | NOT BUILT per ICM Audit |
| D16 | Cross-plan coordination gate | Step 8 | NOT BUILT |
| D17 | Commission statements page (per-entity, per-component) | Step 9 | EXISTS per OB-179 M2 (610 lines, unverified) |
| D18 | Reconciliation via browser (upload GT, compare, report) | Step 10 | EXISTS per OB-179 M5 (5,700 lines, unverified) |
| D19 | Lifecycle transitions via browser UI | Step 11 | EXISTS per OB-179 M1 (14 files, unverified) |
| D20 | Lifecycle stage justification (why each stage exists, visible to user) | Step 11 | Unknown |
| D21 | Payroll CSV export | Step 12 | EXISTS per OB-179 M4 (button, unverified) |
| D22 | Manager persona surface (team view, district-scoped) | Step 13 | NOT BUILT per ICM Audit |
| D23 | Rep persona surface (personal compensation, transaction trace) | Step 14 | Partially built per ICM Audit |
| D24 | Entity-to-user linking (profile ↔ entity binding) | Step 13-14 | EXISTS per OB-179 M3 (38 lines added) |
| D25 | Persona-scoped RLS (rep sees only their data, manager sees team) | Step 13-14 | Unknown |
| D26 | Clawback/reversal engine (temporal_adjustment primitive) | Step 8 | NOT BUILT |
| D27 | Aggregate primitive at district/region scope (not just entity) | Step 8 | Unknown — aggregate exists but scope expansion untested |
| D28 | Separation of duties (different user required for approve vs calculate) | Step 11 | NOT BUILT per ICM Audit |

**Output: `OB-180_PHASE0_DIAGNOSTIC.md` in project root.**
**For each capability: EXISTS / INCOMPLETE / NOT EXISTS + pasted evidence.**
**Commit: "OB-180 Phase 0: Comprehensive diagnostic"**

---

## PHASE 1: PDF + CSV IMPORT SUPPORT

**Build ONLY what Phase 0 confirms is missing.**

### 1A: PDF Text Extraction
If the SCI pipeline does not handle PDFs, add PDF text extraction:
- When a PDF is uploaded at /operate/import, extract text content
- Pass extracted text to the existing SCI classification pipeline
- Use an appropriate npm library (research what's available — do NOT guess)

### 1B: CSV Parsing
If the SCI pipeline does not handle CSVs:
- When a CSV is uploaded, parse headers + rows
- Pass to SCI classification pipeline
- SCI classifies content type (transaction data, roster, etc.)

### Architecture Decision Gate
```
ARCHITECTURE DECISION RECORD
============================
Problem: PDF text extraction method

Option A: [Library 1 — CC to research]
Option B: [Library 2 — CC to research]

CHOSEN: ___
REJECTED: ___
```

### Korean Test
- Zero field-name matching in any language
- SCI uses structural heuristics for classification

**Commit: "OB-180 Phase 1: PDF + CSV import support"**

---

## PHASE 2: NEW CALCULATION PRIMITIVES

Add three new primitives to the Intent Executor vocabulary:

### 2A: linear_function
```
operation: "linear_function"
parameters: { slope: number, intercept: number }
input: { source: "metric", metric: "field_name" }
output: slope * input_value + intercept
```
The output is the continuous linear function y = mx + b. Used when commission is a rate × revenue + base draw.

### 2B: piecewise_linear
```
operation: "piecewise_linear"
segments: [
  { min: 0, max: 0.9999, slope: 0.03 },
  { min: 1.0, max: 1.1999, slope: 0.05 },
  { min: 1.2, max: null, slope: 0.08 }
]
input: { source: "ratio", sourceSpec: { numerator: "metric:actual", denominator: "metric:quota" } }
base_input: { source: "metric", metric: "actual_revenue" }
output: segment_slope * base_input_value (where segment is determined by ratio falling in [min, max))
```
The attainment ratio determines which segment's slope applies. The slope is then multiplied by the base input (revenue, not quota). NOT marginal — the entire base input uses the selected segment's rate.

### 2C: uncapped modifier
Currently all components may have caps. Add explicit support for components with NO cap:
```
modifiers: { cap: null }  // or cap absent from modifiers
```
Ensure the engine does not apply a default cap when none is specified. Verify with a test: a linear_function component with no cap on a large input should produce an uncapped result.

### 2D: Unit Tests
Write unit tests for each new primitive:
- linear_function: y = 0.06 * 100000 + 200 = 6200
- linear_function: y = 0.04 * 0 + 150 = 150 (zero input still gets intercept)
- piecewise_linear: attainment 0.85 → rate 0.03 × revenue
- piecewise_linear: attainment 1.10 → rate 0.05 × revenue
- piecewise_linear: attainment 1.30 → rate 0.08 × revenue
- uncapped: linear_function on $500,000 input produces $30,200 (not clamped)

**Commit: "OB-180 Phase 2: New calculation primitives (linear_function, piecewise_linear, uncapped)"**

---

## PHASE 3: MIXED CADENCE + BI-WEEKLY PERIODS

### 3A: Bi-Weekly Period Support
Periods table must accept bi-weekly periods (e.g., 2026-01-01 to 2026-01-15). Verify:
- No constraint blocking sub-monthly date ranges
- Decision 92 source_date binding (source_date BETWEEN start AND end) works for bi-weekly ranges
- Period creation UI or API accepts arbitrary start/end dates

### 3B: Mixed Cadence
A single tenant can have rule_sets with different cadence_config values:
- Plan CE: cadence_config = { "type": "bi-weekly" }
- Plan CN: cadence_config = { "type": "monthly" }

The calculate page must handle this — when calculating Plan CE, it binds to bi-weekly periods; when calculating Plan CN, it binds to monthly periods.

### 3C: Multi-Plan Calculation
The calculate page must support calculating multiple plans:
- Plan selector or "Calculate All" function
- Results displayed per plan, per entity, per period
- Each plan uses its own cadence for period binding

**Commit: "OB-180 Phase 3: Mixed cadence + bi-weekly periods + multi-plan calculation"**

---

## PHASE 4: CROSS-PLAN COORDINATION + AGGREGATE SCOPE EXPANSION

### 4A: Cross-Plan Coordination Gate
Plan 3 (Cross-Sell Bonus) has a gate that reads data from Plan 1 (Capital Equipment). The conditional_gate primitive must support:
```
gate_condition: {
  source: "cross_plan",
  plan_reference: "CE",  // references another plan's data
  metric: "deal_count",
  operator: ">=",
  threshold: 1
}
```
If the entity has ≥1 equipment deal in the month (from Plan CE's data), the gate passes.

### 4B: Aggregate at District/Region Scope
The aggregate primitive currently works at entity scope. Plan 4 (District Override) requires aggregation across all entities in a district or region:
```
operation: "aggregate",
scope: "district",  // or "region"
metric: "equipment_revenue",
function: "sum"
```
This requires reading the entity hierarchy (which district/region each entity belongs to) and summing across entities in that scope.

### Architecture Decision Gate
```
ARCHITECTURE DECISION RECORD
============================
Problem: How does the engine resolve cross-plan data references?

Option A: Sequential calculation — Plan CE calculated first, results stored, Plan XS reads them
Option B: Dependency graph — engine determines plan calculation order from cross-plan references
Option C: Two-pass calculation — all plans calculated, then gates evaluated, then recalculated

CHOSEN: ___
REJECTED: ___
```

**Commit: "OB-180 Phase 4: Cross-plan coordination + aggregate scope expansion"**

---

## PHASE 5: CLAWBACK ENGINE

### 5A: temporal_adjustment Primitive
When a transaction is a return/reversal (identified by type = 'equipment_return' or negative amount with a references_tx field):
1. Look up the original transaction
2. Calculate the commission that was earned on the original sale
3. Generate a negative commission entry (clawback) in the current period
4. The clawback amount = original commission rate × original sale amount × clawback_rate

### 5B: Clawback Window Enforcement
The plan specifies a clawback window (e.g., 90 days). The engine must:
1. Check if the return date is within the window of the original sale date
2. If within window: apply clawback at the plan's clawback rate (100% for CRP Plan CE)
3. If outside window: no clawback

### 5C: Clawback in Results
Clawback entries appear as negative line items in the calculation results and commission statements. The entity total for the period reflects the clawback deduction.

**Commit: "OB-180 Phase 5: Clawback engine (temporal_adjustment)"**

---

## PHASE 6: PERSONA SURFACES

### 6A: Manager Persona Surface
When a user with role='manager' logs in and has an entity linked to them:
- Show "Team Performance" view
- Scoped to their district (or region for Regional VP)
- Shows: entities in their scope, per-entity totals, per-plan breakdown
- Aggregated team total

### 6B: Rep Persona Surface
When a user with role='member' (or 'individual') logs in and has an entity linked:
- Show "My Compensation" view
- Scoped to their entity only
- Shows: per-plan commission breakdown, per-component detail, transaction-level trace
- Period history

### 6C: Persona-Scoped RLS
Ensure RLS policies enforce:
- Rep sees only their own entity's data
- Manager sees only entities in their district/region
- Admin sees all entities
- VL Admin (platform role) sees everything across all tenants

### 6D: Commission Intelligence Per Persona
Each persona should see contextually relevant intelligence:
- **Admin:** System Health, population distribution, trajectory, outliers
- **Manager:** Team trends, individual performance vs team average, attention needed
- **Rep:** Personal trend, period comparison, component breakdown, "what drives my pay"

**Commit: "OB-180 Phase 6: Persona surfaces (manager + rep) with scoped RLS"**

---

## PHASE 7: LIFECYCLE CLARITY + SEPARATION OF DUTIES

### 7A: Lifecycle Stage Justification
Each lifecycle stage must be clearly explained to the user in the UI. When the user is on the lifecycle stepper, each stage should show WHY it exists:

| Stage | User-Facing Explanation |
|-------|------------------------|
| DRAFT | Data is still flowing in. Results are preliminary and may change. |
| PREVIEW | Snapshot calculated for review. Admin can re-run as many times as needed. Not yet official. |
| RECONCILE | Compare results against expected values or legacy system. Identify and resolve discrepancies before committing. |
| OFFICIAL | Results are the record of truth for this period. Locked — no further recalculation. |
| APPROVE | Requires sign-off from a different authorized user. Separation of duties for compliance. |
| POST | Results are now visible to reps and managers. This is what they see as their compensation. |

The stepper UI should show these descriptions — not just state names.

### 7B: Separation of Duties
The user who ran the calculation (PREVIEW → OFFICIAL) cannot be the same user who approves (OFFICIAL → APPROVE). Enforce this:
- Track who performed each transition in calculation_batches metadata
- Block APPROVE if current user = user who ran OFFICIAL
- Display: "This calculation was run by [name]. A different authorized user must approve."

### 7C: Lifecycle Transition Buttons
Each valid transition should have a clear action button with confirmation:
- "Run Preview" (DRAFT → PREVIEW)
- "Mark as Official" (PREVIEW → OFFICIAL) — with warning: "This locks results"
- "Submit for Approval" (OFFICIAL → APPROVE)
- "Approve" (APPROVE → POST) — blocked if same user
- "Post Results" or auto-post on approval

**Commit: "OB-180 Phase 7: Lifecycle clarity + separation of duties"**

---

## PHASE 8: PAYROLL EXPORT VERIFICATION

### 8A: Verify Payroll Export
OB-179 confirmed handleExportCSV exists on the calculate page. Verify it:
- Produces a CSV with entity ID, entity name, period, plan, total payout
- Handles multi-plan results (one row per entity per plan, or one row per entity with plan columns)
- Includes only POSTED results (not DRAFT/PREVIEW)

### 8B: Fix If Broken
If the export doesn't work, fix it. If it only exports single-plan results, extend to multi-plan.

**Commit: "OB-180 Phase 8: Payroll export verification"**

---

## PHASE 9: TENANT PROVISIONING CAPABILITY

### 9A: VL Admin Tenant Creation
VL Admin must be able to create a new tenant and admin user through the platform:
- Create tenant with name, slug, locale, currency, hierarchy labels
- Create admin profile linked to the new tenant
- The admin can then log in and begin importing

If this UI doesn't exist, build it. If it exists but is incomplete, complete it.

### 9B: CRP Admin Authentication
Ensure the CRP admin user created during provisioning:
- Can register for MFA
- Can log in and land on the CRP tenant context
- Sees /operate/import as their starting point

**Commit: "OB-180 Phase 9: Tenant provisioning capability"**

---

## PHASE 10: BUILD VERIFICATION + PR

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000 loads
5. Run all existing tests to verify no regressions
6. Verify BCL still calculates correctly ($312,033) — regression check

### PR Creation
```bash
gh pr create --base main --head dev --title "OB-180: CRP Capability Build — Platform Ready for Login-to-Login" --body "Builds all missing platform capabilities for CRP third proof tenant test. New calculation primitives (linear_function, piecewise_linear, uncapped). Mixed cadence (bi-weekly + monthly). Cross-plan coordination gates. Clawback engine. Manager + rep persona surfaces with scoped RLS. Lifecycle clarity with separation of duties. PDF + CSV import support. Multi-plan calculation. Payroll export. Tenant provisioning. Andrew executes the login-to-login test after merge."
```

**Commit: "OB-180 Phase 10: Build verification passed"**

---

## PROOF GATES — HARD

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | linear_function primitive exists and passes unit tests | Paste test output |
| PG-02 | piecewise_linear primitive exists and passes unit tests | Paste test output |
| PG-03 | uncapped modifier works (no default cap applied) | Paste test output |
| PG-04 | PDF text extraction integrated into SCI pipeline | Paste code + test |
| PG-05 | CSV parsing integrated into SCI pipeline | Paste code + test |
| PG-06 | Bi-weekly periods can be created (no schema constraint blocking) | Paste DB test |
| PG-07 | Mixed cadence rule_sets can coexist in one tenant | Paste DB test |
| PG-08 | Cross-plan coordination gate resolves data from another plan | Paste test output |
| PG-09 | Aggregate primitive works at district scope (multi-entity sum) | Paste test output |
| PG-10 | temporal_adjustment (clawback) produces negative commission entry | Paste test output |
| PG-11 | Manager persona surface renders with district-scoped data | Paste code evidence |
| PG-12 | Rep persona surface renders with entity-scoped data | Paste code evidence |
| PG-13 | Separation of duties blocks same-user approval | Paste enforcement code |
| PG-14 | Lifecycle stage descriptions visible in UI | Paste JSX/HTML |
| PG-15 | Payroll export produces multi-plan CSV | Paste export code |
| PG-16 | VL Admin can create tenant + admin user | Paste provisioning code |
| PG-17 | npm run build exits 0 | Paste exit code |
| PG-18 | BCL regression check: $312,033 still correct | Paste calculation output |
| PG-19 | Zero Korean Test violations in new code | Paste grep results |

## PROOF GATES — SOFT

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| SG-01 | Commission statements show per-transaction detail | Paste page code |
| SG-02 | Reconciliation page accepts GT upload and displays comparison | Paste page code |
| SG-03 | Persona-scoped RLS policies exist | Paste RLS policy SQL |
| SG-04 | Multi-plan results display on calculate page | Paste UI code |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-180_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## POST-MERGE PRODUCTION VERIFICATION (MANDATORY)

After the PR is merged and deployed to production:

1. **Vercel deployment:** Confirm deployment succeeded
2. **BCL regression:** Log in, verify BCL still shows $312,033
3. **VL Admin:** Verify tenant provisioning page accessible
4. **Import page:** Verify /operate/import loads
5. **No production errors in Vercel logs**

**No finding marked ✅ without production evidence.**

---

## WHAT THIS OB DOES NOT DO

- ❌ Does NOT create the CRP tenant (Andrew does this)
- ❌ Does NOT upload any files (Andrew does this)
- ❌ Does NOT import plans or data (Andrew does this)
- ❌ Does NOT run calculations (Andrew does this)
- ❌ Does NOT verify reconciliation results (Andrew does this)
- ❌ Does NOT create CRP user accounts (Andrew does this during provisioning)

**CC builds the machine. Andrew turns the key.**
