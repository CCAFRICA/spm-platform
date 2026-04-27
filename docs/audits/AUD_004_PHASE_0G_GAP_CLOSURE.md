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

---

## Section 0G.3 — HF-193 Landing State on `main` (Gap 3, hard)

### Step 0G.3.1 — HF-193 branch state

**HF-193 branch existence:**

```
$ git branch -a | grep -iE "hf-193|hf_193|signal-surface"
  hf-193-signal-surface
  remotes/origin/hf-193-signal-surface
```

The `hf-193-signal-surface` branch exists locally and on origin.

**HF-193 commits visible from `origin/main` history (not necessarily landed):**

```
$ git log origin/main --oneline --grep="HF-193\|hf_193"
be2e5321 Merge pull request #342 from CCAFRICA/cutover-revert-338-339
c9f2015a HF-194 Phase 5: verification specs + completion report
882bc94c DIAG-020: component bindings drift diagnostic
3a3351eb Merge pull request #339 from CCAFRICA/hf-193-signal-surface
445fcb00 HF-193 Phase 4: completion report
e76c3e27 HF-193 Phase 3: BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
30e79eeb HF-193 Phase 1: persistSignal accepts A2 columns (ruleSetId, metricName, componentIndex)
8fae55e9 HF-193 Gate B preflight: Decision 30 v1 violation investigation directive
3c07a126 HF-193: design artifact + Gate A directive
[+ multiple HF-193-A Phase 2.2a/b commits and HF-193-A Phase 1.x commits]
```

**Recent commits on `origin/main` since 2026-04-20:**

```
$ git log origin/main --oneline --since="2026-04-20"
6bc005e6 Merge pull request #344 from CCAFRICA/diag-024-importer-engine-alignment
6d942de7 DIAG-024: importer-engine alignment diagnostic — evidence pack only
6504b7cf Merge pull request #343 from CCAFRICA/cln-001-repo-cleanup
16ba3bea CLN-001: gitignore .DS_Store and .claude/settings.local.json; commit orphaned CLT-197 vp-prompt
be2e5321 Merge pull request #342 from CCAFRICA/cutover-revert-338-339
13dc698e Revert "Merge pull request #338 from CCAFRICA/dev"           # ← HF-191 reverted
314e8db0 Revert "Merge pull request #339 from CCAFRICA/hf-193-signal-surface"   # ← HF-193 reverted
a2921fbb Merge pull request #340 from CCAFRICA/hf-193-signal-surface  # ← cherry-pick of HF-194 only
c9f2015a HF-194 Phase 5: verification specs + completion report
2665b264 HF-194 Phase 4: register AP-17 parallel metadata construction tech debt
b784291c HF-194 Phase 3: add field_identities to execute-bulk metadata
34f2c42d HF-194 Phase 2: migrate execute/route.ts to import from lib/sci
d56f3e66 HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci
cf84ee4e DIAG-022: pipeline architecture read
966c2abe DIAG-021 R1: caller-writer + matcher path + data_type drift diagnostic
4750e857 DIAG-020-A: field_identities absence confirmation
882bc94c DIAG-020: component bindings drift diagnostic
3a3351eb Merge pull request #339 from CCAFRICA/hf-193-signal-surface  # ← original HF-193 merge (later reverted)
[...]
```

### Step 0G.3.2 — CLN-001 commit trace

```
$ git log origin/main --oneline --grep="CLN-001\|cln_001\|plan_agent_seeds"
6504b7cf Merge pull request #343 from CCAFRICA/cln-001-repo-cleanup
16ba3bea CLN-001: gitignore .DS_Store and .claude/settings.local.json; commit orphaned CLT-197 vp-prompt
3a3351eb Merge pull request #339 from CCAFRICA/hf-193-signal-surface
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
3a31bdea HF-191 Phase B: Convergence reads and validates plan agent seeds
70aba6bc HF-191 Phase A: Plan agent outputs metricSemantics, stored as plan_agent_seeds
```

CLN-001's diff:

```
$ git show 16ba3bea --stat
commit 16ba3beac07686806b082a2f148bb65922a2294b
Author: Andrew Africa <259441702+CCAFRICA@users.noreply.github.com>
Date:   Sun Apr 26 19:40:12 2026 -0700

    CLN-001: gitignore .DS_Store and .claude/settings.local.json; commit orphaned CLT-197 vp-prompt

 .DS_Store                                          | Bin 8196 -> 0 bytes
 .claude/settings.local.json                        | 299 ------------
 .gitignore                                         |   6 +
 docs/.DS_Store                                     | Bin 6148 -> 0 bytes
 docs/vp-prompts/CLN-001_REPO_CLEANUP.md            | 233 +++++++++
 .../vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md | 533 +++++++++++++++++++++
 6 files changed, 772 insertions(+), 299 deletions(-)
```

CLN-001 changed only repo-housekeeping files (`.gitignore`, removed `.DS_Store`, removed `.claude/settings.local.json`, added two markdown VP-prompts). **CLN-001 did NOT touch `plan_agent_seeds` source code.**

The seeds-removal happened earlier at `95efc14d HF-193 Phase 2: delete plan_agent_seeds...` — but the merge that brought it (PR #339) was REVERTED by `314e8db0`.

**Critical revert chain:**

```
$ git show be2e5321 --stat | head -12
commit be2e532146c9d5174627f7ae508d1399bc792adb
Merge: a2921fbb 13dc698e
Author: CCAFRICA <259441702+CCAFRICA@users.noreply.github.com>
Date:   Sun Apr 26 16:28:16 2026 -0700

    Merge pull request #342 from CCAFRICA/cutover-revert-338-339
    
    CLT-197: revert PRs #338 (HF-191 seeds) and #339 (HF-193 partial eradication)
```

PR #342 (`cutover-revert-338-339`) explicitly reverted BOTH PR #338 (HF-191 seeds-introduction) AND PR #339 (HF-193 seeds-removal + signal-surface introduction). Net effect on `origin/main`:

- The HF-191 seeds-introduction was undone (the seeds code was removed by the revert).
- The HF-193 signal-surface introduction was undone (the metric_comprehension / agent_activity signal-write code was removed by the revert).
- The substrate is back to its pre-PR-#338 state for this code path, EXCEPT HF-194 (field_identities) which was cherry-picked back via PR #340 (`a2921fbb`).

```
$ git show 13dc698e --stat | head -8
commit 13dc698e13b92729a20639b1fead540b41ce1169
Author: Andrew Africa <259441702+CCAFRICA@users.noreply.github.com>
Date:   Sun Apr 26 16:13:23 2026 -0700

    Revert "Merge pull request #338 from CCAFRICA/dev"
    
    This reverts commit 1277becccb3a7b82f4b34a97fb02590a5e27ab28, reversing
    changes made to 283d4c24ec196b7f45052292367af895dbaabb1e.
```

```
$ git show 314e8db0 --stat | head -8
commit 314e8db08ad44c2871ef16316e17e778305324fe
Author: Andrew Africa <259441702+CCAFRICA@users.noreply.github.com>
Date:   Sun Apr 26 16:13:14 2026 -0700

    Revert "Merge pull request #339 from CCAFRICA/hf-193-signal-surface"
    
    This reverts commit 3a3351eb91e3d752ea77a3d02d4aa375e774ae43, reversing
    changes made to 1277becccb3a7b82f4b34a97fb02590a5e27ab28.
```

### Step 0G.3.3 — Recent file change archaeology — convergence service

```
$ git log origin/main --oneline -- web/src/lib/intelligence/convergence-service.ts
13dc698e Revert "Merge pull request #338 from CCAFRICA/dev"
314e8db0 Revert "Merge pull request #339 from CCAFRICA/hf-193-signal-surface"
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
3a31bdea HF-191 Phase B: Convergence reads and validates plan agent seeds
fc6422fe OB-191: Convergence Pass 4 — calculationIntent metrics + scope_aggregate
c6f13105 OB-185 Phase 2: Fix build — use natural_language_query task, handle response parsing
c19a042c OB-185 Phase 1: AI semantic derivation — Pass 4 implementation
dea9df9a HF-115 Phase 3: Apply scale correction + classification signal capture
7996bb2a HF-115 Phase 2: Cross-component plausibility check + scale anomaly detection
934d7b26 HF-115 Phase 1: Value distribution profiling with scale inference
```

The most recent commits affecting `convergence-service.ts` are the two revert commits (`13dc698e`, `314e8db0`). After those reverts, the file has not been modified.

**Excerpt from the HF-191 revert (`13dc698e`) effect on `convergence-service.ts`:**

```
$ git show 13dc698e -- web/src/lib/intelligence/convergence-service.ts | head -50
[...]
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index 36405e7c..852e5d2e 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -156,93 +156,6 @@ export async function convergeBindings(
     return { derivations, matchReport, signals, gaps, componentBindings };
   }

-  // ── Decision 147: Plan Intelligence Forward — seed derivation consumption ──
-  const planAgentSeeds = (
-    (ruleSet.input_bindings as Record<string, unknown>)?.plan_agent_seeds ?? []
-  ) as Array<{
-    metric: string;
-    operation: string;
-    source_field?: string;
-    [...]
```

The revert removed 93 lines of seeds-consumption logic from `convergence-service.ts`. Combined with the HF-193 revert (which would have removed the signal-surface bridge code), the net state is: no seeds, no signal-surface in `convergence-service.ts`.

### Step 0G.3.4 — Migration file scan for signal-flow infrastructure

```
$ grep -rln "metric_comprehension\|agent_activity\|comprehension" \
    web/supabase/migrations/ supabase/migrations/
(empty result)

$ ls -la web/supabase/migrations/ | grep "2026.*04"
-rw-r--r--   1 AndrewAfrica  staff   1487 Apr 26 19:38 20260320_hf149_platform_events_tenant_nullable.sql
```

No migration in `web/supabase/migrations/` references `metric_comprehension`, `agent_activity`, or `comprehension`. The only April-dated file is a re-touched March-20 migration (timestamp on file, not filename — touched April 26 19:38 by CLN-001). No signal-surface infrastructure migration exists on `main`.

### Step 0G.3.5 — HF-193-A and HF-193-B status

```
$ git log --all --oneline --grep="HF-193-A\|hf_193_a\|HF-193 Phase"
[truncated; see partial output below]
445fcb00 HF-193 Phase 4: completion report
e76c3e27 HF-193 Phase 3: BCL post-cutover path verified; seeds JSONB purged from 4 rule_sets
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
30e79eeb HF-193 Phase 1: persistSignal accepts A2 columns (ruleSetId, metricName, componentIndex)
8fae55e9 HF-193 Gate B preflight: Decision 30 v1 violation investigation directive
3c07a126 HF-193: design artifact + Gate A directive
37111ab7 Revert "HF-193-A Phase 2.2b: bridge return-shape extension (+ l2ComprehensionSignals, SignalWriteSpec, BridgeOutput)"
3c628702 HF-193-A Phase 2.2b: bridge return-shape extension (+ l2ComprehensionSignals, SignalWriteSpec, BridgeOutput)
c8c9a655 HF-193-A Phase 2.2a refinement: completion report amendment (Option X refined body + re-verification PASS)
[+ multiple HF-193-A Phase 2.2a refinement commits and HF-193-A Phase 1.x commits]
```

HF-193-A had numerous internal-iteration commits during development (multiple Phase 2.2a refinements, a Phase 2.2b that was reverted internally, etc.). All of these landed in PR #339, which was then reverted by PR #342.

**Codebase signal_type literal check:**

```
$ grep -rln "signal_type.*metric_comprehension\|signal_type.*agent_activity" \
    web/src/ | grep -v "node_modules\|.next"
(empty result)

$ grep -rln "metric_comprehension\|agent_activity" web/src/ | grep -v "node_modules\|.next"
(empty result)
```

Zero references to either signal type on `origin/main` substrate. Consistent with PR #339 having been reverted.

### Step 0G.3.6 — Landing state determination

Factual summary based on Steps 0G.3.1-0G.3.5:

- **HF-193-A status on `origin/main`:** **MERGED THEN REVERTED.** Originally merged via PR #339 (commit `3a3351eb`, 2026-04-25 or earlier), reverted via PR #342 (commit `be2e5321`, 2026-04-26 16:28:16 PDT) which contained `314e8db0 Revert "Merge pull request #339..."`. HF-193-A's signal-surface infrastructure (`metric_comprehension` writes, A2 typed columns wiring) is NOT live on `main`.
- **HF-193-B status on `origin/main`:** No HF-193-B commits surface in the search. The directive notes HF-193 was split into A (Phases 0-5, infrastructure) and B (Phases 6-10, atomic cutover); the `git log` shows only HF-193 Phase 1, 2, 3, 4 commits and HF-193-A Phase 1.x / 2.2a / 2.2b commits. **HF-193-B does not appear in main's history (neither merged nor reverted; never landed).**
- **CLN-001 status on `origin/main`:** **MERGED.** PR #343 merged via commit `6504b7cf`, contents in `16ba3bea`. CLN-001 made repo-housekeeping changes only — it did NOT remove plan_agent_seeds source code. The seeds source is absent on `main` because PR #338 (which introduced seeds) was reverted by `13dc698e`.
- **The branch `hf-193-signal-surface`:** EXISTS at `origin/hf-193-signal-surface`. It is the source branch of both PR #339 (signal-surface introduction, merged then reverted) AND PR #340 (HF-194 cherry-pick, still merged). The branch was reused for the HF-194 cherry-pick after PR #339 was reverted.
- **Plan-comprehension signal types present in `classification_signals`:** From Phase 0D.5 — confirmed absent. No row has `signal_type` containing `comprehension` or starting with `agent_activity:`. Consistent with HF-193-A being reverted.
- **`plan_agent_seeds` codebase references:** From Phase 0D.6 — confirmed zero. Consistent with PR #338 (HF-191) being reverted.

**Net `main` substrate state for the seeds/signal-surface flow:**

The substrate at `origin/main` HEAD `6bc005e6...` represents the **pre-HF-191 baseline** (no seeds, no signal-surface) PLUS HF-194 (field_identities, cherry-picked via PR #340) PLUS DIAG-024 (read-only diagnostic, PR #344) PLUS CLN-001 (repo housekeeping, PR #343).

The two things Phase 0 noted as seemingly contradictory (V-001 absence + Decision 153 absence) are not contradictory — both flow from a single explicit revert of both HF-191 and HF-193. Neither HF-193 nor HF-191 exists on this substrate; both were explicitly reverted by PR #342 ("CLT-197: revert PRs #338 (HF-191 seeds) and #339 (HF-193 partial eradication)").

---

## Section 0G.4 — Rule_Set Selection Logic + Active-Duplicate Behavior (Gap 4, hard) + Concordance Counter Consumers (Gap 7, soft)

### Step 0G.4.1 — Rule_set selection logic in run/route.ts

```
$ grep -n "rule_sets\|ruleSet\|rule_set_id" web/src/app/api/calculation/run/route.ts | head -10
9: * Body: { tenantId, periodId, ruleSetId }
63:  const { tenantId, periodId, ruleSetId } = body;
65:  if (!tenantId || !periodId || !ruleSetId) {
67:      { error: 'Missing required fields: tenantId, periodId, ruleSetId' },
76:  addLog(`Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}`);
79:  const { data: ruleSet, error: rsErr } = await supabase
80:    .from('rule_sets')
82:    .eq('id', ruleSetId)
85:  if (rsErr || !ruleSet) {
```

**Verbatim selection block (lines 79-89):**

```ts
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, population_config, metadata')
    .eq('id', ruleSetId)
    .single();

  if (rsErr || !ruleSet) {
    return NextResponse.json(
      { error: `Rule set not found: ${rsErr?.message}`, log },
      { status: 404 }
    );
```

**Selection logic factually stated:**

The route does NOT select a rule_set by status, name, recency, or any other criteria. It accepts a **specific `ruleSetId`** in the request body (line 63) and queries `rule_sets` with `.eq('id', ruleSetId)` (line 82). The CALLER decides which rule_set to calculate against. With multiple active rule_sets per tenant, the caller must supply one specific id.

### Step 0G.4.2 — Rule_set selection in upstream services

**API endpoints that read `rule_sets`:**

```
$ grep -rn "from('rule_sets')\|from(\"rule_sets\")" web/src/ --include="*.ts" \
    | grep -v "node_modules\|.next" | head -25
web/src/app/api/reconciliation/analyze/route.ts:92
web/src/app/api/periods/detect/route.ts:79
web/src/app/api/rule-sets/update-cadence/route.ts:26, 41
web/src/app/api/intelligence/wire/route.ts:72, 80, 215, 366, 389
web/src/app/api/intelligence/converge/route.ts:38, 54, 78
web/src/app/api/plan/import/route.ts:98, 110, 118
web/src/app/api/calculation/run/route.ts:80, 154, 160, 198
web/src/app/api/platform/observatory/route.ts:640
web/src/app/api/import/sci/execute-bulk/route.ts:574, 716, 850, 898
web/src/app/api/import/commit/route.ts:882
web/src/app/api/plan-readiness/route.ts:28
```

**The user-facing selection path is `/api/plan-readiness` (the calculate page's plan list source), lines 27-32:**

```ts
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings, status')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'draft'])
    .order('status', { ascending: true });
```

It returns ALL rule_sets with `status IN ('active', 'draft')` for the tenant, sorted only by status (active first, then draft). With 2 active rule_sets per tenant, BOTH are returned. The endpoint does NOT deduplicate by name.

**The UI surfaces these as `PlanCard` components on `web/src/app/operate/calculate/page.tsx`. Each card shows a single rule_set; user clicks to calculate. The fetch payload (from `web/src/components/calculate/PlanCard.tsx:82-90`):**

```ts
      const response = await fetch('/api/calculation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          periodId,
          ruleSetId: plan.planId,
        }),
      });
```

The user picks a card; the card's `plan.planId` becomes the `ruleSetId` in the request. With 2 identically-named active rule_sets, the user sees TWO IDENTICAL CARDS and chooses one.

### Step 0G.4.3 — DB query: active rule_sets per tenant ordered by created_at DESC

Executed via `web/scripts/aud004-phase0g4-ruleset.ts` (supabase-js client):

```
Active rule_sets per tenant (ordered tenant_id, created_at DESC):

  tenant=b1c2d3e4-aaaa-bbbb-cccc-111111111111 (BCL)
  id=f7b82b93-b2f6-44c6-8a20-317eec182ce7
  name="Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026"
  status=active v1
  created_at=2026-04-27T00:39:32.659944+00:00
  updated_at=2026-04-27T00:42:25.726084+00:00

  tenant=b1c2d3e4-aaaa-bbbb-cccc-111111111111 (BCL)
  id=26cb1efd-b949-47c8-a7a8-d3b56eb3c3b7
  name="Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026"
  status=active v1
  created_at=2026-04-27T00:38:33.193184+00:00
  updated_at=2026-04-27T00:42:02.85362+00:00

  tenant=e44bbcb1-2710-4880-8c7d-a1bd902720b7 (CRP / Cascade)
  id=8cea7486-7304-419e-84fa-dc00b9ef4b04
  name="Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026"
  status=active v1
  created_at=2026-04-26T23:40:09.948975+00:00
  updated_at=2026-04-27T00:31:07.450342+00:00

  tenant=e44bbcb1-2710-4880-8c7d-a1bd902720b7 (CRP / Cascade)
  id=1591f450-c226-4173-adfe-d63b8c19eec3
  name="Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026"
  status=active v1
  created_at=2026-04-26T23:39:09.73493+00:00
  updated_at=2026-04-27T00:30:40.931453+00:00
```

**Per tenant, both active rule_sets share status, version, and name. They differ only in `id`, `created_at`, and `updated_at`. There is no winner-by-default rule in the route logic — the request must pass a specific `ruleSetId`. If the UI sorts by `created_at` (or any consistent default) the most recent one likely wins for an interactive user, but the route itself does not impose this.**

### Step 0G.4.4 — Concordance counter consumers

```
$ grep -rn "intentMatchCount\|intentMismatchCount" web/src/ --include="*.ts" \
    | grep -v "node_modules\|.next"
web/src/app/api/calculation/run/route.ts:1172:  let intentMatchCount = 0;
web/src/app/api/calculation/run/route.ts:1173:  let intentMismatchCount = 0;
web/src/app/api/calculation/run/route.ts:1714:      intentMatchCount++;
web/src/app/api/calculation/run/route.ts:1716:      intentMismatchCount++;
web/src/app/api/calculation/run/route.ts:1778:  const concordanceRate = (intentMatchCount / calculationEntityIds.length) * 100;
web/src/app/api/calculation/run/route.ts:1779:  addLog(`OB-76 Dual-path: ${intentMatchCount} match, ${intentMismatchCount} mismatch (${concordanceRate.toFixed(1)}% concordance)`);
web/src/app/api/calculation/run/route.ts:1844:      matchCount: intentMatchCount,
web/src/app/api/calculation/run/route.ts:1845:      mismatchCount: intentMismatchCount,
web/src/app/api/calculation/run/route.ts:1931:          matchCount: intentMatchCount,
web/src/app/api/calculation/run/route.ts:1932:          mismatchCount: intentMismatchCount,
```

**Counter write sites (Phase 0F.3 cross-reference):**
- Line 1714: `intentMatchCount++` (when `entityMatch` is true at line 1713)
- Line 1716: `intentMismatchCount++` (when not matched)

Per Phase 0F.3, `entityMatch = Math.abs(legacyTotal - intentTotal) < 0.01` (line 1712).

**Counter read sites (4 read sites):**

1. **Line 1778-1779:** `addLog` log message and console output:

```ts
const concordanceRate = (intentMatchCount / calculationEntityIds.length) * 100;
addLog(`OB-76 Dual-path: ${intentMatchCount} match, ${intentMismatchCount} mismatch (${concordanceRate.toFixed(1)}% concordance)`);
```

2. **Lines 1840-1862:** `persistSignal` to write a `training:dual_path_concordance` row to `classification_signals`:

```ts
  // ── OB-77: Training signal — dual-path concordance (fire-and-forget) ──
  persistSignal({
    tenantId,
    signalType: 'training:dual_path_concordance',
    signalValue: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      entityCount: calculationEntityIds.length,
      componentCount: defaultComponents.length,
      intentsTransformed: componentIntents.length,
      totalPayout: grandTotal,
      ruleSetId,
      periodId,
    },
    confidence: concordanceRate / 100,
    source: 'ai_prediction',
    context: { ruleSetName: ruleSet.name, trigger: 'calculation_run' },
  }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(err => {
    console.warn('[CalcAPI] Training signal persist failed (non-blocking):', err instanceof Error ? err.message : 'unknown');
  });
```

3. **Lines 1931-1933:** included in the API response body's `intentLayer` object:

```ts
        intentLayer: {
          matchCount: intentMatchCount,
          mismatchCount: intentMismatchCount,
          concordance: ((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1) + '%',
          intentsTransformed: componentIntents.length,
        },
```

**Consumers of the `dual_path_concordance` signal in the codebase:**

```
$ grep -rn "dual_path_concordance\|training:dual_path" web/src/ --include="*.ts" \
    | grep -v "node_modules\|.next"
web/src/app/api/calculation/run/route.ts:1842:    signalType: 'training:dual_path_concordance',
```

**Single match — the write site only.** No code in the codebase reads the `training:dual_path_concordance` signal type by name. Per Phase 0D.4 evidence, the DB has 2 rows of this signal type — they are persisted but unread.

**Counter behavior summary (factual, no interpretation):**

The counters are written incrementally during the entity loop at lines 1714/1716 based on `Math.abs(legacyTotal - intentTotal) < 0.01`. They are read in three places:
1. Logged via `addLog` (visible to the API caller in the response's `log` array, and to server stdout).
2. Embedded in a `training:dual_path_concordance` signal row written to `classification_signals`.
3. Embedded in the success-response body's `intentLayer` object.

**The counters do NOT gate any decision in the route.** No `if (intentMismatchCount > 0)` branch exists. Per Phase 0F.3 (line 1709), `entityTotal = intentTotal` is set unconditionally — the legacy total is preserved only for comparison and reporting. No alert is emitted, no signal triggers a different code path, no UI surface consumes the signal.

---

## Section 0G.5 — Helper Function Shape Inventory (Gap 5, soft)

### Step 0G.5.1 — `resolveValue` and `resolveSource`

```
$ grep -n "function resolveValue\|function resolveSource\|export.*resolveValue\|export.*resolveSource" \
    web/src/lib/calculation/intent-executor.ts
61:function resolveSource(
146:function resolveValue(
```

**`resolveSource` body verbatim (lines 61-140):**

```ts
function resolveSource(
  src: IntentSource,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  switch (src.source) {
    case 'metric': {
      const field = src.sourceSpec.field;
      // Strip "metric:" prefix if present
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      const raw = data.metrics[key] ?? 0;
      inputLog[field] = { source: 'metric', rawValue: data.metrics[key], resolvedValue: raw };
      return toDecimal(raw);
    }
    case 'ratio': {
      const numKey = src.sourceSpec.numerator.startsWith('metric:')
        ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
      const denKey = src.sourceSpec.denominator.startsWith('metric:')
        ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
      const num = toDecimal(data.metrics[numKey] ?? 0);
      const den = toDecimal(data.metrics[denKey] ?? 0);
      const val = den.isZero() ? ZERO : num.div(den);
      inputLog[`ratio(${numKey}/${denKey})`] = {
        source: 'ratio',
        rawValue: { numerator: toNumber(num), denominator: toNumber(den) },
        resolvedValue: toNumber(val),
      };
      return val;
    }
    case 'aggregate': {
      const field = src.sourceSpec.field;
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      if (src.sourceSpec.scope === 'group' && data.groupMetrics) {
        const raw = data.groupMetrics[key] ?? 0;
        inputLog[`aggregate:group:${key}`] = { source: 'aggregate:group', rawValue: raw, resolvedValue: raw };
        return toDecimal(raw);
      }
      const raw = data.metrics[key] ?? 0;
      inputLog[`aggregate:${src.sourceSpec.scope}:${key}`] = {
        source: `aggregate:${src.sourceSpec.scope}`,
        rawValue: raw,
        resolvedValue: raw,
      };
      return toDecimal(raw);
    }
    case 'constant': {
      inputLog[`constant:${src.value}`] = { source: 'constant', rawValue: src.value, resolvedValue: src.value };
      return toDecimal(src.value);
    }
    case 'entity_attribute': {
      const attr = src.sourceSpec.attribute;
      const raw = data.attributes[attr];
      const val = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw) || 0 : 0);
      inputLog[`attr:${attr}`] = { source: 'entity_attribute', rawValue: raw, resolvedValue: val };
      return toDecimal(val);
    }
    case 'prior_component': {
      const idx = src.sourceSpec.componentIndex;
      const val = data.priorResults?.[idx] ?? 0;
      inputLog[`prior:${idx}`] = { source: 'prior_component', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Cross-data count — reads pre-computed count/sum from crossDataCounts
    case 'cross_data': {
      const { dataType, field, aggregation } = src.sourceSpec;
      const key = field ? `${dataType}:${aggregation}:${field}` : `${dataType}:${aggregation}`;
      const val = data.crossDataCounts?.[key] ?? 0;
      inputLog[`cross_data:${key}`] = { source: 'cross_data', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Scope aggregate — reads pre-computed hierarchical aggregate from scopeAggregates
    case 'scope_aggregate': {
      const { field, scope, aggregation } = src.sourceSpec;
      const key = `${scope}:${field}:${aggregation}`;
      const val = data.scopeAggregates?.[key] ?? 0;
      inputLog[`scope_aggregate:${key}`] = { source: 'scope_aggregate', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
  }
}
```

**Recognized cases:**
- `'metric'` — line 67
- `'ratio'` — line 75
- `'aggregate'` — line 90
- `'constant'` — line 106
- `'entity_attribute'` — line 110
- `'prior_component'` — line 117
- `'cross_data'` — line 124
- `'scope_aggregate'` — line 132

**Default branch:** **NO `default:` keyword.** The switch covers exactly the 8 string literals above. Function declares return type `Decimal`. With no fall-through return after the switch, if `src.source` is none of the 8, the function reaches the closing brace at line 140 and returns `undefined`. TypeScript exhaustiveness on the discriminated union `IntentSource` (8 members) prevents this at compile-time only.

**`op.<field>` / `src.<field>` accesses:**
- Every case reads `src.sourceSpec.<field>` for fields named in the discriminated union members (`field`, `numerator`, `denominator`, `scope`, `aggregation`, `attribute`, `componentIndex`, `dataType`).
- `'constant'` reads `src.value` directly (no sourceSpec).
- All cases write to `inputLog[<key>]` and return a `Decimal` via `toDecimal()`.

**Recursive calls to `executeOperation`:** None inside `resolveSource`. (Recursion happens in `resolveValue`.)

**`resolveValue` body verbatim (lines 146-158):**

```ts
function resolveValue(
  sourceOrOp: IntentSource | IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  if (isIntentOperation(sourceOrOp)) {
    // Recursive: execute the nested operation to get a value
    return executeOperation(sourceOrOp, data, inputLog, trace);
  }
  // Existing: resolve from entity data
  return resolveSource(sourceOrOp, data, inputLog);
}
```

**Branch behavior:**
- If `sourceOrOp` is an `IntentOperation` (per `isIntentOperation` predicate), calls `executeOperation` recursively.
- Otherwise, calls `resolveSource`.
- No default branch — the type is a union of `IntentSource | IntentOperation`, and `isIntentOperation` discriminates them.

If `executeOperation` returns `undefined` (per Phase 0B Boundary 6 / Phase 0F.4), `resolveValue` returns `undefined` — and any caller using arithmetic on the result throws.

### Step 0G.5.2 — `findBoundaryIndex`

```
$ grep -n "function findBoundaryIndex" web/src/lib/calculation/intent-executor.ts
165:export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
```

**Function body verbatim (lines 165-191):**

```ts
export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const minOk = b.min === null || (b.minInclusive !== false ? value >= b.min : value > b.min);

    // OB-169: Handle .999 approximation in AI-extracted boundaries.
    // When maxInclusive is true and max has a fractional part within 0.01
    // of the next integer (e.g., 79.999), the AI meant the boundary to be
    // exclusive at the ceiling value. Snap to ceiling and use strict less-than.
    let maxOk: boolean;
    if (b.max === null) {
      maxOk = true;
    } else {
      let effectiveMax = b.max;
      let effectiveInclusive = b.maxInclusive === true;
      const frac = effectiveMax % 1;
      if (frac > 0 && (1 - frac) < 0.01 && effectiveInclusive) {
        effectiveMax = Math.ceil(effectiveMax);
        effectiveInclusive = false;
      }
      maxOk = effectiveInclusive ? value <= effectiveMax : value < effectiveMax;
    }

    if (minOk && maxOk) return i;
  }
  return -1;
}
```

**Inputs:**
- `boundaries: Boundary[]` — array of `Boundary` (each with `min: number | null`, `max: number | null`, `minInclusive?: boolean`, `maxInclusive?: boolean` per `intent-types.ts:41-46`).
- `value: number` — native number for comparison.

**Return:** `number` — the index of the matching boundary, or `-1` if no boundary matches.

**Behavior:** First-match-wins iteration. OB-169 quirk: when `maxInclusive === true` and `max` has a fractional part within 0.01 of the next integer (e.g., `79.999`), snap to `Math.ceil(max)` and treat as exclusive (`< 80` instead of `<= 79.999`).

### Step 0G.5.3 — `applyModifiers`

```
$ grep -n "function applyModifiers" web/src/lib/calculation/intent-executor.ts
509:function applyModifiers(
```

**Function body verbatim (lines 509-547):**

```ts
function applyModifiers(
  value: Decimal,
  modifiers: IntentModifier[],
  data: EntityData,
  modifierLog: Array<{ modifier: string; before: number; after: number }>
): Decimal {
  let result = value;

  for (const mod of modifiers) {
    const before = toNumber(result);

    switch (mod.modifier) {
      case 'cap': {
        const cap = toDecimal(mod.maxValue);
        result = result.gt(cap) ? cap : result;
        break;
      }
      case 'floor': {
        const floor = toDecimal(mod.minValue);
        result = result.lt(floor) ? floor : result;
        break;
      }
      case 'proration': {
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const num = resolveSource(mod.numerator, data, inputLog);
        const den = resolveSource(mod.denominator, data, inputLog);
        result = den.isZero() ? ZERO : result.mul(num.div(den));
        break;
      }
      case 'temporal_adjustment':
        // Temporal adjustment requires historical data — not applied in single-period execution
        break;
    }

    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
  }

  return result;
}
```

**Recognized cases:**
- `'cap'` — line 521 (reads `mod.maxValue`)
- `'floor'` — line 526 (reads `mod.minValue`)
- `'proration'` — line 531 (reads `mod.numerator`, `mod.denominator`)
- `'temporal_adjustment'` — line 538 (no-op; reads nothing)

**Default branch:** **NO `default:` keyword.** Per `IntentModifier` discriminated union (`intent-types.ts:182-186`), the four members above are the entire union. If `mod.modifier` is none of them, no case fires and `result` is unchanged for that iteration.

**Behavior on `value === undefined`:** If the input `value` parameter is `undefined` (per a fall-through `executeOperation` per Phase 0F.4), then:
- Line 518 `toNumber(result)` calls `.toNumber()` on `undefined` → TypeError.

So `applyModifiers(undefined, ...)` throws on the first iteration's `before` calculation, IF `modifiers` is non-empty. If `modifiers` is empty (the for loop body never runs), the function returns `undefined` without throwing.

**Modifier shape required:**
- `IntentModifier` discriminated union per `intent-types.ts:182-186`:
  - `{ modifier: 'cap'; maxValue: number; scope: 'per_period' | 'per_entity' | 'total' }`
  - `{ modifier: 'floor'; minValue: number; scope: 'per_period' | 'per_entity' | 'total' }`
  - `{ modifier: 'proration'; numerator: IntentSource; denominator: IntentSource }`
  - `{ modifier: 'temporal_adjustment'; lookbackPeriods: number; triggerCondition: IntentSource; adjustmentType: 'full_reversal' | 'partial' | 'prorated' }`

The `scope` field (cap/floor) is declared in the type but not read by the implementation (lines 522-528 only reference `mod.maxValue` / `mod.minValue`).

### Step 0G.5.4 — `IntentOperation` and `IntentSource` discriminated unions

```
$ grep -rn "type IntentOperation\|interface IntentOperation\|type IntentSource\|interface IntentSource" \
    web/src/ --include="*.ts" | grep -v "node_modules\|.next"
web/src/lib/calculation/intent-types.ts:15:export type IntentSource =
web/src/lib/calculation/intent-types.ts:52:export type IntentOperation =
```

**`IntentSource` — 8 variants (verbatim, intent-types.ts:15-33):**

```ts
export type IntentSource =
  | { source: 'metric'; sourceSpec: { field: string } }
  | { source: 'ratio'; sourceSpec: { numerator: string; denominator: string } }
  | { source: 'aggregate'; sourceSpec: { field: string; scope: 'entity' | 'group' | 'global'; aggregation: AggregationType } }
  | { source: 'constant'; value: number }
  | { source: 'entity_attribute'; sourceSpec: { attribute: string } }
  | { source: 'prior_component'; sourceSpec: { componentIndex: number } }
  // OB-181: Cross-plan data count — counts/sums committed_data rows matching criteria
  | { source: 'cross_data'; sourceSpec: {
      dataType: string;     // structural filter on committed_data.data_type (e.g., 'equipment_sales')
      field?: string;       // field to aggregate (for sum). If absent, counts rows.
      aggregation: 'count' | 'sum';
    }}
  // OB-181: Hierarchical aggregate — sums a metric across all entities in scope
  | { source: 'scope_aggregate'; sourceSpec: {
      field: string;        // metric field to aggregate
      scope: 'district' | 'region';  // hierarchy level
      aggregation: AggregationType;
    }};
```

8 discriminator strings: `metric`, `ratio`, `aggregate`, `constant`, `entity_attribute`, `prior_component`, `cross_data`, `scope_aggregate`. **Match: every IntentSource variant has a corresponding `case` in `resolveSource` (Step 0G.5.1).**

**`IntentOperation` — 11 variants (verbatim, intent-types.ts:52-63):**

```ts
export type IntentOperation =
  | BoundedLookup1D
  | BoundedLookup2D
  | ScalarMultiply
  | ConditionalGate
  | AggregateOp
  | RatioOp
  | ConstantOp
  | WeightedBlendOp
  | TemporalWindowOp
  | LinearFunctionOp
  | PiecewiseLinearOp;
```

The `operation` discriminator strings (one per interface):
- `BoundedLookup1D.operation: 'bounded_lookup_1d'` — line 67
- `BoundedLookup2D.operation: 'bounded_lookup_2d'` — line 80
- `ScalarMultiply.operation: 'scalar_multiply'` — line 93
- `ConditionalGate.operation: 'conditional_gate'` — line 100
- `AggregateOp.operation: 'aggregate'` — line 112
- `RatioOp.operation: 'ratio'` — line 118
- `ConstantOp.operation: 'constant'` — line 126
- `WeightedBlendOp.operation: 'weighted_blend'` — line 132
- `TemporalWindowOp.operation: 'temporal_window'` — line 142
- `LinearFunctionOp.operation: 'linear_function'` — line 153
- `PiecewiseLinearOp.operation: 'piecewise_linear'` — line 161

**Match against executor switch (Phase 0A Boundary 6):** All 11 union members have a corresponding `case` in `executeOperation` (intent-executor.ts:438-450). **Compile-time exhaustive.**

**`scope_aggregate` divergence:** `scope_aggregate` is a member of `IntentSource` (line 29 — a value source), NOT `IntentOperation`. The plan-agent prompt's example at anthropic-adapter.ts:493 (per Phase 0A Boundary 1) writes `"operation": "scope_aggregate"` — a top-level operation discriminator that does NOT exist in the `IntentOperation` union. This is consistent with Phase 0A Boundary 6's finding: `scope_aggregate` has no executor case (because it isn't a valid `IntentOperation`).

**Comment-claim divergence:** `intent-types.ts:8` declares the file holds "9 primitive operations". `intent-types.ts:49` declares "The 7 Primitive Operations" as a section header. The actual `IntentOperation` union has 11 members. The doc comments are stale relative to OB-180/181 additions.

### Step 0G.5.5 — `EntityData` shape

```
$ grep -rn "type EntityData\|interface EntityData" web/src/ --include="*.ts" \
    | grep -v "node_modules\|.next"
web/src/lib/calculation/intent-executor.ts:37:export interface EntityData {
```

**Type definition verbatim (intent-executor.ts:37-48):**

```ts
export interface EntityData {
  entityId: string;
  metrics: Record<string, number>;
  attributes: Record<string, string | number | boolean>;
  groupMetrics?: Record<string, number>;
  priorResults?: number[];    // outcomes of previously calculated components
  periodHistory?: number[];   // prior period values for temporal_window (loaded in batch, not per-entity)
  // OB-181: Cross-data counts — pre-computed counts/sums of committed_data by data_type
  crossDataCounts?: Record<string, number>;  // key: "dataType:count" or "dataType:sum:field" → value
  // OB-181: Scope aggregates — pre-computed sums across entities in hierarchical scope
  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
}
```

**Fields (8 total):**

| Field | Type | Optional | Used by which `resolveSource` case |
|---|---|---|---|
| `entityId` | `string` | required | (executeIntent trace, not value resolution) |
| `metrics` | `Record<string, number>` | required | `'metric'`, `'ratio'`, `'aggregate'` (entity scope) |
| `attributes` | `Record<string, string\|number\|boolean>` | required | `'entity_attribute'` |
| `groupMetrics` | `Record<string, number>` | optional | `'aggregate'` (group scope) |
| `priorResults` | `number[]` | optional | `'prior_component'` |
| `periodHistory` | `number[]` | optional | `executeTemporalWindow` (line 366) |
| `crossDataCounts` | `Record<string, number>` | optional | `'cross_data'` |
| `scopeAggregates` | `Record<string, number>` | optional | `'scope_aggregate'` |

The shape passed in by run/route.ts:1674-1682 supplies all 8 (or all 8 minus `groupMetrics`, which the route doesn't populate). The route does populate `priorResults`, `periodHistory`, `crossDataCounts`, and `scopeAggregates`, with `attributes: {}` (empty).

**Note:** `attributes: {}` empty object passed at run/route.ts:1677 means `'entity_attribute'` source resolution always returns `0` (line 113: `data.attributes[attr]` → `undefined`, coerced to `0`). Variant routing at executeIntent:576 (`entityData.attributes[attrSrc.sourceSpec.attribute] ?? ''`) always returns `''` for the same reason — variants will never match by entity attribute on this code path.


