# AUD-004 Phase 0G: Evidence Gap Closure

**Authored:** 2026-04-27
**Branch:** aud-004-phase-0g (off origin/aud-004-phase-0 at 5a02e8c13f6a9851db125e98fe216a2bde438bb1)
**Scope:** READ-ONLY inspection. Closure of 9 evidence gaps surfaced in
          AUD-004 Phase 0 analysis stage.
**Deliverable:** Pasted evidence corpus. No interpretation. No findings.
**Predecessor:** AUD_004_PHASE_0_INVENTORY.md
**Governing:** Decision 64 v2, Decision 151, Decision 153 (LOCKED 2026-04-20),
              AP-25 (Korean Test as gate), AUD-002 v2 + AUD-004 Phase 0 audit pattern.

---

## Phase 0G — Initialization

### Step 0G.0 — Substrate and Branch Verification

**Substrate:**

```
$ git fetch origin
$ git rev-parse origin/main
6bc005e65ec263f6b2c234c3501af4d80032f51d

$ git log -1 origin/main --pretty=format:'%H %s%n%aD'
6bc005e65ec263f6b2c234c3501af4d80032f51d Merge pull request #344 from CCAFRICA/diag-024-importer-engine-alignment
Mon, 27 Apr 2026 05:37:41 -0700
```

**Predecessor branch state:**

```
$ git ls-remote origin aud-004-phase-0
5a02e8c13f6a9851db125e98fe216a2bde438bb1	refs/heads/aud-004-phase-0

$ git ls-remote origin aud-004-phase-0 | wc -l
1

$ git log origin/main --oneline | grep -iE "aud-004|aud_004"
(empty result)
```

`aud-004-phase-0` is NOT merged to `origin/main` (zero AUD-004 commits on main).

**Phase 0 inventory file location:**

```
$ git show origin/main:docs/audits/AUD_004_PHASE_0_INVENTORY.md | head -3
fatal: path 'docs/audits/AUD_004_PHASE_0_INVENTORY.md' exists on disk, but not in 'origin/main'

$ git show origin/aud-004-phase-0:docs/audits/AUD_004_PHASE_0_INVENTORY.md | head -3
# AUD-004 Phase 0: Vocabulary and Shape Inventory

**Authored:** 2026-04-27
```

The Phase 0 inventory file is on `origin/aud-004-phase-0` only. Branch `aud-004-phase-0g` cut from `origin/aud-004-phase-0` per directive guidance ("if not merged, branch off `aud-004-phase-0`"). **HALT-D NOT triggered.**

### Step 0G.1 — Branch Creation

```
$ git checkout aud-004-phase-0
Already on 'aud-004-phase-0'
Your branch is up to date with 'origin/aud-004-phase-0'.

$ git checkout -b aud-004-phase-0g
Switched to a new branch 'aud-004-phase-0g'

$ git rev-parse HEAD
5a02e8c13f6a9851db125e98fe216a2bde438bb1

$ git branch --show-current
aud-004-phase-0g
```

### Step 0G.2 — Report File Scaffold

This file (`docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md`) is the scaffold. Subsequent sections append below.

---

## Section 0G.1 — Proven CRP $566,728.97 Substrate Recovery (Gap 1, hard)

### Step 0G.1.1 — Branch and tag inventory

**All branches (local + remote):**

```
$ git branch -a
  aud-004-phase-0
* aud-004-phase-0g
  cutover-revert-338-339
  dev
  diag-023-substrate-architecture-match
  feature/cl-01-customer-launch-integration
  feature/foundation-architecture
  feature/ob-02-platform-expansion
  hf-193-signal-surface
  main
  revert-pre-seeds-anchor
  remotes/origin/HEAD -> origin/main
  remotes/origin/aud-004-phase-0
  remotes/origin/aud-004-phase-0g
  remotes/origin/cutover-revert-338-339
  remotes/origin/dev
  remotes/origin/diag-023-substrate-architecture-match
  remotes/origin/feature/cl-01-customer-launch-integration
  remotes/origin/feature/ob-02-platform-expansion
  remotes/origin/hf-193-signal-surface
  remotes/origin/main
  remotes/origin/revert-pre-seeds-anchor
```

**All tags:**

```
$ git tag -l
(empty — zero tags in repo)
```

**Branches mentioning CRP / cascade / April:**

```
$ git branch -a | grep -iE "crp|cascade|april|0409|0410"
(empty result)
```

No branch carries CRP / cascade / April-period naming.

**Recent merges to main (2026-04-01 to 2026-04-25):**

```
3a3351eb Merge pull request #339 from CCAFRICA/hf-193-signal-surface
1277becc Merge pull request #338 from CCAFRICA/dev
283d4c24 Merge pull request #337 from CCAFRICA/dev
f14d28f1 Merge pull request #336 from CCAFRICA/dev
4e2bc08d Merge pull request #335 from CCAFRICA/dev
eb39a9bb Merge pull request #334 from CCAFRICA/dev
d02633bd Merge pull request #333 from CCAFRICA/dev
2a5910e9 Merge pull request #332 from CCAFRICA/dev
```

(8 merges in April; PR #339 is the HF-193 merge — recorded for cross-reference with Section 0G.3.)

### Step 0G.1.2 — Migration file inventory

**Migration directories present:**

```
$ ls web/supabase/migrations/
001_core_tables.sql
002_rule_sets_and_periods.sql
003_data_and_calculation.sql
004_materializations.sql
005_platform_user_nullable_tenant.sql
006_vl_admin_cross_tenant_read.sql
007_ingestion_facility.sql
008_add_billing_columns.sql
009_vl_admin_write_access.sql
010_import_storage_bucket.sql
011_backfill_periods_from_committed_data.sql
012_create_platform_settings.sql
013_approval_requests.sql
014_import_batches_metadata.sql
015_synaptic_density.sql
016_flywheel_tables.sql
017_calculation_results_unique_constraint.sql
018_decision92_temporal_binding.sql
020_hf090_drop_audit_fk_constraints.sql
021_ingestion_raw_storage_policies.sql
022_hf134_rls_audit_hardening.sql
023_processing_jobs_and_structural_fingerprints.sql
20260320_hf149_platform_events_tenant_nullable.sql

$ ls supabase/migrations/
016_flywheel_tables.sql
```

23 migrations in `web/supabase/migrations/`, 1 file in `supabase/migrations/` (016_flywheel_tables.sql).

**Migrations referencing CRP / cascade / e44bbcb1:**

```
$ grep -rln "cascade\|CRP\|e44bbcb1" web/supabase/migrations/ supabase/migrations/
(empty result)
```

**Migrations referencing the OB-180/181 primitives:**

```
$ grep -rln "linear_function\|piecewise_linear\|scope_aggregate" \
    web/supabase/migrations/ supabase/migrations/
(empty result)
```

No migration file carries CRP-related content or new-primitive declarations. Migrations create schema only; no migration seeds rule_sets data.

### Step 0G.1.3 — Seed script and test fixture inventory

**Seed-related files in repo:**

```
$ find . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.sql" -o -name "*.xlsx" \) \
    \( -path "*seed*" -o -path "*fixture*" -o -path "*test-data*" \) \
    | grep -v "node_modules\|.next\|.git"
./web/supabase/seed.sql
./web/scripts/verify-all-seeds.ts
./web/scripts/seed-test-pipeline.ts
./web/scripts/seed-optica-luminar.ts
./web/scripts/verify-velocidad-seed.ts
./web/scripts/seed-bcl-tenant.ts
./web/scripts/seed-velocidad-deportiva.ts
./web/scripts/seed-sabor-grupo.ts
./web/scripts/fix-vd-seed.ts
./web/src/lib/normalization/dictionary-seeder.ts
./web/src/lib/sci/seed-priors.ts
```

**Note:** `seed-bcl-tenant.ts` exists for BCL. There is NO `seed-crp-tenant.ts` or analogous seed script for CRP.

**Files referencing the proven $566,728.97 value (or variants):**

```
$ grep -rln "566728\|566,728\|566728.97" web/ docs/ | grep -v "node_modules\|.next"
docs/vp-prompts/AUD_004_PHASE_0G_DIRECTIVE.md
docs/vp-prompts/AUD-004_CONVERSATION_STARTER.md
docs/audits/AUD_004_PHASE_0_INVENTORY.md
docs/vp-prompts/AUD_004_PHASE_0_DIRECTIVE.md
```

**All four matches are AUD-004 audit/directive files.** No code file, no seed script, no test fixture, no migration, no archived export, and no diagnostic / completion report carries the proven $566,728.97 value as a recorded ground truth.

**Files referencing CRP tenant_id:**

```
$ grep -rln "e44bbcb1" web/ docs/ | grep -v "node_modules\|.next"
web/scripts/aud004-phase0e-inventory.ts
docs/vp-prompts/AUD_004_PHASE_0G_DIRECTIVE.md
docs/audits/AUD_004_PHASE_0_INVENTORY.md
docs/vp-prompts/AUD-004_CONVERSATION_STARTER.md
docs/vp-prompts/AUD_004_PHASE_0_DIRECTIVE.md
docs/completion-reports/DIAG-020-A_COMPLETION_REPORT.md
web/scripts/aud004-phase0e-inventory-v2.ts
```

DIAG-020-A_COMPLETION_REPORT.md is the only non-AUD-004 reference. Relevant excerpt:

> **Cross-tenant comparison limited.** CRP (tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7`) and Meridian (tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`) have 0 `committed_data` rows in the live database; cross-tenant probe could only confirm BCL absence, not universality.

So the CRP tenant has no `committed_data` either — confirming the substrate's data layer was already empty at the time of DIAG-020-A.

**CRP-named files in repo:**

```
$ find /Users/AndrewAfrica/spm-platform -type f \( -name "*CRP*" -o -name "*crp*" \) \
    | grep -v "node_modules\|.next\|.git"
/Users/AndrewAfrica/spm-platform/HF-173_CRP_DIAGNOSTIC_PERIOD_CONFIG_ENTITY_FIX.md
/Users/AndrewAfrica/spm-platform/OB-180_CRP_CAPABILITY_BUILD.md
/Users/AndrewAfrica/spm-platform/CLT-183_CRP_PLAN_IMPORT_VERIFICATION.md
```

These three CRP-related files are markdown PROMPTS / SPECS / VERIFICATION REPORTS, not the produced rule_set JSONB shape. Their relevant CRP-shape excerpts:

From `CLT-183_CRP_PLAN_IMPORT_VERIFICATION.md` (verification of import-time normalization):

```
| calcMethod.type | linear_function | linear_function | ✅ |
| calculationIntent.operation | linear_function | linear_function | ✅ |
| calcMethod.type | piecewise_linear | piecewise_linear | ✅ |
| calculationIntent.operation | piecewise_linear | piecewise_linear | ✅ |
| calcMethod.type | conditional_gate | conditional_gate | ✅ |
| calculationIntent.operation | conditional_gate | conditional_gate | ✅ |
| calcMethod.type | scope_aggregate | scope_aggregate | ✅ |
| calculationIntent.input.source | scope_aggregate | scope_aggregate | ✅ |
```

This file confirms the proven CRP substrate had:
- Plan 1 (Capital Equipment): `componentType=linear_function`, `calculationIntent.operation=linear_function`
- Plan 2 (Consumables Commission): `componentType=piecewise_linear`, `calculationIntent.operation=piecewise_linear`
- Plan 3 (Cross-Sell Bonus): `componentType=conditional_gate`, `calculationIntent.operation=conditional_gate`
- Plan 4 (District Override): `componentType=scope_aggregate`, with `calculationIntent.operation=scalar_multiply` and `calculationIntent.input.source=scope_aggregate` (per CLT-183 architectural note: "scope_aggregate is a source type, not an operation").

This is the **shape vocabulary** of the proven CRP substrate — but the document does not preserve the full JSONB structure (boundaries, segments, rates, conditions). Only operation-name + componentType-name verification, and a high-level architectural note (F04: "HF-162 calculationIntent example for scope_aggregate is architecturally incorrect").

**File references to CRP test fixtures:**

```
$ grep -n "CRP_" web/.../*.md
HF-156_PLAN_CONVERTER_FIX.md:195: Reimport CRP_Plan_1_Capital_Equipment.pdf through the browser
HF-180_RECONCILIATION_SELECTED_PERIOD_ONLY.md:235: Upload `CRP_Resultados_Esperados.xlsx`
HF-180_RECONCILIATION_SELECTED_PERIOD_ONLY.md:328: Ground truth: CRP_Resultados_Esperados.xlsx
DIAG-016_PLAN2_PIECEWISE_LINEAR.md:20: ### GT Structure (from CRP_Resultados_Esperados.xlsx, Plan 2 sheet)
```

**Disk verification:**

```
$ find . -type f -name "CRP_*"
(empty)
$ find . -type f -name "*Resultados_Esperados*"
(empty)
```

The fixture files `CRP_Plan_1_Capital_Equipment.pdf` and `CRP_Resultados_Esperados.xlsx` are referenced in build prompts but **do not exist on disk**. They were inputs to import operations that did not preserve the resulting rule_set JSONB in committed source. The only Excel file in the repo is `web/scripts/CLT14B_Reconciliation_Detail.xlsx` (unrelated).

### Step 0G.1.4 — Git history shape archaeology

**Git commits mentioning the CRP-related new primitives:**

```
$ git log --all --grep="linear_function\|piecewise_linear\|scope_aggregate" --oneline
882bc94c DIAG-020: component bindings drift diagnostic
1343d336 HF-188: Intent executor as sole calculation authority
497669d4 HF-187: Typed transformation bridge for new calculation primitives
6eb443d7 DIAG-016: Plan 2 piecewise_linear findings — missing monthly_quota metric
fc6422fe OB-191: Convergence Pass 4 — calculationIntent metrics + scope_aggregate
c96fbcf3 OB-186 Phase 4: Filtered scope aggregates + cross-plan metric resolution
f59b9c4c OB-186 Phase 3: Quota/target resolution for piecewise_linear
6991f101 HF-162 Phase 3: Update MAPPING RULES with piecewise_linear IMPORTANT note
8af813ff HF-162 Phase 2: Add 6 missing calculationIntent examples (10/10 types covered)
5361c94d HF-162 Phase 1: Add 5 TYPE SELECTION RULES to plan_interpretation prompt
3d89313b AUD-002: Prompt disambiguation analysis — type overlap risk assessment
ed6b1946 HF-160: AI prompt vocabulary + priority inversion — root cause fix
03ed3795 HF-159: normalizeCalculationMethod passes through new primitive types
d838ca9f HF-156: Plan converter -- connect AI intelligence to calculation engine
3fee55e5 HF-155 Items 1+2: crossDataCounts + scopeAggregates population
e4a93d0f OB-182 Phase 1+2: Import sequence-independence + plan converter extension
b65f9615 OB-181 Phase 2+4: Cross-plan coordination + district aggregate scope
```

**OB-180 commits (CRP capability build):**

```
$ git log --all --oneline | grep -iE "OB-180"
a3bd8f05 OB-180: Completion report -- 3 gaps addressed, 2 deferred
f20589e5 OB-180: Fix build -- resolveValue for composable inputs + describeOperation
2c21ab93 OB-180 Phase 7A: Lifecycle stage justification text
991c6b51 OB-180 Phase 2: New calculation primitives (linear_function, piecewise_linear)
fcd39afd OB-180 Phase 0: Comprehensive diagnostic -- 23/28 capabilities already exist
277633fb OB-180 Phase 0: CRP capability build prompt
```

**Pickaxe search for the proven CRP value:**

```
$ git log --all -S "566728" --oneline
(empty result)
```

**Pickaxe search for "Cascade Revenue Partners" (the CRP tenant name):**

```
$ git log --all -S "Cascade Revenue Partners" --oneline
5a02e8c1 AUD-004 Phase 0: complete inventory pass
6d5f0420 AUD-004 Phase 0E: production rule_set shape inventory
```

The string "Cascade Revenue Partners" appears in git history ONLY in the AUD-004 audit commits authored today.

**Detail commit for the OB-180 Phase 2 primitive build (to confirm what was built, not what was calculated):**

```
$ git show 991c6b51 --stat
commit 991c6b51f2a2a11b80d8c4d4cf63afbdab52c932
Author: Andrew Africa <AndrewAfrica@Schweitzer.local>
Date:   Fri Mar 20 19:42:52 2026 -0700

    OB-180 Phase 2: New calculation primitives (linear_function, piecewise_linear)
    [...]
    Both primitives use Decimal arithmetic (Decision 122).
    Added to IntentOperation union type + switch in executeOperation.

 web/src/lib/calculation/intent-executor.ts | 42 ++++++++++++++++++++++++++++++
 web/src/lib/calculation/intent-types.ts    | 27 ++++++++++++++++++-
 2 files changed, 68 insertions(+), 1 deletion(-)
```

Confirms the executor handlers were added. No CRP rule_set fixture is in this commit.

**Decision 147 / HF-191 / synaptic forwarding commits:**

```
$ git log --all --grep="Decision 147\|HF-191\|synaptic forwarding" --oneline
be2e5321 Merge pull request #342 from CCAFRICA/cutover-revert-338-339
52048184 REVERT-001: anchor identified + branch staged; awaiting directive audit
843aa926 DIAG-023: substrate-architecture match verification — read-only findings + completion report
c9f2015a HF-194 Phase 5: verification specs + completion report
e76c3e27 HF-193 Phase 3: BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets
4deacb16 HF-191 Phase 3: Build verification + completion report
3a31bdea HF-191 Phase B: Convergence reads and validates plan agent seeds
70aba6bc HF-191 Phase A: Plan agent outputs metricSemantics, stored as plan_agent_seeds
98408eb9 HF-191 Phase 0: Architecture Decision Gate
```

The HF-193 Phase 3 commit is annotated "BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets" — recorded for Section 0G.3 cross-reference. No CRP-substrate-restoration commit appears.

### Step 0G.1.5 — Database backup / archive trace

```
$ find . -type d \( -name "*backup*" -o -name "*archive*" -o -name "*snapshot*" \) \
    | grep -v "node_modules\|.next\|.git"
(empty result)

$ find . -type f \( -name "*.sql.gz" -o -name "*.dump" \) \
    | grep -v "node_modules\|.next\|.git"
(empty result)
```

No DB backup/archive/snapshot files exist in the repo.

### Step 0G.1.6 — HALT-C: Proven CRP Substrate Not Retrievable

After exhausting Steps 0G.1.1-0G.1.5:

- **Branches:** No CRP-named branch. Only `main`, `dev`, `aud-004-phase-0`, `hf-193-signal-surface`, `cutover-revert-338-339`, and feature branches unrelated to CRP-substrate preservation.
- **Tags:** Zero tags exist in the repo.
- **Migration files:** Zero CRP-related migrations. Zero migrations creating rule_sets with CRP shape.
- **Seed scripts:** `seed-bcl-tenant.ts` exists; no `seed-crp-tenant.ts` or equivalent.
- **Test fixtures:** `CRP_Plan_1_Capital_Equipment.pdf` and `CRP_Resultados_Esperados.xlsx` are referenced in build prompts but absent from disk.
- **JSON exports:** No CRP rule_set JSON dump in the repo.
- **Git pickaxe:** Zero historical commits introduce or modify the value `566728`. Zero non-AUD-004 commits introduce "Cascade Revenue Partners" or `cascade-revenue-partners` strings.
- **DB backups:** No backup/archive/snapshot directories or files.
- **DIAG-020-A note:** Confirms CRP `committed_data` table is empty at this substrate's last live read (data layer absent in addition to rule_set absence).

**HALT-C TRIGGERED.** The proven April 9-10 CRP substrate ($566,728.97 pre-clawback across 10 periods × 4 OB-180/181 primitives `linear_function`, `piecewise_linear`, `scope_aggregate`, `conditional_gate`) is not retrievable from this `origin/main` substrate, nor from any branch, tag, migration, seed script, fixture, JSON export, git diff, or DB archive accessible to CC.

The shape **vocabulary** (the four operation strings) is preserved in `CLT-183_CRP_PLAN_IMPORT_VERIFICATION.md`. The shape **structure** (boundaries, segments, rates, conditions, scopes) is not preserved anywhere.

**Architect verbatim provision of proven baseline shape is required for AUD-004 remediation conversation.** This gap remains open after Phase 0G.

---

## Section 0G.2 — `executeIntent` Outer-Scope Error Containment (Gap 2, hard) + `executeIntent` Orchestrator (Gap 6, soft)

### Step 0G.2.1 — Outer-scope error trace

```
$ grep -n "for (\|try {\|} catch\|throw\|console\.error\|addLog" \
    web/src/app/api/calculation/run/route.ts
```

Relevant entries (filtered to error-path context):

```
61:export async function POST(request: NextRequest) {
74:  const addLog = (msg: string) => { log.push(msg); console.log(`[CalcAPI] ${msg}`); };
133:    try {                                              # HF-165 convergence (non-blocking)
176:  } catch (convErr) {
178:    addLog(`HF-165: Convergence failed (non-blocking): ${convErr instanceof Error ? convErr.message : String(convErr)}`);
889:  try {                                                # AI context fetch
920:  } catch (aiErr) {
921:    addLog(`AI context fetch failed (non-blocking): ${aiErr instanceof Error ? aiErr.message : 'unknown'}`);
930:  try {                                                # Agent memory load
934:  } catch (memErr) {
935:    console.error('[CalcAPI] Agent memory load failed, falling back to direct density:', memErr);
936:    try {
939:    } catch {
941:      addLog('Fallback: Synaptic density load failed (non-blocking) — starting fresh');
995:  try {                                                # Period history (temporal_window)
1016:  } catch (histErr) {
1017:    addLog(`Period history load failed (temporal_window will degrade gracefully): ...`);
1209:  try {                                                # Materialization (period_entity_state)
1274:  } catch (matErr) {
1316:  for (const entityId of calculationEntityIds) {       # ← OUTER ENTITY LOOP START
1672:    for (const ci of entityIntents) {                  # ← INTENT LOOP (executeIntent at 1683)
1759:      try {                                            # Inline insight checkpoint
1764:      } catch {
1765:        // Never block calculation for insight failure
1766:      }
1776:  }                                                    # ← OUTER ENTITY LOOP END
1808:    try {                                              # Flywheel updates
1819:  } catch (fwErr) {
1949:    addLog(`WARNING: Failed to transition batch: ${transErr.message}`);
1955:  try {                                                # Insights generation
1993:  } catch (insightErr) {
1995:    addLog('Insight analysis failed (non-blocking)');
2040:    addLog(`WARNING: Failed to materialize outcomes: ${outcomeWriteErr}`);
2048:  try {                                                # Metering
2064:  } catch {
2065:    addLog('Metering failed (non-blocking)');
```

**Key structural facts (no interpretation):**

- The outer entity loop runs from **line 1316 (`for (const entityId of calculationEntityIds)`)** to **line 1776 (closing brace)**.
- The intent loop (which calls `executeIntent` at line 1683) runs from line 1672 to line 1705 — entirely INSIDE the entity loop body.
- **No `try { ... } catch (...)` block wraps either the entity loop or the intent loop.**
- The only try/catch *inside* the entity loop body is at lines 1759-1766, around the optional inline insight checkpoint — far from the `executeIntent` call site.
- Earlier-in-route try/catch blocks (lines 133-178, 889-921, 930-941, 995-1017, 1209-1274) all wrap NON-CRITICAL pre-loop operations and are explicitly annotated "(non-blocking)".
- `executeIntent` at line 1683 is NOT wrapped in any catch.

### Step 0G.2.2 — `executeIntent` call site context (lines 1640-1740)

The full code block was captured at Phase 0F evidence and Step 0G.2.1's grep. Annotation of error-flow paths:

```ts
    // line 1670-1705: HF-188 intent loop
    let intentTotalDecimal = ZERO;
    for (const ci of entityIntents) {
      const metrics = perComponentMetrics[ci.componentIndex] ?? allEntityMetrics;
      const entityData: EntityData = { entityId, metrics, attributes: {}, priorResults: [...priorResults], periodHistory: ..., crossDataCounts: ..., scopeAggregates: ... };
      const intentResult = executeIntent(ci, entityData);  // ← line 1683: NO try/catch
      intentTraces.push(intentResult.trace);

      // line 1687-1695: rounding
      const comp = selectedComponents[ci.componentIndex];
      const compIntent = comp?.calculationIntent as Record<string, unknown> | undefined;
      const compConfig = (comp?.tierConfig || comp?.matrixConfig || comp?.percentageConfig || comp?.conditionalConfig) as Record<string, unknown> | undefined;
      const precision = inferOutputPrecision(compIntent, compConfig);
      const { rounded, trace: roundingTrace } = roundComponentOutput(
        intentResult.outcome, ci.componentIndex, ci.label, precision
      );
      const roundedValue = toNumber(rounded);

      if (componentResults[ci.componentIndex]) {
        componentResults[ci.componentIndex].payout = roundedValue;
      }
      entityRoundingTraces[ci.componentIndex] = roundingTrace;

      intentTotalDecimal = intentTotalDecimal.plus(rounded);
      priorResults[ci.componentIndex] = roundedValue;
    }
```

**Code-path analysis (factual, no interpretation):**

- **Line 1683:** `const intentResult = executeIntent(ci, entityData);` — the result is destructured below for `.outcome` and `.trace`.
- **Line 1684:** `intentTraces.push(intentResult.trace);` — accesses `intentResult.trace`. If `executeIntent` threw, line 1684 is never reached.
- **Line 1693:** `roundComponentOutput(intentResult.outcome, ...)` — accesses `intentResult.outcome`. If `executeIntent` threw, line 1693 is never reached.
- **Line 1695:** `const roundedValue = toNumber(rounded);` — `toNumber` is called on `rounded` (the Decimal output of `roundComponentOutput`). If `roundComponentOutput` returns a `Decimal`, this is safe.
- **Throwable spots between line 1683 and the line-1737 `entityResults.push`:** `executeIntent` (line 1683), `roundComponentOutput` (line 1692-1694), `toNumber` (line 1695, 1708), `intentTotalDecimal.plus(rounded)` (line 1703 — Decimal arithmetic, can throw on invalid input).
- **None of these spots have try/catch.** A throw propagates to the entity-loop scope, exits the entity loop, exits the POST function (line 61), and surfaces to Next.js's runtime.

### Step 0G.2.3 — Top-level route error handler

```
$ grep -n "export async function POST\|return NextResponse" \
    web/src/app/api/calculation/run/route.ts
61:export async function POST(request: NextRequest) {
66:    return NextResponse.json(  # missing-fields 400
86:    return NextResponse.json(  # rule_set not found 404
114:    return NextResponse.json(  # also rule_set not found
257:    return NextResponse.json(  # also error path (HF-165 convergence)
316:    return NextResponse.json(
352:    return NextResponse.json(
981:    return NextResponse.json(
1873:    return NextResponse.json(
1907:    return NextResponse.json(
2082:  return NextResponse.json({  # final SUCCESS response
```

The POST function signature (line 61) opens the function; lines 62-2128 run sequentially. **No `try { ... } catch (error)` wraps the function body.**

Verbatim opening lines:

```ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, periodId, ruleSetId } = body;

  if (!tenantId || !periodId || !ruleSetId) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, periodId, ruleSetId' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); console.log(`[CalcAPI] ${msg}`); };

  addLog(`Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}`);
```

The POST function returns explicit `NextResponse.json(...)` for known error conditions (missing fields, rule-set not found, period not found, etc., at the early-validation lines), but the body of the function — including the entity loop — has no surrounding try/catch.

**Behavior of an exception thrown inside the entity loop:**
- Throw occurs at line 1683 (or later in the intent loop body).
- No catch within the entity loop body. Throw exits the loop iteration unfinished.
- Exits the entity loop entirely (skipping `addLog`, `entityResults.push`, etc., for the affected entity AND all subsequent entities).
- Exits all subsequent post-loop processing (synaptic flush, calculation_results write, outcomes materialization, insights, metering).
- Exits the POST function. Returns to the Next.js framework's default error handler, which serializes a 500 response (no custom body, no `log` array, no partial `entityResults` published to the caller).

**`addLog` and `log` array fate:** if a throw aborts the function, the `log` array is never returned (the success response at line 2082 is the only path that includes `log`). The console.log inside `addLog` (line 74) WILL have already flushed to stdout for entries written before the throw, so server logs preserve a partial trace.

### Step 0G.2.4 — `executeIntent` orchestrator inventory (Gap 6, folded)

```
$ grep -n "function executeIntent\|export.*executeIntent" \
    web/src/lib/calculation/intent-executor.ts
554:export function executeIntent(
```

Single declaration. **`executeIntent` body verbatim (lines 554-634):**

```ts
export function executeIntent(
  intent: ComponentIntent,
  entityData: EntityData
): ExecutionResult {
  const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
  const modifierLog: Array<{ modifier: string; before: number; after: number }> = [];
  const trace: Partial<ExecutionTrace> = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    confidence: intent.confidence,
  };

  let outcome = ZERO;

  // 1. Resolve variant routing (if present)
  if (intent.variants) {
    const routing = intent.variants;
    const attrSrc = routing.routingAttribute;

    // For entity_attribute source, resolve as string for matching
    let attrValue: string | number | boolean = '';
    if (attrSrc.source === 'entity_attribute') {
      attrValue = entityData.attributes[attrSrc.sourceSpec.attribute] ?? '';
    } else {
      attrValue = toNumber(resolveSource(attrSrc, entityData, inputLog));
    }

    const matchedRoute = routing.routes.find(r => String(r.matchValue) === String(attrValue));

    if (matchedRoute) {
      trace.variantRoute = {
        attribute: attrSrc.source === 'entity_attribute' ? attrSrc.sourceSpec.attribute : 'resolved',
        value: attrValue,
        matched: String(matchedRoute.matchValue),
      };
      outcome = executeOperation(matchedRoute.intent, entityData, inputLog, trace);
    } else {
      switch (routing.noMatchBehavior) {
        case 'first':
          if (routing.routes.length > 0) {
            outcome = executeOperation(routing.routes[0].intent, entityData, inputLog, trace);
          }
          break;
        case 'skip':
          outcome = ZERO;
          break;
        case 'error':
          outcome = ZERO;
          break;
      }
    }
  } else if (intent.intent) {
    // 2. Execute single operation (no variants)
    outcome = executeOperation(intent.intent, entityData, inputLog, trace);
  }

  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);

  // 4. Convert to native number at output boundary (Decision 122)
  const outcomeNumber = toNumber(outcome);

  // 5. Build complete trace
  const executionTrace: ExecutionTrace = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    variantRoute: trace.variantRoute,
    inputs: inputLog,
    lookupResolution: trace.lookupResolution,
    modifiers: modifierLog,
    finalOutcome: outcomeNumber,
    confidence: intent.confidence,
  };

  return {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    outcome: outcomeNumber,
    trace: executionTrace,
  };
}
```

**Branch inventory:**

1. **Variant-routing branch (lines 569-604):** entered when `intent.variants` is present.
   - 1a: `matchedRoute` found (line 583) → `executeOperation(matchedRoute.intent, ...)` at line 589.
   - 1b: no match — `noMatchBehavior` switch at line 591:
     - `'first'` → `executeOperation(routes[0].intent, ...)` at line 594.
     - `'skip'` → `outcome = ZERO` at line 598.
     - `'error'` → `outcome = ZERO` at line 601. **Note:** the `'error'` case does NOT throw or log; it produces zero just like `'skip'`.
     - The switch has no `default:` keyword. If `noMatchBehavior` is some other string, none of the three cases fires; `outcome` retains its initial `ZERO` value from line 566.
2. **Single-operation branch (lines 605-608):** entered via `else if (intent.intent)` when no variants exist. Calls `executeOperation(intent.intent, ...)` at line 607.
3. **Else (no variants AND no `intent.intent`):** no branch matches. `outcome` stays at the initial `ZERO` (line 566).

**Default behavior when no branch matches:** `outcome = ZERO`. No log emitted, no error thrown.

**Steps 3-5 (lines 610-633) run unconditionally:**
- Line 611: `outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);` — if `outcome` is `undefined` (per a fall-through `executeOperation` per Phase 0F.4), `applyModifiers` is called with `undefined`. To be inventoried in Section 0G.5.3.
- Line 614: `const outcomeNumber = toNumber(outcome);` — calls `.toNumber()` on `outcome`. If `outcome` is `undefined`, throws `TypeError: Cannot read properties of undefined (reading 'toNumber')`.

**Return shape (lines 628-633):** `{ entityId, componentIndex, outcome: outcomeNumber, trace: executionTrace }`. The `outcome` is a native number (Decision 122 boundary conversion).

**Throw paths within `executeIntent`:**
- Line 578: `toNumber(resolveSource(attrSrc, ...))` — `resolveSource` returns a `Decimal`; if it throws (e.g., from internal access), propagates. `resolveSource`'s switch (Phase 0G.5 will inventory) is exhaustive on `IntentSource` discriminated union — TypeScript-compile-safe but not runtime-safe.
- Line 589/594/607: `executeOperation` calls — per Phase 0F.4 / 0B Boundary 6 analysis, these may return `undefined` (no default branch in the switch).
- Line 611: `applyModifiers(undefined, ...)` if outcome is undefined.
- Line 614: `toNumber(undefined)` → TypeError.

The function declares no try/catch; any throw propagates to the call site at run/route.ts:1683.


