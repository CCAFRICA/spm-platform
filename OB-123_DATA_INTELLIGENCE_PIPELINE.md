# OB-123: DATA INTELLIGENCE PIPELINE — FROM IMPORT TO CALCULABLE STATE

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections, ALL anti-patterns
2. `SCHEMA_REFERENCE.md` — tenants, entities, profiles, rule_sets, rule_set_assignments, committed_data, periods, classification_signals, import_batches, calculation_batches, calculation_results
3. `DECISION_64_DUAL_INTELLIGENCE_SPECIFICATION.md` — Convergence Layer specification
4. `ViaLuce_Calculation_Flow_Architecture.md` — Full pipeline: INGEST → TRANSFORM → PLAN → CALCULATE → LIFECYCLE
5. `DS-005_DATA_INGESTION_FACILITY.md` — Biological immune system architecture
6. This entire prompt, start to finish, before writing any code

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Complete all phases, all proof gates, commit, push, PR.

---

## THE FUNDAMENTAL PROBLEM

A new customer does everything right — imports their roster, their transaction data, their plan documents — and the platform cannot calculate. Not because the engine is broken (it's mathematically proven at $1,253,832 ground truth). Not because the AI failed (plan interpretation runs at 92-100% confidence). The platform fails because **nothing connects imports to calculation.**

Plans exist in rule_sets. Data exists in committed_data. Entities exist nowhere (roster imported but entities not created). Assignments exist nowhere (no rule_set_assignments). Input bindings don't exist (convergence never runs). The calculation engine finds nothing to calculate.

**This has failed in every CLT the import pipeline has been tested: CLT-102 (52 findings), CLT-109, CLT-111 (51 findings), CLT-112, and CLT-122 (82 findings).** The individual symptoms change. The structural cause is the same: the pipeline RECEIVES and CLASSIFIES but doesn't WIRE.

---

## ARCHITECTURAL ANALYSIS — CHALLENGING OUR OWN ASSUMPTIONS

### Challenge 1: Is the problem in the import pipeline, or between pipelines?

The import pipeline works at the mechanical level — files are parsed, sheets are analyzed, fields are mapped (albeit with issues), data is committed. Plan interpretation works at a high level — 92-100% confidence, correct component extraction.

The gap is not INSIDE either pipeline. It is BETWEEN them. No system connects the output of plan import (rule_sets) to the output of data import (committed_data) to the output of roster import (should be entities). Three independent pipelines produce three independent artifacts with no wiring layer.

**Insight:** We don't need to rebuild import. We need to build the WIRING LAYER — the system that takes the outputs of all three import types and connects them into a calculable state.

### Challenge 2: Should wiring be automatic or manual?

Neither extreme works:
- **Fully automatic** fails because business decisions are embedded in assignments. Which officers get which plans? The ProductLicenses field suggests assignments, but the admin may want to override. A new hire might not be active yet. An officer might be on leave.
- **Fully manual** fails because it requires domain knowledge the admin shouldn't need to have (which database tables? what's a rule_set_assignment?). The platform should do the work and ask for confirmation.

**The right model is PROPOSAL + CONFIRMATION.** The platform proposes entity creation, plan assignments, and input bindings. The admin reviews and confirms (or adjusts). This is the pattern used by:
- **Terraform:** "Plan" shows what will change. "Apply" executes.
- **Git staging:** Changes are staged, reviewed, then committed.
- **IDE auto-import:** Proposes imports, developer accepts with one keystroke.
- **Bank reconciliation:** System proposes matches, accountant confirms.
- **Medical lab intake:** Samples are triaged, flagged, then a pathologist confirms the classification before processing begins.

### Challenge 3: Should all files go through one pipeline?

Currently: plan documents go through Plan Import (/admin/launch/plan-import). Data files go through Data Package Import (/data/import/enhanced). Roster files go through Data Package Import but aren't treated specially.

**The user doesn't think in terms of "plan import" vs "data import."** They think: "Here are my files. Make it work." The two-pipeline split is an implementation artifact, not a user mental model.

However, plan interpretation and data classification are genuinely different AI operations. A PDF needs to be read as a document and interpreted for business rules. A CSV needs to be parsed as structured data and classified by column semantics. Forcing both through the same technical pipeline would be worse.

**Resolution: ONE user experience, TWO processing paths, ONE wiring layer.** The user uploads everything to a single staging area. The system routes PDFs/DOCXs to plan interpretation and CSVs/XLSXs to data classification. Both feed into the same wiring layer that connects everything.

### Challenge 4: Why does multi-tab XLSX fail?

A multi-tab XLSX file is simultaneously a plan document (Tab 1: tier table) AND a data file (Tab 2: officer targets). The current architecture assumes each file is ONE thing. This is wrong.

**Every tab should be classified independently.** Tab 1 of Deposit Growth → plan_document → Plan Interpretation Agent. Tab 2 → plan_targets → Data Classification Agent → committed_data. The parent XLSX is a container. The tabs are the content units.

This is how spreadsheet applications work. This is how database ETL tools work. This is how humans think about workbooks. Our pipeline's assumption that "one file = one classification" is the root cause of Deposit Growth $0.

### Challenge 5: What about the 0% AI confidence?

Decision 70 established that AI field mapping confidence = 0. The deterministic tier carries everything. But the UI displays "0% AI Confidence" prominently, which contradicts the "AI-Powered" branding.

There are three honest options:
1. **Fix the AI** — investigate why the Anthropic API call returns zero confidence. Is it not executing? Returning unparseable responses? Getting suppressed?
2. **Rebrand the metric** — show "Mapping Method: Deterministic" instead of "AI Confidence: 0%". Honest and informative.
3. **Remove the metric** — don't show a confidence score that has no meaning. Show the mapping result, not the method score.

**For this OB:** Option 2. Show the mapping method truthfully. Investigating the AI call (Option 1) is a separate diagnostic OB. Hiding the metric (Option 3) violates transparency.

### Challenge 6: What does "ready to calculate" actually mean?

For the calculation engine to run, it needs:
1. **rule_sets** — plan with components, lookup tables, input_bindings ✓ (plan import creates these)
2. **entities** — the people/things being calculated ✗ (roster imported but entities not created)
3. **rule_set_assignments** — which entities get which plans ✗ (no assignment mechanism)
4. **committed_data** — the performance data ✓ (data import creates these)
5. **periods** — the time windows ✓ (period detection creates these, with issues)
6. **input_bindings** — how plan metrics map to committed_data fields ✗ (convergence not running for new tenants)

Items 2, 3, and 6 are completely missing. That's why a new tenant can never calculate.

---

## DESIGN DECISIONS

```
DECISION 71: WIRING LAYER ARCHITECTURE
=======================================
The platform must include a Wiring Layer that connects the outputs of
plan import, data import, and roster import into a calculable state.

The Wiring Layer:
- Creates entities from roster data (with deduplication)
- Proposes rule_set_assignments from entity licenses + plan types
- Runs convergence to generate input_bindings
- Presents a Terraform-style preview before committing
- Admin confirms or adjusts, then commits atomically

This is not optional. Without this layer, no new tenant can ever calculate.

DECISION 72: INDEPENDENT TAB CLASSIFICATION
=============================================
Each tab in a multi-tab XLSX file is classified independently.
A single file may contain both plan structure (Tab 1) and operational
data (Tab 2). The file is a container. The tabs are the content units.

DECISION 73: PROPOSAL + CONFIRMATION PATTERN
==============================================
Entity creation, plan assignments, and input bindings use
Proposal + Confirmation. The platform proposes, the admin confirms.
No fully automatic assignment. No fully manual database editing.
This applies to all wiring operations.

DECISION 74: UNIFIED STAGING EXPERIENCE
=========================================
One upload surface accepts all file types. The system routes
plan documents to Plan Interpretation and data files to Data
Classification. Both feed the same Wiring Layer. The user doesn't
need to know which pipeline handles which file.
```

---

## ANALOGIES INFORMING THE DESIGN

### 1. Airport Passenger Processing
Passengers arrive with different needs (domestic, international, business, family) but enter through ONE terminal. The system triages: passport control for international, direct to gate for domestic, lounge for business. Different processing paths, unified entry, clear wayfinding at every step. The import pipeline should work identically: one entry point, intelligent triage, clear status at every step.

### 2. Hospital Laboratory Chain of Custody
Every sample has: specimen type (blood, urine, tissue), required tests (determined by physician order), processing path (determined by specimen + test combination), quality gates (temperature, volume, hemolysis check), and chain of custody (who handled it when). The import pipeline needs the same: file type, required processing (determined by plan requirements), processing path (determined by classification), quality gates (validation), and audit trail.

### 3. Terraform Plan/Apply
Terraform's `plan` command shows exactly what will change: "3 resources will be created, 1 will be modified, 0 will be destroyed." The user reviews the plan, then `apply` executes it. The import pipeline needs a "plan" stage: "25 entities will be created. 4 plans detected. 87 assignments proposed. 3 convergence matches confirmed, 1 gap identified." The admin reviews, then "commit" executes atomically.

### 4. Bank Reconciliation Workflow
Banks receive thousands of transactions and must match them to expected payments. The system auto-matches high-confidence pairs, flags ambiguous ones for human review, and rejects clear mismatches. The convergence layer should work the same: auto-match plan requirements to data fields when confidence is high, flag ambiguous matches for review, report gaps clearly.

### 5. IDE Language Server Protocol
When a developer types a function name, the IDE: detects the symbol, searches for its definition across all imported modules, proposes the correct import, and wires it with one keystroke. The convergence layer should: detect what the plan needs, search for matching fields across all imported data, propose the binding, and wire it with admin confirmation.

### 6. Mobile Phone Initial Setup
When you set up a new phone, it guides you through: language → WiFi → account → restore backup → app setup, with clear progress indicators, skip options, and a "ready to use" state at the end. A new tenant needs the same: create tenant → import plans → import data → review wiring → calculate, with clear progress and a definitive "ready" state.

---

## IMPLEMENTATION — SIX PHASES

### PHASE 0: DIAGNOSTIC — Map the Current Wiring Gaps

Before writing any code, trace the exact path from import to calculation for the Latin American Bank tenant. This diagnostic will reveal every gap.

```bash
echo "============================================"
echo "OB-123 PHASE 0: WIRING GAP DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: WHAT EXISTS IN rule_sets? ==="
# How many plans exist for Latin American Bank?
# Are all 4 imported plans present?
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: tenants } = await sb.from('tenants').select('id, name');
console.log('All tenants:', tenants?.map(t => t.name + ' = ' + t.id));
// Use the Latin American Bank tenant ID for all subsequent queries
"

echo ""
echo "=== 0B: WHAT EXISTS IN entities? ==="
# Were entities created from the roster import?
# Expected: 25 officers if roster was processed correctly
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT_ID = 'REPLACE_WITH_ACTUAL_ID';
const { data, count } = await sb.from('entities').select('*', { count: 'exact' }).eq('tenant_id', LAB_TENANT_ID);
console.log('Entity count:', count);
data?.slice(0, 5).forEach(e => console.log('  ', e.external_id, e.name));
"

echo ""
echo "=== 0C: WHAT EXISTS IN rule_set_assignments? ==="
# Any assignments created?
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT_ID = 'REPLACE_WITH_ACTUAL_ID';
const { data, count } = await sb.from('rule_set_assignments').select('*', { count: 'exact' }).eq('tenant_id', LAB_TENANT_ID);
console.log('Assignment count:', count);
"

echo ""
echo "=== 0D: WHAT EXISTS IN committed_data? ==="
# Was transaction data committed?
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT_ID = 'REPLACE_WITH_ACTUAL_ID';
const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB_TENANT_ID);
console.log('Committed data rows:', count);
"

echo ""
echo "=== 0E: WHAT EXISTS IN periods? ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT_ID = 'REPLACE_WITH_ACTUAL_ID';
const { data } = await sb.from('periods').select('*').eq('tenant_id', LAB_TENANT_ID);
data?.forEach(p => console.log('  ', p.label, p.start_date, '→', p.end_date));
"

echo ""
echo "=== 0F: WHAT DO input_bindings LOOK LIKE? ==="
# Do any rule_sets have input_bindings populated?
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB_TENANT_ID = 'REPLACE_WITH_ACTUAL_ID';
const { data } = await sb.from('rule_sets').select('id, name, input_bindings').eq('tenant_id', LAB_TENANT_ID);
data?.forEach(rs => console.log('  ', rs.name, '→ bindings:', rs.input_bindings ? 'YES' : 'EMPTY'));
"

echo ""
echo "=== 0G: HOW DOES EXISTING MBC WIRING WORK? ==="
# MBC works. Trace HOW it was wired — this is the pattern to replicate.
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Find MBC tenant
const { data: tenants } = await sb.from('tenants').select('id, name');
const mbc = tenants?.find(t => t.name?.includes('Mexican') || t.name?.includes('MBC'));
if (mbc) {
  console.log('MBC tenant:', mbc.id);
  const { count: ec } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', mbc.id);
  const { count: ac } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', mbc.id);
  const { data: rs } = await sb.from('rule_sets').select('id, name, input_bindings').eq('tenant_id', mbc.id);
  console.log('  Entities:', ec);
  console.log('  Assignments:', ac);
  rs?.forEach(r => console.log('  Rule set:', r.name, '→ bindings:', r.input_bindings ? Object.keys(r.input_bindings).length + ' keys' : 'EMPTY'));
}
"

echo ""
echo "=== 0H: ENTITY CREATION FROM ROSTER — WHERE SHOULD IT HAPPEN? ==="
# Find the roster import path
grep -rn "entity.*creat\|create.*entity\|entities.*insert\|upsert.*entities" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0I: RULE SET ASSIGNMENT — WHERE SHOULD IT HAPPEN? ==="
grep -rn "rule_set_assignment\|assignment.*creat\|assign.*entity\|assign.*plan" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0J: CALCULATE PAGE — WHY ONLY 1 PLAN VISIBLE? ==="
cat web/src/app/operate/calculate/page.tsx 2>/dev/null | head -100
# Or wherever the calculate page is
find web/src/app -path "*calculat*" -name "page.tsx" | head -5
grep -rn "rule_sets\|plans\|active.*plan\|plan.*select" web/src/app/admin/launch/calculate/ web/src/app/operate/calculate/ --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== 0K: MULTI-TAB XLSX — PLAN IMPORT TAB HANDLING ==="
grep -rn "sheet\|tab\|worksheet\|SheetJS\|XLSX" web/src/app/admin/launch/plan-import/ web/src/lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

**PASTE ALL OUTPUT.** This diagnostic determines the exact fix plan.

**Commit:** `OB-123 Phase 0: Wiring gap diagnostic — mapping import-to-calculation chain`

---

### PHASE 1: Entity Creation from Roster Import

**The roster import must create entities.** Currently, roster data lands in committed_data but entities are never created in the entities table.

#### 1A: Find where entity resolution SHOULD happen

```bash
grep -rn "entity.*resolv\|resolveEntit\|createEntit\|entity.*upsert" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20
```

#### 1B: Implement Entity Creation

After roster data is committed (or as part of the commit step), extract unique entities:

- Read committed_data rows for the roster file (classified as entity_roster or the file with entity_id + entity_name fields)
- For each unique Entity ID value:
  - Check if entity exists in entities table (by tenant_id + external_id)
  - If not, INSERT into entities table with: tenant_id, external_id, name, metadata (branch, region, role, licenses)
  - If yes, UPDATE metadata only (don't create duplicates)
- Parse compound fields: if a column contains comma-separated values (like ProductLicenses: "CL,MO,IR,DG"), parse and store as JSON array in entity metadata

**CRITICAL: Cross-file deduplication.** OfficerID 1001 appears in 7 files. Create ONE entity with external_id = "1001", not 7. The entities table should have a UNIQUE constraint on (tenant_id, external_id).

#### 1C: Trigger Entity Creation

Identify the right trigger point:
- During data import commit (when committed_data is written)
- OR as a post-commit step
- OR as part of the Wiring Layer (Phase 4)

The trigger must detect which committed_data rows are roster rows (by file classification or by presence of entity_name + entity_id fields).

**PROOF GATE PHASE 1:**
```
PG-01: npm run build clean
PG-02: After roster import, entities table has 25 rows for LAB tenant
PG-03: Each entity has correct external_id, name, metadata
PG-04: ProductLicenses parsed: entity metadata contains license array
PG-05: No duplicate entities (OfficerID in 7 files → 1 entity)
PG-06: Existing tenants unaffected (MBC entity count unchanged)
```

**Commit:** `OB-123 Phase 1: Entity creation from roster import`

---

### PHASE 2: All Imported Plans Visible on Calculate Page

**The Calculate page must show ALL active rule_sets for the tenant, not just the most recent one.**

#### 2A: Diagnose why only 1 plan shows

```bash
# Find the calculate page query
grep -rn "rule_sets\|plans\|from.*rule\|select.*rule" web/src/app/admin/launch/calculate/ web/src/app/operate/calculate/ --include="*.tsx" --include="*.ts" | head -20
```

Common causes:
- Query filters by `period_id` and only one plan is associated with the selected period
- Query filters by some status field and only one plan is "active"
- Query uses `.single()` instead of `.select()` (returns one row)
- Last imported plan overwrites a "current plan" reference

#### 2B: Fix the query

The calculate page should:
1. Fetch ALL rule_sets for the tenant that are not archived/deleted
2. Show them as selectable list with checkboxes
3. Default to "Calculate All Plans"
4. Allow individual plan selection
5. Show plan status: ready (has assignments + data), not ready (missing assignments or data)

#### 2C: Multi-plan calculation UI

```
Active Plans for March 2024
═══════════════════════════
☑ Consumer Lending Commission      24 entities assigned    ✓ Ready
☑ Deposit Growth Incentive         22 entities assigned    ⚠ Missing target data
☑ Insurance Referral Program       20 entities assigned    ⚠ 2 unmapped fields
☑ Mortgage Origination Bonus       14 entities assigned    ✓ Ready

[Calculate Selected]    [Calculate All]
```

**PROOF GATE PHASE 2:**
```
PG-07: All 4 plans visible on Calculate page for LAB tenant
PG-08: Each plan shows entity count (may be 0 until Phase 3)
PG-09: "Calculate All" button attempts all 4 plans
PG-10: MBC Calculate page still works (4 plans visible, 320 results)
```

**Commit:** `OB-123 Phase 2: All imported plans visible on Calculate page`

---

### PHASE 3: Rule Set Assignment (Entity-to-Plan Binding)

**Entities must be assigned to plans before calculation can run.**

#### 3A: Determine assignment mechanism

Check the existing pattern — MBC HAS assignments. How were they created?

```bash
# Check MBC's rule_set_assignments
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC_TENANT_ID = 'FIND_FROM_PHASE_0';
const { data } = await sb.from('rule_set_assignments').select('entity_id, rule_set_id').eq('tenant_id', MBC_TENANT_ID).limit(10);
data?.forEach(a => console.log(a));
"
```

#### 3B: Build Assignment Proposal

After entities exist (Phase 1) and plans exist (imported), propose assignments:

1. Read each entity's metadata → extract license codes
2. Read each rule_set → extract plan type/name
3. Match license codes to plan types:
   - "CL" or "ConsumerLending" → Consumer Lending Commission plan
   - "MO" or "Mortgage" → Mortgage Origination Bonus plan
   - "IR" or "Insurance" → Insurance Referral Program plan
   - "DG" or "Deposits" → Deposit Growth Incentive plan
4. Matching can be:
   - **Deterministic:** if license codes contain keywords matching plan names
   - **AI-assisted:** send license list + plan list to AI, get proposed matches
   - **Manual:** admin maps license codes to plans in a UI

#### 3C: Assignment UI (Minimum Viable)

Add an "Assign Entities" section to the Calculate page or the Configure workspace:

```
Entity-to-Plan Assignment
═════════════════════════
License Code          Plan                            Officers    Action
─────────────────────────────────────────────────────────────────────────
ConsumerLending    →  Consumer Lending Commission     24          [Assign]
Mortgage           →  Mortgage Origination Bonus      14          [Assign]
Insurance          →  Insurance Referral Program      20          [Assign]
Deposits           →  Deposit Growth Incentive        22          [Assign]

[Assign All]    (Creates 80 rule_set_assignments)
```

#### 3D: Create Assignments

Insert into rule_set_assignments:
```sql
INSERT INTO rule_set_assignments (tenant_id, entity_id, rule_set_id, effective_from)
SELECT 'tenant_id', e.id, 'rule_set_id', NOW()
FROM entities e
WHERE e.tenant_id = 'tenant_id'
AND e.metadata->>'licenses' ? 'CL'
```

**PROOF GATE PHASE 3:**
```
PG-11: Assignment UI shows proposed mappings
PG-12: "Assign All" creates rule_set_assignments
PG-13: Officer with 4 licenses → 4 assignments
PG-14: Officer with 2 licenses → 2 assignments
PG-15: Total assignments match: sum of per-plan counts
PG-16: Calculate page now shows entity counts per plan
PG-17: MBC assignments unaffected
```

**Commit:** `OB-123 Phase 3: Rule set assignment — entity-to-plan binding`

---

### PHASE 4: Multi-Tab XLSX — Process All Tabs

**Every tab in a multi-tab XLSX must be processed. Tab 1 might be a plan. Tab 2 might be target data. Both are content.**

#### 4A: Find how plan import handles XLSX files

```bash
grep -rn "XLSX\|sheet\|tab\|worksheet\|workbook\|getSheetNames\|SheetNames" web/src/app/admin/launch/plan-import/ web/src/lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30
```

#### 4B: Ensure ALL tabs are read

When an XLSX file is uploaded for plan import:
1. Read ALL sheet/tab names
2. Send Tab 1 to Plan Interpretation (the tier table / rules)
3. For remaining tabs, classify independently:
   - Tab 2 of Deposit Growth: contains OfficerID, Growth Target → classify as `plan_targets`
   - Route to data classification and committed_data pipeline
4. Link the target data to the plan it came from (same file = same plan context)

#### 4C: Target data routing

Target data from plan XLSX Tab 2 must flow to committed_data with:
- Correct tenant_id
- Correct entity_id linkage (OfficerID column)
- A data_type that convergence can match to the plan's metric requirements
- Specifically: Deposit Growth targets need `deposit_growth_target` or similar semantic type

**PROOF GATE PHASE 4:**
```
PG-18: Upload Deposit Growth XLSX → both tabs detected
PG-19: Tab 1 → plan interpretation (tier table)
PG-20: Tab 2 → committed_data (25 officer targets)
PG-21: Target data has entity linkage (OfficerID)
PG-22: Convergence can match target data to plan requirement
```

**Commit:** `OB-123 Phase 4: Multi-tab XLSX — process all tabs`

---

### PHASE 5: Convergence for New Tenant — Input Bindings

**The convergence layer must generate input_bindings for new tenants so the engine knows which committed_data fields feed which plan components.**

#### 5A: Check how MBC's input_bindings were created

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC_TENANT_ID = 'FIND_FROM_PHASE_0';
const { data } = await sb.from('rule_sets').select('name, input_bindings').eq('tenant_id', MBC_TENANT_ID);
data?.forEach(rs => {
  console.log(rs.name + ':');
  console.log(JSON.stringify(rs.input_bindings, null, 2)?.slice(0, 500));
});
"
```

#### 5B: Run Convergence for LAB Tenant

After entities, assignments, and data are in place, run convergence:
1. For each rule_set, read its component definitions (metric_source, component_type)
2. For the assigned entities' committed_data, inventory the available fields
3. Match plan requirements to data supply
4. Generate input_bindings and write to rule_sets.input_bindings
5. Report gaps (plan needs X, data doesn't have X)

If convergence already exists in the codebase (from OB-122 or Decision 64), use it. If not, implement the minimum viable version:

```typescript
// For each component in the rule set:
// 1. What metric does it need? (e.g., "loan_disbursement_amount")
// 2. What fields are available in committed_data? (e.g., "LoanAmount" mapped to "amount")
// 3. Match by semantic type + data_type from classification
// 4. Write to input_bindings
```

#### 5C: Trigger Convergence

Convergence should run:
- After all assignments are created (Phase 3)
- OR as a manual trigger from the Calculate page ("Prepare Calculation")
- OR automatically before each calculation run

**PROOF GATE PHASE 5:**
```
PG-23: Convergence runs for LAB tenant
PG-24: Consumer Lending has non-empty input_bindings
PG-25: Mortgage has non-empty input_bindings
PG-26: Insurance Referral has input_bindings (may flag Qualified/PolicyIssued gap)
PG-27: Deposit Growth has input_bindings (including target data from Tab 2)
PG-28: MBC input_bindings unchanged
```

**Commit:** `OB-123 Phase 5: Convergence — input binding generation for new tenant`

---

### PHASE 6: End-to-End Verification — Fresh Tenant Calculates

**The proof that all phases work: Latin American Bank produces non-zero calculation results.**

#### 6A: Verify Pre-conditions
```
All 4 plans in rule_sets? [YES/NO]
25 entities in entities table? [YES/NO]
Assignments created? [YES/NO — count]
input_bindings populated? [YES/NO — per plan]
committed_data present? [YES/NO — row count]
Periods exist? [YES/NO — list]
```

#### 6B: Run Calculation
Navigate to Calculate page. Select March 2024. Calculate All 4 Plans.

#### 6C: Expected Results (approximate)
Based on the demo data I created:
- **Consumer Lending:** > $0 (25 officers × loan disbursements × rate tables)
- **Mortgage:** > $0 (14 officers × mortgage closings × tier table)
- **Insurance Referral:** > $0 if Qualified/PolicyIssued fields are mapped; $0 if not (known gap)
- **Deposit Growth:** > $0 if Tab 2 targets were imported; $0 if not

We don't have hand-calculated expected values for LAB tenant. The proof gate is **non-zero results**, not exact match. Exact reconciliation is a separate OB.

#### 6D: Regression Check
MBC must still work:
- Grand total: $3,256,677.72
- Row count: 320
- All 4 plans calculate correctly
- Pipeline Test Co: $1,253,832 (if tested)

**PROOF GATE PHASE 6:**
```
PG-29: Consumer Lending produces > $0 result
PG-30: Mortgage produces > $0 result
PG-31: Deposit Growth produces > $0 result (proves Tab 2 targets worked)
PG-32: Insurance Referral produces > $0 OR documented gap (Qualified field)
PG-33: MBC grand total = $3,256,677.72 (regression)
PG-34: MBC row count = 320 (regression)
PG-35: Architecture trace: 0 DOMAIN_LEAK maintained
```

**Commit:** `OB-123 Phase 6: End-to-end verification — fresh tenant calculates`

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | Description | Prevention |
|---------|-------------|------------|
| 18 | Stale accumulation | DELETE before INSERT on calculation_results |
| 19 | Domain vocabulary leak | No domain strings in foundational code |
| 20 | SHEET_COMPONENT_PATTERNS | Eliminated in OB-122. Do NOT reintroduce. |
| 21 | Dual code path | Single API route for privileged operations |
| 22 | RLS silent swallow | Use service role client for writes. Check count, not just error. |
| AP-14 | Partial state | Atomic operations. If entity creation fails, don't leave orphaned assignments. |
| AP-22 | Period from HireDate | Suppress period detection from roster files (Decision 52) |
| NEW | Fix scope creep | Each phase is independently committable. Don't redesign the entire import UI. |

---

## SCOPE BOUNDARIES — WHAT THIS OB IS NOT

**OUT OF SCOPE:**
- Import pipeline UX redesign (landing page, wayfinding, guidance) — separate OB
- AI confidence investigation (why 0%?) — separate diagnostic OB
- Field taxonomy expansion beyond what's needed for calculation — separate OB
- Unified staging area UI — separate OB (this OB builds the backend wiring, not the frontend)
- Exact financial reconciliation for LAB tenant — separate OB
- "Branch" → "Store ID" vocabulary fix — separate OB (OB-110 territory)
- Agent module billing wiring (CLT-122 F7) — separate strategic discussion

**IN SCOPE:**
- Entity creation from roster (backend)
- Rule set assignment mechanism (backend + minimal UI)
- All plans visible on Calculate page (frontend fix)
- Multi-tab XLSX processing (plan import enhancement)
- Convergence/input_bindings for new tenants (backend)
- End-to-end proof: fresh tenant → non-zero calculation

---

## GIT PROTOCOL

1. All work on `dev` branch from repo root (`cd /Users/AndrewAfrica/spm-platform`)
2. Phase 0 diagnostic committed first (with output pasted)
3. Each phase committed separately with descriptive message
4. `git push origin dev` after each commit
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
6. Phase 6 includes full proof gate table in completion report
7. Architecture trace + Korean Test in completion report
8. PR:

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-123: Data Intelligence Pipeline — Import-to-Calculation Wiring Layer" \
  --body "## The Wiring Layer
Addresses the core gap preventing any new tenant from reaching calculation.
82 findings across 6 CLTs (CLT-102, 109, 111, 112, 122) all trace to one cause:
nothing connects plan import + data import + roster import into a calculable state.

### What This PR Does
- Phase 1: Entity creation from roster import (25 officers)
- Phase 2: All 4 imported plans visible on Calculate page
- Phase 3: Rule set assignments (entity-to-plan binding with UI)
- Phase 4: Multi-tab XLSX processing (both tabs of Deposit Growth)
- Phase 5: Convergence/input_bindings for new tenants
- Phase 6: Fresh tenant (Latin American Bank) produces non-zero calculation

### Decisions Locked
- 71: Wiring Layer architecture
- 72: Independent tab classification
- 73: Proposal + Confirmation pattern
- 74: Unified staging experience (design, not built in this OB)

### Proof Gates: 35
### Korean Test: PASS
### MBC Regression: PASS ($3,256,677.72 / 320 rows)"
```
