# OB-179: PLATFORM CAPABILITY FOUNDATION
## Priority: P0 — Prerequisite for Third Proof Tenant
## Date: March 20, 2026
## Type: Multi-phase OB (5 missions, diagnostic-first)
## Purpose: Verify, fix, or build the platform capabilities that must exist before CRP exercises them

---

## CC_STANDING_ARCHITECTURE_RULES (v3.0)

Include the full CC_STANDING_ARCHITECTURE_RULES.md at the top of this prompt. All rules apply. Section F checklist mandatory before completion report.

---

## COMPLIANCE VERIFICATION GATE (Standing Rule 39)

**This prompt touches: lifecycle state transitions, data export, entity-user linking, reconciliation, data access.**
- Verify against SOC 2 CC6, DS-014, DS-019 where applicable.
- PCD [15] applies to any phase touching access control or data isolation.

---

## GOVERNING METHODOLOGY: DIAGNOSTIC-FIRST

**Every mission starts with Phase 0 — a read-only diagnostic.** CC examines the current code, determines what exists, what works, and what's missing. ONLY THEN does CC build what's missing.

This prevents:
- Rebuilding things that already work (CC Pattern: reimplements existing code)
- Prescribing fixes for non-existent problems (Storage RLS was already resolved)
- Guessing at schema or file structure (FP-49: SQL schema fabrication)

**Phase 0 output is committed to the completion report BEFORE any code changes.**

---

## SQL VERIFICATION GATE (FP-49 Prevention)

Before writing ANY SQL in any mission, verify the live schema:

```bash
grep -A 20 "### TABLE_NAME" /path/to/SCHEMA_REFERENCE_LIVE.md
```

If a table is not in SCHEMA_REFERENCE_LIVE.md, query the live database:
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'TABLE_NAME' 
ORDER BY ordinal_position;
```

---

## MISSION 1: LIFECYCLE TRANSITIONS VIA BROWSER UI

### Context
The ICM audit shows 4 lifecycle transitions as ⚠️ BUILT, UNVERIFIED: PREVIEW → OFFICIAL, OFFICIAL → PENDING_APPROVAL, PENDING_APPROVAL → APPROVED, APPROVED → POSTED. The lifecycle stepper IS confirmed visible on /stream (CLT-177). The question is: can the admin advance through these states via the UI?

### Phase 0: Diagnostic — What Exists?

```bash
echo "============================================"
echo "MISSION 1 PHASE 0: LIFECYCLE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Lifecycle stepper component ==="
find web/src -name "*lifecycle*" -o -name "*Lifecycle*" | grep -v node_modules | grep -v ".next" | while read f; do echo ""; echo "=== $f ==="; cat "$f"; done

echo ""
echo "=== Transition functions in code ==="
grep -rn "transitionBatch\|updateLifecycle\|setLifecycleState\|advanceLifecycle\|lifecycle_state" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "completion\|report" | head -40

echo ""
echo "=== UI buttons/actions for transitions ==="
grep -rn "Advance\|Approve\|Post\|Official\|Promote\|transition" web/src/app/ --include="*.tsx" | grep -i "button\|click\|onClick\|action" | grep -v node_modules | head -20

echo ""
echo "=== API routes for lifecycle ==="
find web/src/app/api -name "*.ts" | xargs grep -l "lifecycle\|batch\|transition" 2>/dev/null | head -10

echo ""
echo "=== All valid lifecycle states in code ==="
grep -rn "DRAFT\|PREVIEW\|OFFICIAL\|PENDING_APPROVAL\|APPROVED\|POSTED\|CLOSED\|PAID" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep "lifecycle\|state\|status" | head -20
```

**Commit Phase 0 output before proceeding.**

### Phase 1: Build What's Missing

Based on Phase 0 findings:

**IF transition buttons/actions exist:** Test each one. Fix any that don't work.

**IF transition buttons don't exist:** Create them. Each transition needs:
1. A button/action on the lifecycle stepper or /operate page
2. A function that updates `calculation_batches.lifecycle_state`
3. UI refresh to show the new state
4. Audit logging to `platform_events` (event_type: 'lifecycle.transition', payload: { from_state, to_state, batch_id })

**Separation of duties is NOT in scope.** This mission proves transitions work. Separation of duties enforcement is CRP Phase H.

### Proof Gates — Mission 1

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 diagnostic output committed | Full lifecycle code inventory |
| PG-2 | PREVIEW → OFFICIAL transition works | State changes in DB, UI reflects |
| PG-3 | OFFICIAL → PENDING_APPROVAL works | Same |
| PG-4 | PENDING_APPROVAL → APPROVED works | Same |
| PG-5 | APPROVED → POSTED works | Same |
| PG-6 | Lifecycle stepper reflects current state | Visual indicator matches DB state |
| PG-7 | Transitions logged to platform_events | Query shows lifecycle.transition rows |

**Commit per phase:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-179 M1 Phase 0: Lifecycle diagnostic" && git push origin dev
git add -A && git commit -m "OB-179 M1 Phase 1: Lifecycle transitions via browser" && git push origin dev
```

---

## MISSION 2: COMMISSION STATEMENTS PAGE (Rep Persona)

### Context
"My Compensation" — the core value proposition. CLT51A-F38 confirmed: Statements page empty. A rep must see what they earned, broken down by component.

### Phase 0: Diagnostic — What Exists?

```bash
echo "============================================"
echo "MISSION 2 PHASE 0: COMMISSION STATEMENTS DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Statement-related pages ==="
find web/src/app -path "*statement*" -o -path "*commission*" -o -path "*compensation*" -o -path "*my-pay*" | grep -v node_modules | grep -v ".next" | while read f; do echo ""; echo "=== $f ==="; cat "$f" 2>/dev/null || ls "$f"; done

echo ""
echo "=== Perform workspace pages ==="
find web/src/app/perform -name "page.tsx" | while read f; do echo ""; echo "=== $f ==="; head -30 "$f"; done

echo ""
echo "=== How calculation_results are queried ==="
grep -rn "calculation_results" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep "select\|from\|query\|fetch" | head -15

echo ""
echo "=== Component display in existing UI ==="
grep -rn "component_results\|component.*payout\|component.*amount" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== Entity selector components ==="
grep -rn "EntitySelector\|entity.*select\|entity.*picker\|entity.*dropdown" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
```

**Commit Phase 0 output before proceeding.**

### Phase 1: Build What's Missing

Based on Phase 0 findings, build a functional commission statement page that shows:

1. **Entity selector** — admin can browse any entity's statement (persona scoping comes with entity-user linking)
2. **Period selector** — switch between calculated periods
3. **Total payout** — sum of all components for selected entity + period
4. **Component breakdown table:** One row per component showing:
   - Component name (from `rule_sets.components` — NOT hardcoded)
   - Calculated payout amount (from `calculation_results.component_results` JSONB)
   - Rate or tier applied (from calculation trace if available)
5. **Data reads from:** `calculation_results` joined with `entities`, `rule_sets`, `periods`

**Korean Test:** All component labels come from the rule_set. Zero hardcoded component names.

### Proof Gates — Mission 2

| # | Gate | Criterion |
|---|------|-----------|
| PG-8 | Phase 0 diagnostic committed | Full statements code inventory |
| PG-9 | Commission statement page exists at a route | HTTP 200 |
| PG-10 | Entity selector works | Can select any entity |
| PG-11 | Component breakdown shows all components | BCL shows 4 components (C1-C4) |
| PG-12 | Amounts match calculation_results | Values rendered match DB values |
| PG-13 | Period selector works | Can switch between Oct-Mar |
| PG-14 | Korean Test | Zero hardcoded component names |

**Commit per phase:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-179 M2 Phase 0: Commission statements diagnostic" && git push origin dev
git add -A && git commit -m "OB-179 M2 Phase 1: Commission statements page — component breakdown from calculation results" && git push origin dev
```

---

## MISSION 3: ENTITY-TO-USER LINKING INFRASTRUCTURE

### Context
DS-019 Section 3.2 specifies the link: a profile is associated with an entity so the entity's data becomes visible to that user through RLS. The audit lists this as ❌ NOT BUILT.

### Phase 0: Diagnostic — What Exists?

```bash
echo "============================================"
echo "MISSION 3 PHASE 0: ENTITY-USER LINKING DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Does profiles have entity_id? ==="
grep -A 20 "### profiles" /path/to/SCHEMA_REFERENCE_LIVE.md

echo ""
echo "=== Does entities have profile_id? ==="
grep -A 20 "### entities" /path/to/SCHEMA_REFERENCE_LIVE.md

echo ""
echo "=== entity_relationships schema ==="
grep -A 20 "### entity_relationships" /path/to/SCHEMA_REFERENCE_LIVE.md

echo ""
echo "=== Configure/users page ==="
find web/src/app/configure -name "*.tsx" | while read f; do echo ""; echo "=== $f ==="; head -50 "$f"; done

echo ""
echo "=== Any existing entity assignment UI ==="
grep -rn "entity.*assign\|assign.*entity\|link.*entity\|entity.*link\|profile.*entity" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== User management/invite components ==="
grep -rn "invite\|user.*manage\|manage.*user\|UserManage\|UserInvite" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== How are profiles currently linked to data? ==="
grep -rn "profile.*entity\|entity.*profile\|profiles.*join.*entities\|entities.*join.*profiles" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
```

**Commit Phase 0 output before proceeding.**

### Phase 1: Build What's Missing

Based on Phase 0 findings:

**IF profiles has entity_id:** Build the UI to set it (admin assigns entity from dropdown).

**IF profiles does NOT have entity_id:** Determine the correct linking mechanism from the schema (it may use `entities.profile_id` or `entity_relationships`). Create migration if needed. Then build the UI.

**What the linking UI needs:**
1. On `/configure/users` (or wherever user management lives) — an "Assign Entity" action per user
2. Entity dropdown showing entities from this tenant
3. Save mechanism that creates the link in the database
4. Verification query to confirm the link

**Do NOT auto-create profiles.** Decision 79 prohibits this. Link EXISTING profiles to EXISTING entities.

### Proof Gates — Mission 3

| # | Gate | Criterion |
|---|------|-----------|
| PG-15 | Phase 0 diagnostic committed | Schema + existing code inventory |
| PG-16 | Linking mechanism identified | Column/table documented |
| PG-17 | Admin can assign entity to user | UI action works |
| PG-18 | Link verified in database | Query confirms association |

**Commit per phase:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-179 M3 Phase 0: Entity-user linking diagnostic" && git push origin dev
git add -A && git commit -m "OB-179 M3 Phase 1: Entity-to-user linking UI + persistence" && git push origin dev
```

---

## MISSION 4: PAYROLL / CSV EXPORT

### Context
Customers need to get calculation results OUT of the platform. The audit lists CSV export and payroll export as ❌ NOT BUILT.

### Phase 0: Diagnostic — What Exists?

```bash
echo "============================================"
echo "MISSION 4 PHASE 0: EXPORT DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Any existing export functionality ==="
grep -rn "export\|download\|csv\|CSV\|xlsx\|XLSX\|payroll" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -iv "import\|module\|component\|default\|type\|interface" | head -20

echo ""
echo "=== API routes for export ==="
find web/src/app/api -name "*.ts" | xargs grep -l "export\|download\|csv" 2>/dev/null | head -10

echo ""
echo "=== Export buttons in UI ==="
grep -rn "Export\|Download" web/src/app/ --include="*.tsx" | grep -i "button\|click\|action" | grep -v node_modules | head -10
```

**Commit Phase 0 output before proceeding.**

### Phase 1: Build What's Missing

Based on Phase 0 findings, build:

1. **Export button** on the calculation results page (or commission statements page from Mission 2)
2. **Server-side CSV generation** via API route:
   - Query `calculation_results` for selected period + tenant
   - Join `entities` for names and external IDs
   - Join `rule_sets` for component labels
   - Generate CSV with headers: entity_external_id, entity_name, [component_1_name], [component_2_name], ..., total
   - Component column headers come from rule_set (Korean Test)
3. **Download mechanism:** API returns CSV as downloadable file with appropriate Content-Type and Content-Disposition headers

### Proof Gates — Mission 4

| # | Gate | Criterion |
|---|------|-----------|
| PG-19 | Phase 0 diagnostic committed | Export code inventory |
| PG-20 | Export button visible | Button exists on results or statements page |
| PG-21 | CSV download completes | File downloads to browser |
| PG-22 | CSV contains all entities for period | Row count matches entity count |
| PG-23 | CSV amounts match DB values | Spot-check 3 entities |
| PG-24 | Column headers from rule_set | Korean Test — no hardcoded names |

**Commit per phase:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-179 M4 Phase 0: Export diagnostic" && git push origin dev
git add -A && git commit -m "OB-179 M4 Phase 1: Payroll CSV export from calculation results" && git push origin dev
```

---

## MISSION 5: COMPREHENSIVE RECONCILIATION PROCESS (Capability #41)

### Context

This is the most important mission in OB-179. The reconciliation process must tell you WHY calculations differ from expected values, for WHICH users, at WHAT level of detail. The BCL proof cycles required extensive manual investigation — tracing Senior vs Standard rate mismatches, discovering variant routing failures, identifying component-level errors hidden behind matching totals. Every one of those investigations should be automated.

**Governing Specifications:**
- Reconciliation Intelligence Specification (Feb 24, 2026)
- Reconciliation Report Specification (Feb 24, 2026)
- TMR Addendum 4: Adaptive Depth Reconciliation (Feb 2026)

### Phase 0: Diagnostic — What Exists?

```bash
echo "============================================"
echo "MISSION 5 PHASE 0: RECONCILIATION DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Reconciliation page(s) ==="
find web/src/app -path "*reconcil*" | grep -v node_modules | grep -v ".next" | while read f; do echo ""; echo "=== $f ==="; cat "$f" 2>/dev/null || ls "$f"; done

echo ""
echo "=== Reconciliation services/logic ==="
find web/src -name "*reconcil*" -o -name "*Reconcil*" -o -name "*benchmark*" -o -name "*Benchmark*" | grep -v node_modules | grep -v ".next" | while read f; do echo ""; echo "=== $f ==="; wc -l "$f"; head -50 "$f"; done

echo ""
echo "=== ADR / Adaptive Depth code ==="
grep -rn "adaptive\|ADR\|discoverable.*depth\|false.*green\|falseGreen" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== Benchmark upload component ==="
grep -rn "benchmark.*upload\|upload.*benchmark\|reconciliation.*upload\|upload.*reconcil" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== Current reconciliation data flow ==="
grep -rn "reconcil" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep "supabase\|fetch\|query\|select\|from" | head -15

echo ""
echo "=== Variance/delta analysis code ==="
grep -rn "variance\|delta\|mismatch\|discrepancy\|comparison" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
```

**Commit Phase 0 output before proceeding.**

### Phase 1: Build the Adaptive Depth Reconciliation Engine

Based on Phase 0 findings, build or complete the reconciliation engine. The full specification is in the Reconciliation Intelligence Specification and TMR Addendum 4. Key capabilities:

#### 1A: Benchmark Upload + AI Column Discovery

1. Admin uploads benchmark/GT file (CSV, XLSX — any language, any structure)
2. AI classifies columns (reuse SCI classification infrastructure — Korean Test compliant)
3. AI identifies three minimum elements:
   - **Entity Identifier** — maps to entity external_id
   - **Total Payout Amount** — expected total per entity
   - **Period Indicator** — which period this row represents
4. AI discovers additional depth:
   - Component-level payout columns (matches to plan component names)
   - Attainment/metric columns
   - Variant/classification columns
5. Display **Comparison Depth Assessment** before execution

#### 1B: Entity Matching + Period Filtering

1. Normalize both sides: trim, strip leading zeros, case-insensitive
2. Report: N matched, N benchmark-only, N VL-only
3. Filter benchmark to selected period

#### 1C: Multi-Layer Comparison

Execute all confirmed layers simultaneously:

**Layer 1 — Total Match (Always):** VL total vs benchmark total per entity.
- Exact: delta < $0.01, Tolerance: < 1%, Warning: 1-5%, Alert: > 5%

**Layer 2 — Component Match (When Available):** Per entity × component comparison.
- **FALSE GREEN detection:** Total matches, components don't. Priority 1 finding.

**Layer 3 — Population Match:** VL-only entities, benchmark-only entities.

**Layer 4 — Variant Analysis (When Available):** Compare VL variant assignment vs benchmark.
- Detect systematic variant misassignment (e.g., all Senior routed to Standard)

**Layer 5 — Metric Analysis (When Available):** Compare input metric values.
- Distinguish data issues (wrong input) from logic issues (wrong calculation)

#### 1D: Variance Reasoning + Priority Ordering

Priority ordering (from spec):

| Priority | Category | Description |
|----------|----------|-------------|
| 1 | FALSE GREENS | Total matches, components don't |
| 2 | Systematic Deltas | Multiple entities × identical delta |
| 3 | Red Flags | Total delta > 5% |
| 4 | Warnings | Total delta 1-5% |
| 5 | Tolerance | Total delta < 1% |
| 6 | Exact Matches | Delta < $0.01 |
| 7 | Population Mismatches | Entity in one set but not other |

Variance reasoning patterns (from BCL investigation):

| Pattern | Template |
|---------|----------|
| N entities × identical delta | "N entities show identical delta of $X. Systematic rate or variant mismatch." |
| Component A correct, B wrong | "Component [A] matches. Component [B] shows [X]% delta. Investigate rate table." |
| Total matches, components swapped | "FALSE GREEN: Total matches but components appear misattributed." |
| Entity missing from VL | "Entity [ID] in benchmark not in VL. Check import or entity binding." |
| Tier boundary | "Entity [ID] metric [X] near boundary [Y]. VL applied Tier [N], benchmark Tier [M]." |
| Period mismatch | "Benchmark contains [N] periods aggregated. VL calculated single period." |

#### 1E: Reconciliation Results UI

1. **Summary bar:** Match rate %, entity count, period(s), comparison depth, finding count by priority
2. **Findings panel (priority-ordered):** Each finding shows priority badge, affected entity count, pattern description, aggregated delta, drill-in action
3. **Entity table:** Sortable by delta, filterable by category. Columns: Entity ID, Name, Variant, VL Total, Benchmark Total, Delta, Delta %, Status
4. **Component drill-down (per entity):** Click entity → VL component vs benchmark component, metric values
5. **Population panel:** VL-only, benchmark-only entities
6. **Export:** Full reconciliation report as CSV

### Proof Gates — Mission 5

| # | Gate | Criterion |
|---|------|-----------|
| PG-25 | Phase 0 diagnostic committed | Full reconciliation code inventory |
| PG-26 | Benchmark file upload works | Admin uploads CSV/XLSX |
| PG-27 | AI discovers Entity ID + Total + Period | Comparison Depth Assessment displayed |
| PG-28 | Entity matching with normalization | Trim, case-insensitive, leading zero strip |
| PG-29 | Total-level comparison produces results | Match/mismatch per entity |
| PG-30 | Component-level comparison works | Per-component delta per entity |
| PG-31 | FALSE GREEN detection | Entities with matching total, mismatched components flagged |
| PG-32 | Systematic delta detection | Group with identical delta identified |
| PG-33 | Population mismatch reported | VL-only and benchmark-only entities listed |
| PG-34 | Variance reasoning generated | At least one reasoning template applied |
| PG-35 | Results ordered by priority | FALSE GREENS first |
| PG-36 | Entity drill-down shows components | Click entity → component breakdown |
| PG-37 | Period filtering works | Multi-period benchmark filtered correctly |
| PG-38 | Korean Test | Zero hardcoded column names — all AI-discovered |

**Commit per phase:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-179 M5 Phase 0: Reconciliation diagnostic" && git push origin dev
git add -A && git commit -m "OB-179 M5 Phase 1A: Benchmark upload + AI column discovery" && git push origin dev
git add -A && git commit -m "OB-179 M5 Phase 1B: Entity matching + period filtering" && git push origin dev
git add -A && git commit -m "OB-179 M5 Phase 1C: Multi-layer comparison engine" && git push origin dev
git add -A && git commit -m "OB-179 M5 Phase 1D: Variance reasoning + priority ordering" && git push origin dev
git add -A && git commit -m "OB-179 M5 Phase 1E: Reconciliation results UI" && git push origin dev
```

---

## BUILD + FINAL VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:**
```bash
cd /Users/AndrewAfrica/spm-platform
git add -A && git commit -m "OB-179: Build clean — all 5 missions complete" && git push origin dev
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-179_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Contains ALL Phase 0 diagnostic outputs (full code inventory per mission)
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PROOF GATES SUMMARY

| Mission | Gates | Total |
|---------|-------|-------|
| M1: Lifecycle Transitions | PG-1 to PG-7 | 7 |
| M2: Commission Statements | PG-8 to PG-14 | 7 |
| M3: Entity-User Linking | PG-15 to PG-18 | 4 |
| M4: Payroll Export | PG-19 to PG-24 | 6 |
| M5: Reconciliation | PG-25 to PG-38 | 14 |
| **TOTAL** | | **38** |

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Skipping Phase 0 diagnostic | EVERY mission starts with diagnostic. No exceptions. |
| AP-2 | Rebuilding what already exists | Phase 0 determines what exists. Build only what's missing. |
| AP-3 | Hardcoded component/column names | Korean Test on all labels. Everything from rule_set or AI discovery. |
| AP-4 | Prescribing schema without verification | Check SCHEMA_REFERENCE_LIVE.md or query live DB first. |
| AP-5 | Auto-creating profiles during entity linking | Decision 79: no auto-create. Link existing to existing. |
| AP-6 | Total-only reconciliation | Component-level comparison mandatory. False greens are P1. |
| AP-7 | Reconciliation that prescribes column mappings | AI discovers all mappings. Discoverable depth. |
| AP-8 | Client-side file handling for export | Server-side generation, download via API route. |
| AP-9 | Lifecycle transitions without audit logging | Every transition logged to platform_events. |
| AP-10 | Building persona-scoped views in this OB | Infrastructure only. Persona scoping is CRP Phase F. |

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merge and deploy, test EACH mission:

**M1:** Navigate to /stream or /operate → advance BCL batch through PREVIEW → OFFICIAL → APPROVED → POSTED. Verify each state.

**M2:** Navigate to commission statements → select entity (e.g., BCL-5012 Valentina Salazar) → verify 4 components, amounts match GT ($80 + $0 + $18 + $100 = $198 for October).

**M3:** Navigate to user management → assign an entity to a test user → verify link in DB.

**M4:** Click Export on results page → CSV downloads → verify entity count and amounts.

**M5:** Upload BCL_Resultados_Esperados.xlsx → AI discovers columns → run reconciliation → expect 100% match (BCL proven 4 times). Then modify one value in a copy of the GT file → re-upload → verify engine detects mismatch with correct priority and entity drill-down.

---

## PR

```bash
gh pr create --base main --head dev \
  --title "OB-179: Platform Capability Foundation — 5 missions, 38 proof gates, diagnostic-first" \
  --body "## Platform capabilities for Third Proof Tenant — diagnostic-first methodology

### Mission 1: Lifecycle Transitions via Browser
Diagnostic → verify or fix 4 unverified state transitions (PREVIEW through POSTED).

### Mission 2: Commission Statements
Diagnostic → build entity-level component breakdown from calculation results.

### Mission 3: Entity-to-User Linking
Diagnostic → verify schema → build assignment UI.

### Mission 4: Payroll CSV Export
Diagnostic → build server-side CSV export.

### Mission 5: Comprehensive Reconciliation (Capability #41)
Diagnostic → build Adaptive Depth Reconciliation engine with AI column discovery,
5-layer comparison, false green detection, systematic delta identification,
variance reasoning, and priority-ordered findings.

Every mission starts with Phase 0 read-only diagnostic. Build only what's missing.

## 38 Proof Gates — see OB-179_COMPLETION_REPORT.md"
```

---

*ViaLuce.ai — The Way of Light*
*OB-179: "Diagnose what exists. Build what's missing. Verify everything."*
