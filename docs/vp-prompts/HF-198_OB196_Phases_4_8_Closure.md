# HF-198 — OB-196 Closure: Phases 4-8 (E5 / E3 / E6 / Compliance / Final Close)

**Sequence:** HF-198 (next available — HF-196 closed PR #359, HF-197B merged PR #360)
**Type:** Hotfix — Vertical Slice closing OB-196 (engine + experience evolve together; one PR)
**Substrate:** `docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md` (LOCKED 2026-04-27)
**Predecessor:** OB-196 Phases 0-3 — verified merged to main; PRs #345, #346, #347, #348, #349, #350
**Objective (locked):** Close OB-196 by completing Phases 4-8: E5 (plan-agent comprehension as L2 signal), E3 (signal-type read-coupling), E6 (Korean Test verdict + negative tests), Phase 7 (compliance gates), Phase 8 (final completion report + PR). Closes AUD-004 v3 §1 verbatim problem: *"If a new structural primitive appears, the platform still works."*
**Repo:** `CCAFRICA/spm-platform` (working dir: `~/spm-platform`)
**Branch:** `hf-198-ob196-phases-4-through-8-closure` from `main` HEAD
**Final step:** `gh pr create --base main --head hf-198-ob196-phases-4-through-8-closure`

---

## OB-196 STATUS — VERIFIED MERGED TO main

Per architect-channel verified state at session-end of prior OB-196 work (chat `1d94e4bc-8b48-40fc-9f38-d4f803bfd3eb`):

| PR | Phase | Scope | Status |
|---|---|---|---|
| #345 | Phase 0, 1, 1.5 | Substrate sync + ADR + **E1 primitive registry** + import boundary closure | merged |
| #346 | Phase 1.6 | Trial/GPV/landing dead-code sweep + L7 widening capture | merged |
| #347 | Phase 1.6.5 | Calc-side + demo-era wholesale + service-layer + database (disputes table dropped) | merged `f6bea1a8` |
| #348 | Phase 1.7 | Validation/forensics/UI + plan-management wholesale + **F-005 platform-wide closure** | merged `6ead4def` |
| #349 | Phase 2 | **E2 structured failure** on run-calculation.ts + LegacyShapedPlanComponent removal | merged `bad60c79` |
| #350 | Phase 3 | **E4 round-trip closure** verification + structured-failure hardening + 38-test negative suite | merged `7a697dce` |

**Three of six OB-196 extensions are closed:** E1 (primitive registry), E2 (dispatch surface integrity), E4 (round-trip closure).

**F-005 platform-wide closure invariant holds.**

**L7 widening finding closed 2026-04-28** (closure marker at bottom of `docs/audits/AUD_004_L7_FINDING.md`).

**OB-196 completion report `OB-196_COMPLETION_REPORT.md` is structurally complete through Phase 3 with 9 sections.** Future phases (this HF-198) append additively.

**Carry-forward A.5.GAP-2 from Phase 3 audit:** `calculation_results` lacks `(tenant_id, batch_id, entity_id)` unique constraint. Schema-level concern requiring migration. Documented in OB-196 known-issues. **Out of scope for HF-198** (architect dispositions separately if/when needed).

---

## REMAINING OB-196 WORK (HF-198 SCOPE)

| Phase | Extension | Closes | This HF |
|---|---|---|---|
| Phase 4 | **E5** — plan-agent comprehension as L2 signal | F-006 architectural | ✅ |
| Phase 5 | **E3** — signal-type read-coupling structurally partitioned | F-006 + F-011 | ✅ |
| Phase 6 | **E6** — Korean Test verdict + negative tests | Decision 154 closure verification | ✅ |
| Phase 7 | Compliance gates | All HF-198 changes verified against Rules 25-29 + Section A/B/C/F | ✅ |
| Phase 8 | Final completion report + PR | OB-196 merged; HF-198 closes OB-196 | ✅ |

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Just act. (Standing Rule 10)

Proceed through phases continuously without architect re-confirmation EXCEPT at named CRITICAL HALT conditions.

---

## CRITICAL HALT CONDITIONS

If any of the following occur, HALT immediately, output the condition verbatim to architect-channel, and await disposition:

1. **PRECONDITION P1 fails** — E1 primitive-registry not present at expected file path
2. **PRECONDITION P2 fails** — E2 structured failure code not present (UnconvertibleComponentError absent or non-operative)
3. **PRECONDITION P3 fails** — E4 round-trip closure / negative test suite not present
4. **PRECONDITION P4 fails** — F-005 platform-wide closure invariant violated (non-exempt matches found)
5. **PRECONDITION P5 fails** — main HEAD does not contain expected OB-196 + HF-197B merges
6. **PRECONDITION P6 fails** — AUD-004 v3 not present at `docs/audits/`
7. AUD-004 v3 §2 / §5 / §6 references inconsistent with operative codebase
8. Build failure (suggests environment issue, not HF-198 issue)
9. Lint failure introduced by HF-198 (pre-existing OK)
10. Test failure introduced by HF-198 (especially in 38-test negative suite from PR #350)
11. Schema discovery diverges from FP-49 verification
12. Mid-phase scope-was-wrong discovery
13. New table or schema migration becomes required (Decision 64 v2 guard — architect dispositions whether migration is acceptable or refactor needed)
14. New signal_type required that doesn't fit registry-driven schema
15. Reconciliation gate failure on any of the three proof tenants (CC reports raw values; HALT only if calculation throws unrecoverable error)
16. Substrate-introduction-detected (drift from registry-mediated dispatch)
17. F-005 invariant regresses during HF-198 work

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

Author and commit `docs/architecture-decisions/HF-198_ADR.md`:

```
ARCHITECTURE DECISION RECORD — HF-198
============================
Problem: OB-196 has shipped E1, E2, E4 (PRs #345, #349, #350). Three extensions
remain (E5, E3, E6) plus Phase 7 (compliance gates) and Phase 8 (final close).
AUD_004 v3 §1 verbatim problem ("If a new structural primitive appears, the
platform still works") closes when all six extensions operative + Korean Test
verdict produces YES across negative test suite.

Option A: Single-PR vertical slice closing OB-196 Phases 4-8 atomically per
  Decision 153 atomic cutover discipline. Branch from main HEAD (post HF-197B);
  E5 + E3 + E6 + compliance + final close in one PR.
  - Scale test: Works at 10x? YES — E5 reads signal-registry surface (O(1) per
    signal_type); E3 read-coupling validation is registration-time
  - AI-first: Any hardcoding? NO — E5/E3/E6 use registry-derived vocabulary;
    Korean Test enforced
  - Transport: Data through HTTP bodies? NO — signal surface DB-backed
  - Atomicity: Clean state on failure? YES — registration is idempotent;
    structured failure preserved per E2

Option B: Phased PRs per remaining extension (Phase 4 PR, Phase 5 PR, Phase 6
  PR, Phase 7+8 PR).
  - Scale test: Same answer
  - AI-first: Same answer
  - Transport: Same answer
  - Atomicity: Lower — phased PRs leave intermediate states; OB-196 closure
    fragmented; violates Decision 153 atomic cutover for the closure itself

Option C: Verification-only HF (no new code; just confirm OB-196 0-3 reconciles).
  - Scale test: Works for what it verifies; doesn't address E5/E3/E6 absence
  - Coverage: Leaves three extensions unclosed; AUD-004 v3 §1 problem remains
    "answer NO" in part

CHOSEN: Option A because (a) Decision 153 atomic cutover for OB-196 closure
discipline; (b) procedural theater minimization (architect direction) requires
single deliverable; (c) Vertical Slice Rule preserves engine + experience
co-evolution; (d) reconciliation gate test against three proof tenants in same
PR proves the platform endurance objective end-to-end.

REJECTED: Option B because phased delivery fragments OB-196 closure; each
intermediate state has known unclosed extensions; SR-34 No Bypass.

REJECTED: Option C because leaves E5/E3/E6 unclosed; AUD-004 v3 §1 verbatim
problem unsolved; defers the actual structural work.
```

Commit before Phase α:
```
$ git add docs/architecture-decisions/HF-198_ADR.md
$ git commit -m 'HF-198 ADR: Architecture Decision Record (Option A — single-PR closing OB-196 Phases 4-8)'
```

---

## ANTI-PATTERN REGISTRY SWEEP (Section C — relevant APs)

Verify zero violations of:
- **AP-1** Send row data as JSON in HTTP bodies → File Storage transport
- **AP-5** Add field names to hardcoded dictionaries → AI semantic inference
- **AP-6** Pattern match on column names in specific languages → AI analyzes data values + context
- **AP-7** Hardcode confidence scores → Calculate real confidence
- **AP-8** Create migration without executing → Execute + verify with DB query (HF-198 expects no migrations; HALT #13 if surfaces)
- **AP-9** Report PASS based on file existence → Verify RENDERED/LIVE state
- **AP-13** Assume column names match schema → Query information_schema (FP-49)

---

## EVIDENTIARY DISCIPLINE

Every proof gate criterion in the Completion Report requires PASTED EVIDENCE:
- Code evidence: actual code snippet (grep output, function signature)
- Build evidence: build exit code + relevant output
- Curl evidence: HTTP response code + body
- Korean Test evidence: grep command + output (showing zero hits)
- Script evidence: script output

Evidence does NOT mean "this was implemented" or "all labels from plan data" — those are descriptions/claims. Evidence = paste.

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

0.2 Read AUD-004 v3 from repo:
```
$ ls -la docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md
$ wc -l docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md
```
Read in full. Confirm Section 2 E1-E6 named code paths, Section 5 N1-N3 substrate items, Section 9 successor handoff scope.
PASTE: file existence + line count + verbal confirmation of substrate read.

0.3 Read OB-196 completion report (existing through Phase 3):
```
$ find docs -name 'OB-196_COMPLETION_REPORT*' -type f 2>/dev/null
$ ls -la docs/completion-reports/ 2>/dev/null | grep -i ob.196
```
PASTE: file path. HF-198 will append Phases 4-8 to this existing report (or author HF-198 completion report referencing OB-196 closure).

0.4 PRECONDITION P1 — E1 primitive-registry shipped:
```
$ ls -la web/src/lib/calculation/primitive-registry.ts
$ git log --oneline --all -- web/src/lib/calculation/primitive-registry.ts | head -10
```
Expected: file exists. Per OB-196 Phase 1 (PR #345), commit creating primitive-registry.ts is present in history.
PASTE: both outputs. If file absent or no commit history, HALT (P1 fail).

0.5 PRECONDITION P2 — E2 structured failure shipped:
```
$ git log --oneline origin/main --grep='OB-196.*Phase 2\|E2 structured failure\|UnconvertibleComponentError' | head -10
$ grep -rn 'UnconvertibleComponentError\|class.*Error.*Component\|throw new.*UnconvertibleComponentError' web/src --include='*.ts' | head -10
```
Expected: PR #349 commits visible (per OB-196 status table); UnconvertibleComponentError defined and thrown in compensation/AI plan interpreter.
PASTE: both outputs. If absent, HALT (P2 fail).

0.6 PRECONDITION P3 — E4 round-trip closure shipped:
```
$ git log --oneline origin/main --grep='OB-196.*Phase 3\|E4 round-trip\|round.?trip closure' | head -10
$ find web/src -name '*.test.ts' | xargs grep -l 'round.?trip\|negative.suite' 2>/dev/null | head -5
$ find web/src -name '*round*trip*' 2>/dev/null | head -5
```
Expected: PR #350 commits visible; negative test suite (38 tests per OB-196 carry-forward) present.
PASTE: outputs. If absent or test suite missing, HALT (P3 fail).

0.7 PRECONDITION P4 — F-005 platform-wide closure invariant holds:
```
$ grep -rn "'matrix_lookup'\|'tier_lookup'\|'tiered_lookup'\|'flat_percentage'\|'conditional_percentage'" web/src/ --include='*.ts' --include='*.tsx' 2>/dev/null
```
Expected: zero matches OR only audit-trail comments in exempt categories. Per OB-196 Phase 1.7 closure (PR #348), the F-005 invariant holds platform-wide.
PASTE: full output. For each match, classify as audit-trail-exempt or invariant-violation. If non-exempt match found, HALT (P4 fail).

0.8 PRECONDITION P5 — main HEAD contains expected merges:
```
$ git rev-parse origin/main
$ git log origin/main --oneline -20
```
Expected: PR merges visible for #345, #346, #347, #348, #349, #350, #359 (HF-196), #360 (HF-197B). main HEAD is post-HF-197B.
PASTE: outputs. If divergent, HALT (P5 fail).

0.9 PRECONDITION P6 — AUD-004 v3 in repo:
Already verified at 0.2. Confirm file path:
```
$ ls -la docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md
```
If absent, HALT (P6 fail).

0.10 Schema verification (FP-49 / AP-13 guard):
Author `web/scripts/diag-hf-198-schema-verify.ts`:
- Service-role client
- Query `information_schema.columns` for: `classification_signals`, `rule_sets`, `committed_data`, `structural_fingerprints`
- Print column inventory

```
$ cd web && npx tsx scripts/diag-hf-198-schema-verify.ts
```
PASTE: column inventory for all four tables.
If schema diverges from AUD_004 v3 expectations OR from existing primitive-registry / signal-coupling assumptions, HALT.
Delete script after pasting (FP-49 evidence captured; no commit).

0.11 Build clean baseline:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -30
```
PASTE: tails. All must succeed. The 38-test negative suite from PR #350 must pass at baseline.

0.12 Create branch:
```
$ git checkout main
$ git pull origin main
$ git checkout -b hf-198-ob196-phases-4-through-8-closure
$ git rev-parse HEAD
$ git rev-parse main
```
PASTE: confirmation. Branch HEAD === main HEAD.

0.13 Commit this prompt to git per Rule 14:
Save this directive document as `vp-prompts/HF-198_OB196_Phases_4_8_Closure.md`:
```
$ ls vp-prompts/HF-198* 2>/dev/null
$ git add vp-prompts/HF-198_OB196_Phases_4_8_Closure.md
$ git commit -m 'HF-198 0.13: prompt committed to git (Rule 14)'
```

### PHASE ADR — Architecture Decision Record (Section B mandate)

ADR.1 Author `docs/architecture-decisions/HF-198_ADR.md` with Architecture Decision Record content from Section B above (verbatim).

ADR.2 Commit BEFORE proceeding to implementation:
```
$ git add docs/architecture-decisions/HF-198_ADR.md
$ git commit -m 'HF-198 ADR: Architecture Decision Record (Option A — single-PR closing OB-196 Phases 4-8)'
```

DO NOT proceed to Phase α until this is committed.

### PHASE α — E5: Plan-Agent Comprehension as L2 Signal (OB-196 Phase 4)

**Specification per AUD-004 v3 §2 E5:** Any service writing to the signal surface shall read the signal surface before invoking AI semantic derivation. Plan-agent comprehension flows to convergence as Level 2 Comprehension signals; convergence reads before deriving.

**Closes:** F-006 architectural (Pass 4 isolation from plan-agent comprehension).

α.1 Identify plan-agent prompt construction surface:
```
$ wc -l web/src/lib/ai/providers/anthropic-adapter.ts
$ grep -nE 'plan|interpret|comprehension|metric' web/src/lib/ai/providers/anthropic-adapter.ts | head -30
```
PASTE: matches.

α.2 Plan-agent prompt comprehension emission:
At plan-agent prompt construction surface, after AI produces plan interpretation, emit `metric_comprehension` signal per metric:
- `signal_type: 'metric_comprehension'`
- `signal_level: 'L2'`
- `signal_data: { metric_label, metric_op, metric_inputs, semantic_intent, source_evidence }`
- Use existing `persistSignal` (HF-193 schema-half migration extended in OB-196 Phase 4 B.2.0-ext per memory; verify):

```
$ grep -rn 'persistSignal\|writeSignal' web/src/lib/intelligence/ --include='*.ts' | head -10
```
PASTE: signal-write surface inventory.

α.3 Convergence reads `metric_comprehension` before AI derivation:
```
$ wc -l web/src/lib/intelligence/convergence-service.ts
$ grep -nE 'Pass 4|deriveSemantic|aiDerive' web/src/lib/intelligence/convergence-service.ts | head -10
```
PASTE: matches. Read code at Pass 4 line range.

Refactor: Pass 4 reads `metric_comprehension` signals for active rule_set BEFORE constructing AI prompt for column-to-metric mapping. AI prompt includes signal data as authoritative semantic intent. AI prompt output validates against registered metrics — no hallucinated metric names accepted; structured failure (UnconvertibleComponentError or equivalent) on unregistered.

α.4 Build + lint + test verify:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -30
```
PASTE: tails. All must succeed. 38-test negative suite must remain green.

α.5 Commit:
```
$ git add -A
$ git commit -m 'HF-198 α (OB-196 Phase 4): E5 plan-agent comprehension as L2 signal (closes F-006 architectural)'
```

### PHASE β — E3: Signal-Type Read-Coupling (OB-196 Phase 5)

**Specification per AUD-004 v3 §2 E3:** Every signal type written shall have at least one defined reader before next calculation run. Read-coupling structurally derived from signal properties:
- L1 Classification: at least one reader within originating flywheel
- L2 Comprehension: readers within originating flywheel AND cross-flywheel
- L3 Convergence: readers across all three flywheels

**Closes:** F-006 + F-011 (signal write without declared reader).

β.1 Extend primitive registry to include signal_type as registrable primitive class. Each signal_type declaration:
- `identifier` (e.g., `'metric_comprehension'`, `'tier_matrix'`, `'binding_evaluation'`)
- `signal_level`: `'L1' | 'L2' | 'L3'`
- `originating_flywheel`: `'tenant' | 'foundational' | 'domain'`
- `declared_writers`: `string[]`
- `declared_readers`: `string[]`
- Validation at registration: ≥1 reader per signal_level rules

Implementation: extend existing `primitive-registry.ts` (preferred — composes with E1) OR new module `web/src/lib/intelligence/signal-registry.ts` if separation cleaner. Decide based on existing registry architecture.

β.2 Inventory existing signal_types:
```
$ grep -rnE "signal_type:\s*'[^']+'" web/src/ --include='*.ts' | head -30
$ grep -rnE 'persistSignal\(' web/src/ --include='*.ts' | head -20
```
PASTE: matches. For each signal_type, register declaration. Verify reader exists per signal_level rules. If reader absent, HALT (HALT #14).

β.3 Refactor `convergence-service.ts` signal writes:
Each signal write validates against signal-registry before persist; throws `SignalNotRegisteredError` (named structured) on unknown.

β.4 Refactor `calculate/run/route.ts` `training:dual_path_concordance` (F-011):
```
$ grep -n 'training:dual_path_concordance\|training_dual_path' web/src/app/api/calculate/run/route.ts | head -5
```
PASTE matches. Per E3: declared reader required. Either register reader or remove write. Architect-channel disposition required only if ambiguous; default action: register placeholder reader documenting future consumer per AUD-004 v3 §2 E3 obligation.

β.5 Build + lint + test:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -30
```
PASTE: tails.

β.6 Commit:
```
$ git add -A
$ git commit -m 'HF-198 β (OB-196 Phase 5): E3 signal-type read-coupling structurally partitioned (closes F-006 + F-011)'
```

### PHASE γ — E6: Korean Test Verdict + Negative Tests (OB-196 Phase 6)

**Specification per AUD-004 v3 §2 E6 + Decision 154:** Korean Test extended to operation/primitive vocabulary. Every primitive structurally identified; canonical declaration; round-trip closure; structured failure on unrecognized identifiers.

**Closes:** Decision 154 closure verification — Korean Test verdict for operation vocabulary produces YES.

γ.1 Korean Test grep verification (zero hardcoded operation literals at dispatch sites):
```
$ grep -rn "'matrix_lookup'\|'tier_lookup'\|'tiered_lookup'\|'flat_percentage'\|'conditional_percentage'" web/src/ --include='*.ts' --include='*.tsx' 2>/dev/null
$ grep -rnE "type\s*===\s*'[a-z_]+'" web/src/ --include='*.ts' | grep -vE 'test|spec|fixture' | head -30
```
PASTE: outputs. Classify each match: dispatch-surface (must derive from registry) vs. exempt category (audit-trail comment, test fixture, type guard).

γ.2 Negative test extension:
Extend the 38-test negative suite from PR #350 with E5/E3/E6 negative cases:
- E5 negative: convergence Pass 4 invoked without prior `metric_comprehension` signal — expect structured failure
- E3 negative: signal write of unregistered signal_type — expect `SignalNotRegisteredError`
- E3 negative: signal write of L2 Comprehension without cross-flywheel reader — expect registration-time failure
- E6 negative: synthetic novel operation primitive (e.g., `'test_korean_primitive'`) registered then encountered at dispatch — verify platform routes correctly via registry; verify structured failure if unregistered

```
$ find web/src -name '*round*trip*test*' -o -name '*negative*suite*' 2>/dev/null | head -5
```
PASTE: existing negative test suite location. Extend in same file/directory.

γ.3 Korean Test verdict — author `docs/audits/HF-198_KOREAN_TEST_VERDICT.md`:
Document for Decision 154 closure:
- Korean Test grep result (γ.1) — verdict per dispatch surface
- Negative test suite extension (γ.2) — verdict per scenario
- Overall verdict: **YES** (platform passes Korean Test for operation vocabulary) or **NO** (gaps remain; document gaps for architect disposition)

γ.4 Build + lint + test:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -50
```
PASTE: tails. All tests pass including new negative cases.

γ.5 Commit:
```
$ git add -A
$ git commit -m 'HF-198 γ (OB-196 Phase 6): E6 Korean Test verdict + negative tests (Decision 154 closure verification)'
```

### PHASE δ — Reconciliation Gate Test (Decision 95)

CC reports calculated values verbatim. NO comparison to GT values. NO PASS/FAIL assertion. Architect reconciles in architect channel.

δ.1 Deploy locally per Section D Rule 2:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -10
$ cd web && npm run dev 2>&1 &
```
Wait for localhost:3000 response. PASTE: confirmation localhost responding 200.

δ.2 Reconciliation execution against three tenants:
For BCL (`b1c2d3e4-aaaa-bbbb-cccc-111111111111`), Meridian (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`), and CRP (architect-provided tenant_id if needed for query):

For each tenant with active rule_set + period(s):
```
$ curl -X POST http://localhost:3000/api/calculate/run \
    -H 'Content-Type: application/json' \
    -d '{"tenant_id":"<id>","rule_set_id":"<id>","period_id":"<id>"}'
```
OR equivalent invocation per existing test pattern (the 38-test negative suite from PR #350 may have a reusable harness — prefer that).

For each tenant, PASTE:
- HTTP response status
- `calculation_results` aggregate (grand total, per-component subtotals, entity count)
- Local console logs from convergence + executor traces

DO NOT compare to GT. DO NOT assert pass/fail. Architect reconciles.

δ.3 If any tenant's calculation throws structured error from registry/dispatch surfaces (PRs #345/#349/#350 + Phases α-γ), document error verbatim. Architect determines whether structured failure is expected (registry surface exposing missing primitive) or unexpected (regression).

δ.4 Commit reconciliation evidence:
```
$ git add -A
$ git commit -m 'HF-198 δ: reconciliation gate test (architect reconciles in architect channel)'
```

### PHASE η — Completion Report (Rule 25 — FIRST DELIVERABLE BEFORE FINAL BUILD)

η.1 Author `docs/completion-reports/HF-198_OB196_Phases_4_8_Closure_COMPLETION_REPORT.md` with VERBATIM Rule 26 mandatory structure:

```markdown
# HF-198 COMPLETION REPORT — OB-196 Closure (Phases 4-8)
## Date
2026-05-04

## Execution Time
<start time> – <end time>

## OB-196 Status at HF-198 Start
| PR | Phase | Scope | Status |
|---|---|---|---|
| #345 | Phase 0, 1, 1.5 | E1 primitive registry | merged |
| #346 | Phase 1.6 | L7 capture | merged |
| #347 | Phase 1.6.5 | Wholesale cleanup | merged f6bea1a8 |
| #348 | Phase 1.7 | F-005 closure | merged 6ead4def |
| #349 | Phase 2 | E2 structured failure | merged bad60c79 |
| #350 | Phase 3 | E4 round-trip + 38-test suite | merged 7a697dce |

## OB-196 Status at HF-198 Close (after this PR merges)
| PR | Phase | Scope | Status |
|---|---|---|---|
| <this PR> | Phase 4 | E5 plan-agent L2 signal | <merged after architect> |
| <this PR> | Phase 5 | E3 signal-type read-coupling | <merged after architect> |
| <this PR> | Phase 6 | E6 Korean Test verdict | <merged after architect> |
| <this PR> | Phase 7 | Compliance gates | <merged after architect> |
| <this PR> | Phase 8 | Final completion | <merged after architect> |

OB-196 closes when this PR merges.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| <SHA> | 0.13 | HF-198 0.13: prompt committed to git (Rule 14) |
| <SHA> | ADR | HF-198 ADR: Architecture Decision Record (Option A) |
| <SHA> | α | HF-198 α (OB-196 Phase 4): E5 plan-agent comprehension as L2 signal |
| <SHA> | β | HF-198 β (OB-196 Phase 5): E3 signal-type read-coupling |
| <SHA> | γ | HF-198 γ (OB-196 Phase 6): E6 Korean Test verdict + negative tests |
| <SHA> | δ | HF-198 δ: reconciliation gate test |
| <SHA> | η | HF-198 η: completion report (Rule 25 first-deliverable) |
| <SHA> | FINAL_BUILD | HF-198 final build verification appended |

## FILES CREATED
| File | Purpose |
|---|---|
| `vp-prompts/HF-198_OB196_Phases_4_8_Closure.md` | Directive prompt (Rule 14) |
| `docs/architecture-decisions/HF-198_ADR.md` | Architecture Decision Record (Section B) |
| `docs/audits/HF-198_KOREAN_TEST_VERDICT.md` | E6 Korean Test verdict for Decision 154 closure |
| `docs/completion-reports/HF-198_OB196_Phases_4_8_Closure_COMPLETION_REPORT.md` | This report |
| <new test files for E5/E3/E6 negative cases> | Negative test extension |
| <new signal-registry module if separated from primitive-registry> | E3 signal-type registration |

## FILES MODIFIED
| File | Change |
|---|---|
| `web/src/lib/calculation/primitive-registry.ts` | E3 extended to include signal_type registration (or new signal-registry composed) |
| `web/src/lib/intelligence/convergence-service.ts` | E5 Pass 4 reads metric_comprehension before AI derivation; E3 signal-registry-validated writes |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | E5 metric_comprehension signal emission post plan-agent prompt |
| `web/src/app/api/calculate/run/route.ts` | E3 training:dual_path_concordance reader registered (or write removed) |
| <38-test negative suite location> | Extended with E5/E3/E6 negative cases |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| P1 | E1 primitive-registry shipped | PASS | <pasted git log + file existence> |
| P2 | E2 structured failure shipped | PASS | <pasted git log + UnconvertibleComponentError grep> |
| P3 | E4 round-trip closure shipped | PASS | <pasted git log + negative suite presence> |
| P4 | F-005 invariant holds | PASS | <pasted grep showing zero non-exempt matches> |
| P5 | main HEAD has expected merges | PASS | <pasted git log> |
| P6 | AUD-004 v3 in repo | PASS | <pasted ls> |
| 1 | Phase 0.10 schema verification: column inventory pasted for all four tables | PASS | <pasted column inventory> |
| 2 | Phase 0.11 build clean baseline | PASS | <pasted tail> |
| 3 | Phase 0.11 lint clean | PASS | <pasted tail> |
| 4 | Phase 0.11 38-test negative suite green | PASS | <pasted tail> |
| 5 | Phase 0.12 branch HEAD === main HEAD | PASS | <pasted git rev-parse> |
| 6 | Phase ADR: HF-198_ADR.md committed BEFORE Phase α | PASS | <pasted commit SHA + log> |
| 7 | Phase α: anthropic-adapter emits metric_comprehension signal per metric | PASS | <pasted code at emission point> |
| 8 | Phase α: convergence-service Pass 4 reads metric_comprehension before AI derivation | PASS | <pasted code at read point> |
| 9 | Phase α: build + lint + test pass | PASS | <pasted tails> |
| 10 | Phase β: signal-registry validates ≥1 reader per signal_type before write | PASS | <pasted validation code> |
| 11 | Phase β: every existing signal_type registered with declared readers | PASS | <pasted registration evidence> |
| 12 | Phase β: training:dual_path_concordance has declared reader OR write removed | PASS | <pasted code> |
| 13 | Phase β: build + lint + test pass | PASS | <pasted tails> |
| 14 | Phase γ: Korean Test grep returns zero non-exempt matches | PASS | <pasted grep output + classification> |
| 15 | Phase γ: negative test suite extended with E5/E3/E6 cases | PASS | <pasted test list> |
| 16 | Phase γ: HF-198_KOREAN_TEST_VERDICT.md authored with verdict | PASS | <pasted verdict> |
| 17 | Phase γ: build + lint + test pass | PASS | <pasted tails> |
| 18 | Phase δ: localhost:3000 responds 200 | PASS | <pasted curl> |
| 19 | Phase δ: calc executes against three tenants; values pasted | PASS | <pasted aggregates and traces> |
| 20 | FINAL BUILD: `npm run build` exits 0 after all phases | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |
| 21 | FINAL LINT: `npm run lint` exits 0 after all phases | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |
| 22 | FINAL TEST: `npm test` exits 0 (all tests including new negative cases) | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| S1 | Korean Test (AP-25 / Decision 154): zero hardcoded operation literals at dispatch sites | PASS | <pasted γ.1 output> |
| S2 | Anti-Pattern Registry: zero violations of AP-1, AP-5, AP-6, AP-7, AP-8, AP-9, AP-13 | PASS | <per-AP evidence> |
| S3 | Scale test: signal-registry surface scales by O(1) entry-add | PASS | <reasoning + code citation> |
| S4 | F-006 + F-011 closed by E3+E5 mappings | PASS | <evidence chain> |
| S5 | F-005 invariant preserved after HF-198 work | PASS | <re-grep at completion> |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS — <commit count> commits across <phase count> phases
- Rule 2 (cache clear after commit): PASS — kill dev → rm -rf .next → npm run build → npm run dev confirmed at each phase
- Rule 6 (Supabase migrations live + verified): N/A — HF-198 has no migrations (Decision 64 v2 guard preserved)
- Rule 14 (prompt committed to git): PASS — vp-prompts/HF-198_OB196_Phases_4_8_Closure.md committed at 0.13
- Rule 25 (report before final build): PASS — this report committed before FINAL_BUILD phase
- Rule 26 (mandatory structure): PASS — sections in Rule 26 order
- Rule 27 (paste evidence): PASS — every gate has pasted evidence
- Rule 28 (commit per phase): PASS — <verify commit count matches phase count>
- Rule 29 (CC paste last): PASS — directive prompt has implementation directive as final block

## KNOWN ISSUES
- F-010 (LOW, out of structural scope per AUD_004 v3 §2): NOT CLOSED; carry-forward
- F-012 (positive control reference pattern): preserved unchanged
- N4 comprehension dimension substrate (D1/D2/D3): deferred per AUD_004 v3 §5
- IGF amendments T1-E910/T1-E902/T1-E906: vialuce-governance separate workflow; do not block this PR
- A.5.GAP-2 (`calculation_results` unique constraint): carry-forward from OB-196 Phase 3 audit; schema-level concern; architect dispositions separately
- Format polymorphism, domain pack architecture: forward
- Self-correction cycle audit (DS-017 §4.3): flagged; possibly resolved by per-sheet signal coherence post HF-197B+HF-198; verify post-merge

## VERIFICATION SCRIPT OUTPUT

### Phase 0.10 Schema Verify
<paste verbatim script output>

### Phase α/β/γ Negative Test Suite
<paste verbatim test output>

### Phase δ Reconciliation Gate
<paste verbatim aggregate per tenant>

### Phase FINAL_BUILD (appended)
<paste verbatim build + lint + test tails>

## OB-196 FINAL CLOSURE STATEMENT
With this PR merged, OB-196's six extensions are operative:
- E1 (primitive registry) — PR #345
- E2 (dispatch surface integrity) — PR #349
- E3 (signal-type read-coupling) — this PR Phase β
- E4 (round-trip closure) — PR #350
- E5 (plan-agent comprehension as L2 signal) — this PR Phase α
- E6 (Korean Test verdict + negative tests) — this PR Phase γ

AUD_004 v3 §1 verbatim problem ("If a new structural primitive appears, the
platform still works") closure: **PENDING ARCHITECT VERIFICATION** via
reconciliation gate test against CRP / BCL / Meridian.

The 38-test negative suite from PR #350, extended with E5/E3/E6 negative cases
in this PR Phase γ, is the regression infrastructure that catches future drift.
```

η.2 Commit completion report BEFORE final build per Rule 25:
```
$ git add docs/completion-reports/HF-198_OB196_Phases_4_8_Closure_COMPLETION_REPORT.md
$ git commit -m 'HF-198 η: completion report (Rule 25 first-deliverable, before final build)'
```

### PHASE FINAL_BUILD — Final Build Verification (appended to existing report)

FB.1 Final build verification:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
$ cd web && npm test 2>&1 | tail -50
```

FB.2 APPEND tails to existing completion report under "VERIFICATION SCRIPT OUTPUT > Phase FINAL_BUILD" section. Update PROOF GATES — HARD rows 20/21/22 with PASS/FAIL.

FB.3 Commit final build evidence:
```
$ git add docs/completion-reports/HF-198_OB196_Phases_4_8_Closure_COMPLETION_REPORT.md
$ git commit -m 'HF-198 FINAL_BUILD: appended final build evidence to completion report'
```

### PHASE θ — Push + PR

θ.1 Push branch:
```
$ git push -u origin hf-198-ob196-phases-4-through-8-closure
```

θ.2 Create PR per Section D Rule 3:
```
$ gh pr create --base main --head hf-198-ob196-phases-4-through-8-closure \
    --title 'HF-198: OB-196 Closure — Phases 4-8 (E5 + E3 + E6 + compliance + final close)' \
    --body "$(cat <<'BODY'
## Summary
Closes OB-196 by completing Phases 4-8: E5 (plan-agent comprehension as L2
signal), E3 (signal-type read-coupling structurally partitioned), E6 (Korean
Test verdict + negative tests), Phase 7 (compliance gates), Phase 8 (final
completion report). With this merge, OB-196's six extensions (E1-E6) are
operative; AUD_004 v3 §1 verbatim problem closure pending architect verification
via reconciliation gate test.

## OB-196 status
| PR | Phase | Scope | Status |
|---|---|---|---|
| #345 | 0/1/1.5 | E1 primitive registry | merged |
| #346 | 1.6 | L7 capture | merged |
| #347 | 1.6.5 | Wholesale cleanup | merged |
| #348 | 1.7 | F-005 closure | merged |
| #349 | 2 | E2 structured failure | merged |
| #350 | 3 | E4 round-trip + 38-test suite | merged |
| THIS | 4-8 | E5 + E3 + E6 + close | pending merge |

## Substrate citation
docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md (LOCKED 2026-04-27).
Six extensions E1-E6 LOCKED.
Decisions 154+155 LOCKED.

## Scope (vertical slice — engine + experience)
- Phase α (OB-196 Phase 4) — E5: plan-agent comprehension as L2 signal
- Phase β (OB-196 Phase 5) — E3: signal-type read-coupling
- Phase γ (OB-196 Phase 6) — E6: Korean Test verdict + negative tests
- Phase δ — reconciliation gate test (architect reconciles)

## Closes
F-006 (E3+E5), F-011 (E3). Korean Test verdict for Decision 154 closure.

## Out of scope (carry-forward)
- F-010 (LOW out of structural scope)
- A.5.GAP-2 (calculation_results unique constraint) — schema migration; architect dispositions
- N4 comprehension dimension substrate
- IGF amendments (vialuce-governance separate)
- Format polymorphism, domain pack architecture (forward)

## Architect actions
- Browser verification per completion report
- Reconciliation: CRP / BCL / Meridian (architect-channel against test fixtures)
- Production sign-off
- Merge

## Compliance
Rules 1-29 observed (verbatim per CC_STANDING_ARCHITECTURE_RULES.md v2.0 +
COMPLETION_REPORT_ENFORCEMENT.md). Decisions preserved. F-005 invariant
preserved. Korean Test extended per Decision 154. Premature Numbering
Avoidance + Procedural Theater Minimization observed.
BODY
)"
```
PASTE: PR URL.

θ.3 STOP. Output verbatim to architect:
```
HF-198 implementation complete. PR: <URL>.
OB-196 Phases 4-8 closed with this PR.
Reconciliation evidence pasted in completion report Section "VERIFICATION SCRIPT OUTPUT".
Awaiting architect:
(1) Browser reconciliation against three proof tenants (CRP/BCL/Meridian)
(2) Production sign-off
(3) PR merge
With merge: OB-196's six extensions (E1-E6) operative; AUD-004 v3 §1 verbatim
problem closure pending architect verification.
```

---

## SECTION F — QUICK CHECKLIST (per Standing Rules; verify before submitting completion report)

```
Before submitting completion report, verify:
☐ Architecture Decision committed before implementation? (Phase ADR)
☐ Anti-Pattern Registry checked — zero violations? (Section C sweep)
☐ Scale test: works for 10x current volume? (Soft Gate S3)
☐ AI-first: zero hardcoded field names/patterns added? (Korean Test, Soft Gate S1)
☐ All Supabase migrations executed AND verified with DB query? (N/A — no migrations)
☐ Proof gates verify LIVE/RENDERED state, not file existence? (Hard Gates 18-22)
☐ Browser console clean on localhost? (Phase δ)
☐ Real data displayed, no placeholders? (Phase δ aggregates)
☐ Single code path (no duplicate pipelines)? (E2 + E5 atomic per D153)
☐ Atomic operations (clean state on failure)? (E2 structured failure preserved)
☐ Preconditions P1-P6 verified at Phase 0? (CC verifies inline)
☐ F-005 invariant preserved? (Soft Gate S5)
☐ 38-test negative suite green at start AND end? (Phase 0.11 + Phase FINAL_BUILD)
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `docs/completion-reports/HF-198_OB196_Phases_4_8_Closure_COMPLETION_REPORT.md`
- Created BEFORE final build verification (Phase η before Phase FINAL_BUILD)
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## OUT OF SCOPE FOR HF-198 (do not touch)

- E1 / E2 / E4 (already shipped under OB-196 PRs #345, #349, #350; preserve unchanged)
- F-001 / F-002 / F-002b/c/d / F-003 / F-004 / F-005 / F-007 / F-008 / F-009 (already closed by OB-196 0-3)
- F-010 (LOW, out of structural scope per AUD_004 v3 §2)
- F-012 (positive control — reference pattern preserved)
- A.5.GAP-2 (calculation_results unique constraint — carry-forward)
- N4 comprehension dimension substrate (deferred per AUD_004 v3 §5)
- IGF amendments T1-E910/T1-E902/T1-E906 (vialuce-governance separate)
- Schema migrations (Decision 64 v2 guard — HALT if required)
- HC primacy chain code (preserved unchanged)
- Resolver chain code (preserved unchanged)
- Fingerprint flywheel code (preserved unchanged; HF-197B fix preserved)
- Format polymorphism (forward)
- Domain pack architecture (forward; foundation laid by D155 federation)

These remain open carry-forward.

---

## REPORTING DISCIPLINE

- Every PASS claim has pasted evidence (FP-80 + Rule 27)
- Completion report file exists BEFORE final PR push (Rule 25)
- Reconciliation evidence pasted RAW; CC does not assert PASS/FAIL (Reconciliation-Channel Separation)
- No GT values in CC artifacts (Reconciliation-Channel Separation discipline)
- HALT at seventeen named conditions; otherwise CONTINUOUS
- F-NNN findings referenced verbatim (Premature Numbering Avoidance — no inventing HF/OB numbers)
- OB-196 phases referenced by their established phase numbers (Phase 4 = E5; Phase 5 = E3; Phase 6 = E6)

---

END OF DIRECTIVE.
