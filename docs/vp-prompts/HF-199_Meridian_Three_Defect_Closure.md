# HF-199 — Meridian Reconciliation: Plan-Tier Extraction + Convergence Binding + Entity Attribute Projection

**Sequence:** HF-199 (next available — HF-196 PR #359, HF-197B PR #360, HF-198 PR #361)
**Type:** Hotfix — Vertical Slice (engine + experience evolve together; one PR)
**Predecessor:** HF-198 PR #361 merged 2026-05-04 (OB-196 six extensions operative)
**Objective (locked):** Meridian reconciles to ground truth. Three defects close together. Reconciliation gate test against three proof tenants verifies platform endurance.
**Repo:** `CCAFRICA/spm-platform` (working dir: `~/spm-platform`)
**Branch:** `hf-199-meridian-three-defect-closure` from `main` HEAD (post HF-198 merge)
**Final step:** `gh pr create --base main --head hf-199-meridian-three-defect-closure`

---

## DEFECTS BEING CLOSED (empirical evidence from Vercel logs 2026-05-04)

### Defect 1 — Plan-tier extraction failure

**Evidence:**
```
[variant senior] 5 components:
[0] Revenue Performance - Senior: no tiers
[1] On-Time Delivery - Senior: no tiers
[2] New Accounts - Senior: no tiers
[3] Safety Record - Senior: no tiers
[4] Fleet Utilization - Senior: no tiers
```
All 10 components recognize `calcMethod.type` (e.g., `bounded_lookup_2d`) but `calcMethod.tiers` is empty. Plan interpreter reads `Plan_Incentivos` sheet but does not populate tier matrices into operative plan config.

**Locus suspected:** `interpretationToPlanConfig` and/or `convertComponent` in `web/src/lib/compensation/ai-plan-interpreter.ts`.

### Defect 2 — Convergence binding misalignment (HF-114)

**Evidence:**
```
[Convergence] HF-114 AI response invalid (keys: hub_route_volume, hub_utilization_rate_capped). Falling back to boundary matching.
[Convergence] HF-112 New Accounts - Senior:actual → Año (boundary fallback, score=0.10)
[Convergence] HF-112 Safety Record - Senior:actual → Capacidad_Total (boundary fallback, score=0.10)
[CONVERGENCE-VALIDATION] Component 2 (New Accounts - Senior): sample=708750, median_peer=1400, ratio=506.3 — BINDING MISALIGNMENT
```
HF-198 E5 read of `comprehension:plan_interpretation` signals is operative, BUT the HF-114 AI prompt construction does not bind to those signals authoritatively. AI hallucinates metric names; boundary fallback produces wrong column bindings (score 0.10).

**Locus suspected:** HF-114 AI prompt construction in `convergence-service.ts`; boundary fallback acceptance threshold.

### Defect 3 — Entity attribute projection failure

**Evidence:**
```
[VARIANT-DIAG] Claudia Cruz Ramírez: materializedState={}
[VARIANT-DIAG] Claudia Cruz Ramírez: metadata.role="NONE"
[VARIANT-DIAG] Claudia Cruz Ramírez: flatDataRows=0, sampleRowKeys=NONE
[VARIANT-DIAG] Claudia Cruz Ramírez: generated tokens=[]
[VARIANT] Claudia Cruz Ramírez: NO MATCH — excluded (disc=0, overlap=0, variants=2, tokens=[])
```
Plantilla rows commit to `committed_data` with `Tipo_Coordinador@0.92 (attribute)` recognized by HC. But `entities.materializedState` is `{}` for every entity. Variant discrimination has no tokens to match. All 79 entities excluded.

**Locus suspected:** Entity resolution / DS-009 3.3 — attribute columns from entity-roster sheet (Plantilla) not projected onto entity records during materialization.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Just act. (Standing Rule 10)

Proceed through phases continuously without architect re-confirmation EXCEPT at named CRITICAL HALT conditions.

---

## CRITICAL HALT CONDITIONS

If any of the following occur, HALT immediately, output the condition verbatim to architect-channel, and await disposition:

1. **PRECONDITION P1 fails** — HF-198 PR #361 not in main (E5/E3/E6 not operative)
2. **PRECONDITION P2 fails** — HF-197B PR #360 not in main (per-sheet cache keying not operative)
3. **PRECONDITION P3 fails** — Primitive registry / signal registry not present at expected paths
4. **PRECONDITION P4 fails** — F-005 invariant violated (non-exempt matches)
5. **PRECONDITION P5 fails** — 38 + 65 baseline tests not green at start
6. **PRECONDITION P6 fails** — Meridian tenant substrate not in expected post-import state for diagnosis
7. Build failure
8. Lint failure introduced by HF-199
9. Test failure introduced by HF-199 (especially in 103-test negative suite from #361)
10. F-005 invariant regresses during HF-199 work
11. Schema migration required (Decision 64 v2 guard — architect dispositions)
12. New table required (substrate-introduction-detected)
13. New signal_type required that doesn't fit registry-driven schema
14. New top-level entity field required on `entities` table beyond `materializedState`
15. Mid-phase scope-was-wrong discovery
16. Korean Test failure introduced by HF-199 (any new hardcoded operation/language literal at dispatch surface)
17. Reconciliation gate fails on BCL or CRP (regression — these worked before HF-199)

---

## STANDING RULES (Section A — Design Principles, NON-NEGOTIABLE)

Per `CC_STANDING_ARCHITECTURE_RULES.md` v2.0:

1. **AI-First, Never Hardcoded.** No hardcoded field names, column patterns, language-specific strings. AI semantic inference; downstream code reads mappings.
2. **Scale by Design, Not Retrofit.** Every decision works at 10x current volume.
3. **Fix Logic, Not Data.** Never provide answer values.
4. **Be the Thermostat, Not the Thermometer.** Act on data; don't just display.
5. **Closed-Loop Learning.** Platform activity generates training signals.
6. **Security, Scale, Performance by Design.** Designed in from the start.
7. **Prove, Don't Describe.** Evidence not claims. LIVE, RENDERED, RUNNING state.
8. **Domain-Agnostic Always.** Works across any domain.
9. **IAP Gate.** Every UI measure scores on Intelligence/Acceleration/Performance.

---

## SECTION B — ARCHITECTURE DECISION GATE (MANDATORY)

**This phase MUST complete and commit BEFORE Phase α implementation.**

### PHASE ADR — Architecture Decision Record

Author and commit `docs/architecture-decisions/HF-199_ADR.md`:

```
ARCHITECTURE DECISION RECORD — HF-199
============================
Problem: Meridian reconciles to MX$0 instead of ground truth. Three defects gate
calculation:
  D1: Plan-tier extraction — calcMethod.tiers empty for all 10 components
  D2: Convergence binding misalignment — HF-114 AI hallucinates metric names;
      boundary fallback produces wrong column bindings (e.g., New Accounts:actual → Año)
  D3: Entity attribute projection — entities.materializedState empty; variant
      discrimination produces tokens=[] for all entities

These three defects are independent code surfaces but must close together for
calc to produce non-zero. D3 gates entity inclusion (no tokens → no qualifying
variant → 0 entities calculated). D1 gates component evaluation (no tiers →
component returns 0). D2 gates correctness (wrong columns bind → wrong values).

Option A: Single-PR vertical slice closing D1 + D2 + D3 atomically with one
  reconciliation gate test verifying all three close together.
  - Scale test: Works at 10x? YES — all three are AI-first / structural fixes
    that scale by O(1) per primitive
  - AI-first: Any hardcoding? NO — Korean Test enforced (no language-specific
    column names; no domain-specific literals)
  - Transport: Data through HTTP bodies? NO — fixes are within engine
  - Atomicity: Clean state on failure? YES — each fix is structural; failure
    of any phase HALTs before next; integration test (reconciliation gate)
    verifies composition

Option B: Three separate HFs sequentially (HF-199 D3, HF-200 D1, HF-201 D2).
  - Scale test: Same answer
  - AI-first: Same answer
  - Transport: Same answer
  - Atomicity: Lower — three intermediate states leave Meridian in $0 state
    until all three ship; no integration verification until last PR; violates
    Vertical Slice Rule (engine + experience evolve together)

Option C: Targeted minimum to get Meridian non-zero (e.g., D3 only — entities
  pass variant; calc produces non-zero even with wrong tier/binding values).
  - Scale test: Demonstrably FAILS — partial fix accepts wrong values; violates
    SR-34 No Bypass; reconciliation gate would fail
  - Coverage: Leaves D1 + D2 unclosed; production calc would produce wrong values

CHOSEN: Option A because (a) Vertical Slice Rule preserves engine + experience
co-evolution; (b) procedural theater minimization (architect direction) requires
single deliverable; (c) the three defects gate Meridian reconciliation jointly;
(d) reconciliation gate test against three proof tenants in same PR proves
platform endurance objective end-to-end.

REJECTED: Option B because Meridian remains in $0 state across three PRs;
intermediate states have no integration verification; SR-34 No Bypass.

REJECTED: Option C because partial fix produces wrong values; SR-34 No Bypass;
reconciliation gate fails by design; doesn't close objective.
```

Commit before Phase α:
```
$ git add docs/architecture-decisions/HF-199_ADR.md
$ git commit -m 'HF-199 ADR: Architecture Decision Record (Option A — single-PR three-defect closure)'
```

---

## ANTI-PATTERN REGISTRY SWEEP (Section C — relevant APs)

Verify zero violations of:
- **AP-1** Send row data as JSON in HTTP bodies → File Storage transport
- **AP-5** Add field names to hardcoded dictionaries → AI semantic inference
- **AP-6** Pattern match on column names in specific languages → AI analyzes data values + context (CRITICAL for D3 — Tipo_Coordinador must NOT be string-matched)
- **AP-7** Hardcode confidence scores → Calculate real confidence
- **AP-8** Create migration without executing → Execute + verify with DB query (HF-199 expects no migrations; HALT #11 if surfaces)
- **AP-9** Report PASS based on file existence → Verify RENDERED/LIVE state
- **AP-13** Assume column names match schema → Query information_schema (FP-49)

---

## EVIDENTIARY DISCIPLINE

Every proof gate criterion in the Completion Report requires PASTED EVIDENCE:
- Code evidence: actual code snippet (grep output, function signature)
- Build evidence: build exit code + relevant output
- Curl evidence: HTTP response code + body
- Korean Test evidence: grep command + output (showing zero hits)
- Reconciliation evidence: calculated values pasted verbatim (architect reconciles)

---

## PHASES

### PHASE 0 — Setup, Substrate Read, Preconditions, Branch

0.1 Working directory + repo:
```
$ pwd
$ git remote -v
$ git status --short
$ git log --oneline origin/main -10
```
PASTE all output. If wrong repo or dirty tree, HALT.

0.2 PRECONDITION P1 — HF-198 PR #361 in main:
```
$ git log origin/main --oneline | grep -E 'HF-198\|#361\|OB-196.*Phase 4\|OB-196.*Phase 5\|OB-196.*Phase 6' | head -10
```
PASTE. If absent, HALT.

0.3 PRECONDITION P2 — HF-197B PR #360 in main:
```
$ git log origin/main --oneline | grep -E 'HF-197B\|#360\|per.sheet' | head -5
```
PASTE. If absent, HALT.

0.4 PRECONDITION P3 — Primitive registry + signal registry present:
```
$ ls -la web/src/lib/calculation/primitive-registry.ts
$ ls -la web/src/lib/intelligence/signal-registry.ts 2>/dev/null || ls -la web/src/lib/calculation/signal-registry.ts 2>/dev/null
```
PASTE. If either absent, HALT.

0.5 PRECONDITION P4 — F-005 invariant holds:
```
$ grep -rn "'matrix_lookup'\|'tier_lookup'\|'tiered_lookup'\|'flat_percentage'\|'conditional_percentage'" web/src/ --include='*.ts' --include='*.tsx' 2>/dev/null
```
PASTE. Classify each match. If non-exempt match, HALT.

0.6 PRECONDITION P5 — 103 tests baseline green:
```
$ cd web && npm test 2>&1 | tail -30
```
PASTE. All 103 tests must pass at baseline.

0.7 PRECONDITION P6 — Meridian substrate accessible:
Author `web/scripts/diag-hf-199-meridian-substrate.ts`:
- Service-role client
- Query: count Plantilla committed_data rows for tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- Query: count entities for tenant
- Query: sample one entity, show `materializedState` keys
- Query: count rule_sets for tenant; show component count

```
$ cd web && npx tsx scripts/diag-hf-199-meridian-substrate.ts
```
PASTE output. Verify Meridian has Plantilla rows + entities + active rule_set. If absent, HALT.
Delete script after pasting.

0.8 Build + lint clean baseline:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE. Both must succeed.

0.9 Create branch:
```
$ git checkout main
$ git pull origin main
$ git checkout -b hf-199-meridian-three-defect-closure
$ git rev-parse HEAD
$ git rev-parse main
```
PASTE. Branch HEAD === main HEAD (post HF-198 merge).

0.10 Commit prompt to git per Rule 14:
Save this directive as `vp-prompts/HF-199_Meridian_Three_Defect_Closure.md`:
```
$ git add vp-prompts/HF-199_Meridian_Three_Defect_Closure.md
$ git commit -m 'HF-199 0.10: prompt committed to git (Rule 14)'
```

### PHASE ADR — Architecture Decision Record (Section B mandate)

ADR.1 Author `docs/architecture-decisions/HF-199_ADR.md` with content from Section B above (verbatim).

ADR.2 Commit BEFORE proceeding to implementation:
```
$ git add docs/architecture-decisions/HF-199_ADR.md
$ git commit -m 'HF-199 ADR: Architecture Decision Record (Option A — single-PR three-defect closure)'
```

DO NOT proceed to Phase α until this is committed.

### PHASE α — D3: Entity Attribute Projection (highest priority — gates D1+D2 verification)

**Why first:** Without entities passing variant discrimination, calc produces 0 entities and D1+D2 cannot be empirically verified against calc output. D3 unblocks observability.

α.1 Diagnose current path — read entity resolution code:
```
$ wc -l web/src/lib/sci/entity-resolution.ts
$ grep -nE 'materializedState\|attribute\|projectAttribute' web/src/lib/sci/entity-resolution.ts | head -30
$ grep -rnE 'materializedState\s*=' web/src/ --include='*.ts' | head -20
```
PASTE matches.

α.2 Diagnose committed_data Plantilla row shape:
Author `web/scripts/diag-hf-199-plantilla-row.ts`:
- Service-role client
- Query: SELECT row_data, metadata FROM committed_data WHERE tenant_id = '5035b1e8-...' AND data_type = 'entity' LIMIT 3
- Print row_data keys + metadata.field_identities for each row

```
$ cd web && npx tsx scripts/diag-hf-199-plantilla-row.ts
```
PASTE output. Verify Plantilla rows have `Tipo_Coordinador` in `row_data` AND `field_identities` carries `Tipo_Coordinador: attribute`.
Delete script after pasting.

α.3 Implement attribute projection (Korean-Test-clean):

The attribute projection MUST be structural — not language-specific. The shape:

For each entity row in Plantilla (data_type='entity'):
- Read `field_identities` from row metadata (HC primacy chain — HF-095/HF-186/HF-196)
- For each column where `field_identities[column].role === 'attribute'`:
  - Project value from `row_data[column]` to `entities.metadata.materializedState[column]`
- Korean Test: column-name agnostic; works for `Tipo_Coordinador` / `Role` / `Position` / `직책` / any language

Implementation site: most likely `web/src/lib/sci/entity-resolution.ts` `materializeEntities()` or DS-009 3.3 surface where entity-id-field is set on committed_data and entities are upserted.

Specifically in entity write path:
```
const attributeProjection = {};
for (const [col, identity] of Object.entries(rowMetadata.field_identities ?? {})) {
  if (identity.role === 'attribute') {
    attributeProjection[col] = rowData[col];
  }
}
const entityMaterializedState = {
  ...existingMaterializedState,
  ...attributeProjection
};
// Upsert into entities.metadata.materializedState
```

NO hardcoded column names. NO language-specific string matching. Iterates `field_identities` only.

α.4 Build + lint + test:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -30
```
PASTE. All 103 baseline tests must remain green.

α.5 Verification probe — author `web/scripts/diag-hf-199-attribute-projection-verify.ts`:
- After running re-import of Meridian, query entities for Meridian tenant
- For each entity, check materializedState keys
- Expected: at least one entity has `Tipo_Coordinador` in materializedState (attribute projection operative)

Run AFTER Phase ε re-import. For now, commit script for later use.

α.6 Commit:
```
$ git add -A
$ git commit -m 'HF-199 α (D3): Entity attribute projection — attribute columns from field_identities project to entities.materializedState'
```

### PHASE β — D1: Plan-Tier Extraction

β.1 Diagnose plan-tier extraction gap:
```
$ grep -nE 'tiers\|tierMatrix\|extractTier\|interpretationToPlanConfig\|convertComponent' web/src/lib/compensation/ai-plan-interpreter.ts | head -40
$ wc -l web/src/lib/compensation/ai-plan-interpreter.ts
```
PASTE.

Read full convertComponent and interpretationToPlanConfig:
```
$ sed -n '<line range for convertComponent>p' web/src/lib/compensation/ai-plan-interpreter.ts
$ sed -n '<line range for interpretationToPlanConfig>p' web/src/lib/compensation/ai-plan-interpreter.ts
```
PASTE.

Identify: what shape is `interpretation.components[].tiers` at AI output? Is it populated by AI or expected to be populated downstream? Where does tier data live in the AI's interpretation response?

β.2 Diagnose AI plan interpretation prompt + response shape:
```
$ grep -nE 'plan_interpretation\|buildPlanPrompt' web/src/lib/ai/providers/anthropic-adapter.ts | head -10
```
PASTE. Read prompt construction and response schema.

Determine:
- Does the AI prompt request tier matrix output per component? (Should YES per AUD-004 v3 §2 E1+E4 round-trip closure)
- If yes — does the response carry tier matrices per component?
- If yes — does `convertComponent` read AI's tier output into `calcMethod.tiers`?

β.3 Implement extraction (Korean-Test-clean):

Three possible defect shapes; CC determines which applies based on β.1+β.2 evidence:

**Shape A: AI prompt doesn't request tier matrices.**
Fix: extend AI prompt to request structured tier output per component, schema-validated against signal-registry's `comprehension:plan_interpretation` signal_data shape.

**Shape B: AI emits tiers but `convertComponent` doesn't read them.**
Fix: `convertComponent` reads `component.tiers` (or equivalent) from AI interpretation; populates `calcMethod.tiers` directly.

**Shape C: AI emits tiers but interpretationToPlanConfig drops them.**
Fix: `interpretationToPlanConfig` propagates tier matrices through the variant→component pipeline.

For all shapes: tier extraction uses structural parsing of AI's structured output. NO hardcoded sheet names. NO regex on cell content. AI's job is to interpret the plan workbook (any language, any layout); platform's job is to consume AI's structured output faithfully.

β.4 Build + lint + test:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -30
```
PASTE.

β.5 Commit:
```
$ git add -A
$ git commit -m 'HF-199 β (D1): Plan-tier extraction — calcMethod.tiers populated from AI plan interpretation per component'
```

### PHASE γ — D2: Convergence Binding via E5 Signals

γ.1 Diagnose HF-114 AI prompt construction:
```
$ wc -l web/src/lib/intelligence/convergence-service.ts
$ grep -nE 'HF-114\|HF-112\|aiColumnMapping\|buildConvergencePrompt' web/src/lib/intelligence/convergence-service.ts | head -20
```
PASTE.

Read full HF-114 prompt construction surface:
```
$ sed -n '<line range>p' web/src/lib/intelligence/convergence-service.ts
```
PASTE.

Identify: does HF-114 AI prompt include `comprehension:plan_interpretation` signal data as authoritative semantic intent? (Per HF-198 E5 read confirmed operative — but the signal data may not be passed to the prompt construction.)

γ.2 Diagnose boundary fallback acceptance:
Read boundary fallback code (where `score=0.10` bindings get accepted).

Identify: what's the threshold? Currently accepts low-confidence wrong bindings; boundary fallback should reject below structural threshold.

γ.3 Implement (Korean-Test-clean):

**Fix C2.A** — HF-114 AI prompt construction:
- Read E5 metric_comprehension signals for active rule_set (already done by HF-198 E5; confirm via `21:16:57.172` log line)
- INJECT signal data into AI prompt as authoritative semantic intent for each metric
- AI prompt explicitly: "given these metric semantic intents and these source columns with HC classifications, produce the binding. The metric_label, semantic_intent, and metric_inputs from comprehension signals are AUTHORITATIVE."
- AI response validation: if AI returns metric labels NOT in registered `comprehension:plan_interpretation` signals, structured failure (UnconvertibleComponentError or equivalent named error)

**Fix C2.B** — Boundary fallback threshold:
- Boundary fallback acceptance threshold raised: minimum structural confidence (suggest 0.50; CC determines exact threshold from existing patterns in codebase)
- Below threshold: structured failure with diagnostic, not silent wrong-column binding

NO hardcoded column names. NO domain-specific literals. AI's job is to bind columns to metrics; platform's job is to constrain AI to registered metrics.

γ.4 Build + lint + test:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -30
```
PASTE.

γ.5 Commit:
```
$ git add -A
$ git commit -m 'HF-199 γ (D2): Convergence binding — HF-114 prompt uses E5 signals authoritatively; boundary fallback structured threshold'
```

### PHASE δ — Reconciliation Gate Test (architect reconciles)

δ.1 Deploy locally:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -10
$ cd web && npm run dev 2>&1 &
```
Wait for localhost:3000 response. PASTE: confirmation localhost responding 200.

δ.2 Re-import Meridian (clean slate not required — substrate state is the test):
Architect performs Meridian re-import via browser per SR-44, OR if local test pattern exists, CC executes via curl with file upload.

δ.3 Trigger calc against Meridian:
```
$ curl -X POST http://localhost:3000/api/calculate/run \
    -H 'Content-Type: application/json' \
    -d '{"tenant_id":"5035b1e8-0754-4527-b7ec-9f93f85e4c79","rule_set_id":"<from re-import>","period_id":"<from re-import>"}'
```
PASTE: HTTP response status, calculation_results aggregate (grand total, per-component subtotals, entity count), Vercel-equivalent local logs from convergence + executor traces.

δ.4 Run Phase α verification probe (attribute projection):
```
$ cd web && npx tsx scripts/diag-hf-199-attribute-projection-verify.ts
```
PASTE: confirms entities have materializedState populated with Tipo_Coordinador for at least one entity.

δ.5 BCL regression test (PRECONDITION verification — BCL must not regress):
Trigger calc against BCL tenant `b1c2d3e4-aaaa-bbbb-cccc-111111111111`:
```
$ curl -X POST http://localhost:3000/api/calculate/run \
    -H 'Content-Type: application/json' \
    -d '{"tenant_id":"b1c2d3e4-aaaa-bbbb-cccc-111111111111","rule_set_id":"<active>","period_id":"<active>"}'
```
PASTE: BCL aggregate. Architect reconciles against $312,033 fixture.
**HALT #17 if BCL regresses.**

δ.6 CRP regression test (if substrate available):
PASTE: CRP aggregate (if CRP substrate exists; otherwise note "CRP substrate not present in localhost; deferred to architect production verification").

δ.7 If reconciliation values diverge from fixtures: PASTE evidence; architect reconciles in architect channel; if regression detected, HALT #17.

δ.8 Commit reconciliation evidence:
```
$ git add -A
$ git commit -m 'HF-199 δ: reconciliation gate test (architect reconciles three proof tenants)'
```

### PHASE η — Completion Report (Rule 25 — FIRST DELIVERABLE BEFORE FINAL BUILD)

η.1 Author `docs/completion-reports/HF-199_Meridian_Three_Defect_Closure_COMPLETION_REPORT.md` with VERBATIM Rule 26 mandatory structure:

```markdown
# HF-199 COMPLETION REPORT — Meridian Three-Defect Closure
## Date
2026-05-04

## Execution Time
<start time> – <end time>

## Predecessor PRs (verified at Phase 0)
| PR | Scope | Status |
|---|---|---|
| #345-#350 | OB-196 Phases 0-3 (E1, E2, E4) | merged |
| #359 | HF-196 platform restoration | merged |
| #360 | HF-197B per-sheet cache keying | merged |
| #361 | HF-198 OB-196 Phases 4-8 (E5, E3, E6) | merged |

## Defects Closed
- D1 — Plan-tier extraction: calcMethod.tiers populated from AI plan interpretation
- D2 — Convergence binding: HF-114 prompt uses E5 signals authoritatively; boundary fallback structured threshold
- D3 — Entity attribute projection: attribute columns from field_identities project to entities.materializedState

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| <SHA> | 0.10 | HF-199 0.10: prompt committed to git (Rule 14) |
| <SHA> | ADR | HF-199 ADR: Architecture Decision Record (Option A) |
| <SHA> | α | HF-199 α (D3): Entity attribute projection |
| <SHA> | β | HF-199 β (D1): Plan-tier extraction |
| <SHA> | γ | HF-199 γ (D2): Convergence binding via E5 signals |
| <SHA> | δ | HF-199 δ: reconciliation gate test |
| <SHA> | η | HF-199 η: completion report (Rule 25 first-deliverable) |
| <SHA> | FINAL_BUILD | HF-199 final build verification appended |

## FILES CREATED
| File | Purpose |
|---|---|
| `vp-prompts/HF-199_Meridian_Three_Defect_Closure.md` | Directive prompt (Rule 14) |
| `docs/architecture-decisions/HF-199_ADR.md` | Architecture Decision Record (Section B) |
| `web/scripts/diag-hf-199-attribute-projection-verify.ts` | D3 verification probe (preserved) |
| `docs/completion-reports/HF-199_Meridian_Three_Defect_Closure_COMPLETION_REPORT.md` | This report |

## FILES MODIFIED
| File | Change |
|---|---|
| `web/src/lib/sci/entity-resolution.ts` | D3: attribute projection from field_identities to materializedState |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | D1: tier extraction into calcMethod.tiers (specific shape per β.3 finding) |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | D1 prompt extension (if applicable per β.3 Shape A) |
| `web/src/lib/intelligence/convergence-service.ts` | D2: HF-114 prompt uses E5 signals authoritatively; boundary fallback threshold |

## PROOF GATES — HARD
| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| P1 | HF-198 PR #361 in main | PASS | <pasted git log> |
| P2 | HF-197B PR #360 in main | PASS | <pasted git log> |
| P3 | Primitive registry + signal registry present | PASS | <pasted ls> |
| P4 | F-005 invariant holds | PASS | <pasted grep> |
| P5 | 103 baseline tests green | PASS | <pasted tail> |
| P6 | Meridian substrate accessible | PASS | <pasted query output> |
| 1 | Phase 0 build clean baseline | PASS | <pasted tail> |
| 2 | Phase ADR committed BEFORE Phase α | PASS | <pasted commit log> |
| 3 | Phase α: attribute projection iterates field_identities (Korean-Test-clean) | PASS | <pasted code with no language-specific literals> |
| 4 | Phase α: build + lint + test pass | PASS | <pasted tails> |
| 5 | Phase β: tier extraction shape determined and implemented | PASS | <pasted shape determination + code> |
| 6 | Phase β: build + lint + test pass | PASS | <pasted tails> |
| 7 | Phase γ: HF-114 prompt uses E5 signals as authoritative semantic intent | PASS | <pasted prompt construction code> |
| 8 | Phase γ: boundary fallback threshold raised to structural minimum | PASS | <pasted threshold code> |
| 9 | Phase γ: build + lint + test pass | PASS | <pasted tails> |
| 10 | Phase δ: localhost:3000 responds 200 | PASS | <pasted curl> |
| 11 | Phase δ: Meridian calc executes; values pasted | PASS | <pasted aggregates and traces> |
| 12 | Phase δ: BCL regression test — values pasted | PASS | <pasted aggregates> |
| 13 | Phase δ: attribute projection verification probe — entities have materializedState populated | PASS | <pasted probe output> |
| 14 | FINAL BUILD: `npm run build` exits 0 | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |
| 15 | FINAL LINT: `npm run lint` exits 0 | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |
| 16 | FINAL TEST: `npm test` exits 0 (103+ tests) | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| S1 | Korean Test (AP-25 / Decision 154): zero hardcoded operation/language literals at three fix sites | PASS | <pasted grep output> |
| S2 | Anti-Pattern Registry: zero violations of AP-1, AP-5, AP-6, AP-7, AP-8, AP-9, AP-13 | PASS | <per-AP evidence> |
| S3 | Scale test: three fixes each scale by O(1) per primitive/attribute/metric | PASS | <reasoning + code citation> |
| S4 | F-005 invariant preserved after HF-199 | PASS | <re-grep at completion> |
| S5 | 103-test negative suite preserved (no regressions) | PASS | <pasted test summary> |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS
- Rule 2 (cache clear after commit): PASS
- Rule 6 (Supabase migrations live + verified): N/A — no migrations (Decision 64 v2 guard preserved)
- Rule 14 (prompt committed to git): PASS — committed at 0.10
- Rule 25 (report before final build): PASS — this report committed before FINAL_BUILD phase
- Rule 26 (mandatory structure): PASS — sections in Rule 26 order
- Rule 27 (paste evidence): PASS — every gate has pasted evidence
- Rule 28 (commit per phase): PASS
- Rule 29 (CC paste last): PASS

## KNOWN ISSUES
- F-010 (LOW, out of structural scope per AUD_004 v3 §2): NOT CLOSED; carry-forward
- A.5.GAP-2 (calculation_results unique constraint): carry-forward; schema-level concern
- N4 comprehension dimension substrate: deferred per AUD_004 v3 §5
- Format polymorphism, domain pack architecture: forward
- Self-correction cycle audit (DS-017 §4.3): flagged carry-forward

## VERIFICATION SCRIPT OUTPUT

### Phase 0.7 Meridian substrate
<paste verbatim script output>

### Phase α.2 Plantilla row diagnostic
<paste verbatim script output>

### Phase δ Reconciliation Gate
<paste verbatim aggregate per tenant + traces>

### Phase α.5 attribute projection verification probe
<paste verbatim output>

### Phase FINAL_BUILD (appended)
<paste verbatim build + lint + test tails>
```

η.2 Commit completion report BEFORE final build per Rule 25:
```
$ git add docs/completion-reports/HF-199_Meridian_Three_Defect_Closure_COMPLETION_REPORT.md
$ git commit -m 'HF-199 η: completion report (Rule 25 first-deliverable, before final build)'
```

### PHASE FINAL_BUILD — Final Build Verification (appended to existing report)

FB.1 Final build verification:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -50
```

FB.2 APPEND tails to existing completion report under "VERIFICATION SCRIPT OUTPUT > Phase FINAL_BUILD" section. Update PROOF GATES — HARD rows 14/15/16.

FB.3 Commit final build evidence:
```
$ git add docs/completion-reports/HF-199_Meridian_Three_Defect_Closure_COMPLETION_REPORT.md
$ git commit -m 'HF-199 FINAL_BUILD: appended final build evidence to completion report'
```

### PHASE θ — Push + PR

θ.1 Push branch:
```
$ git push -u origin hf-199-meridian-three-defect-closure
```

θ.2 Create PR:
```
$ gh pr create --base main --head hf-199-meridian-three-defect-closure \
    --title 'HF-199: Meridian Three-Defect Closure — entity attribute projection + plan-tier extraction + convergence binding' \
    --body "$(cat <<'BODY'
## Summary
Closes three independent code-surface defects gating Meridian reconciliation.
With this PR, Meridian calculates non-zero against ground truth.

D1 — Plan-tier extraction: calcMethod.tiers populated from AI plan interpretation per component
D2 — Convergence binding: HF-114 prompt uses E5 metric_comprehension signals as authoritative; boundary fallback structured threshold
D3 — Entity attribute projection: attribute columns from field_identities project to entities.materializedState

## Predecessor work preserved
HF-196 (#359), HF-197B (#360), HF-198 (#361) all preserved unchanged. OB-196's
six extensions (E1-E6) operative throughout. Per-sheet cache keying preserved.
HC primacy chain preserved.

## Verification
Reconciliation gate test (Decision 95) against three proof tenants. CC reports
calculated values verbatim; architect reconciles in architect channel.

## Out of scope (carry-forward)
- F-010 (LOW, out of structural scope)
- A.5.GAP-2 (calculation_results unique constraint)
- N4 comprehension dimension substrate
- Format polymorphism, domain pack architecture
- Self-correction cycle audit

## Architect actions
- Browser verification: Meridian / BCL / CRP reconciliation
- Production sign-off
- Merge

## Compliance
Rules 1-29 observed. Decisions 64v2/92/122/127/147A/151/152/153/154/155 preserved.
HF-094/095/110/145/186/196/197B/198 chain preserved. F-005 invariant preserved.
Korean Test (AP-25 + Decision 154) — three fixes use structural identification
only; no hardcoded language-specific literals.
BODY
)"
```
PASTE: PR URL.

θ.3 STOP. Output verbatim to architect:
```
HF-199 implementation complete. PR: <URL>.
Reconciliation evidence pasted in completion report Section "VERIFICATION SCRIPT OUTPUT > Phase δ".
Awaiting architect:
(1) Browser reconciliation against three proof tenants (Meridian/BCL/CRP)
(2) Production sign-off
(3) PR merge
```

---

## SECTION F — QUICK CHECKLIST (per Standing Rules; verify before submitting completion report)

```
☐ Architecture Decision committed before implementation? (Phase ADR)
☐ Anti-Pattern Registry checked — zero violations? (Section C sweep)
☐ Scale test: works for 10x current volume? (Soft Gate S3)
☐ AI-first: zero hardcoded field names/patterns added? (Korean Test, Soft Gate S1)
☐ All Supabase migrations executed AND verified with DB query? (N/A — no migrations)
☐ Proof gates verify LIVE/RENDERED state? (Hard Gates 10-13)
☐ Browser console clean on localhost? (Phase δ)
☐ Real data displayed, no placeholders? (Phase δ aggregates)
☐ Single code path? (three independent fixes; no parallel paths introduced)
☐ Atomic operations? (each fix structural)
☐ Preconditions P1-P6 verified at Phase 0? (CC verifies inline)
☐ F-005 invariant preserved? (Soft Gate S4)
☐ 103-test negative suite green at start AND end? (Phase 0.6 + Phase FINAL_BUILD)
☐ Meridian calculates non-zero? (Phase δ — architect reconciles)
☐ BCL does not regress? (Phase δ.5 — architect reconciles; HALT #17 if regresses)
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `docs/completion-reports/HF-199_Meridian_Three_Defect_Closure_COMPLETION_REPORT.md`
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is INCOMPLETE.

---

## OUT OF SCOPE FOR HF-199 (do not touch)

- HF-198 / HF-197B / HF-196 chain (all preserved unchanged)
- E1 / E2 / E3 / E4 / E5 / E6 (all operative; preserved unchanged)
- F-005 invariant (must be preserved; HALT #10 if regresses)
- Schema migrations (Decision 64 v2 guard — HALT #11)
- New tables (substrate-introduction-detected — HALT #12)
- New signal_types (HALT #13)
- New top-level entity fields (HALT #14)
- HC primacy chain code (preserved unchanged)
- Resolver chain code (preserved unchanged)
- Fingerprint flywheel code (preserved unchanged)
- Format polymorphism (forward)
- Domain pack architecture (forward)
- Self-correction cycle audit (carry-forward)
- A.5.GAP-2 (carry-forward)

---

## REPORTING DISCIPLINE

- Every PASS claim has pasted evidence (FP-80 + Rule 27)
- Completion report file exists BEFORE final PR push (Rule 25)
- Reconciliation evidence pasted RAW; CC does not assert PASS/FAIL
- No GT values in CC artifacts (Reconciliation-Channel Separation)
- HALT at seventeen named conditions; otherwise CONTINUOUS
- F-NNN findings referenced verbatim; D1/D2/D3 referenced by these named tags
- Defects closed referred to by D1/D2/D3 throughout

---

END OF DIRECTIVE.
