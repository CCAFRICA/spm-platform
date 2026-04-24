# HF-193 — Seeds Eradication to Signal-Surface Architecture (Atomic Cutover)

**Class:** HF (VP code hot fix)
**Repo:** `~/spm-platform` (VP)
**Branch:** `hf-193-signal-surface` (existing; HEAD at session start: `ed7c70d7`)
**Authority:** Decision 153 LOCKED (2026-04-20) — `Decision_153_LOCKED_20260420.md`
**Paired substrate (queued, not blocking):** IGF-T2-E29 (Decision 30) extension — see §9 ICA Capture
**Execution vehicle:** Single atomic cutover commit per Q-B=B-E4 + Q-D=D-E2
**Authored:** 2026-04-22
**CC reference at execution:** CC_STANDING_ARCHITECTURE_RULES.md (top of prompt per session discipline)

---

## 0. ARCHITECT INTENT

Execute the atomic cutover that eradicates the `plan_agent_seeds` pattern across VP codebase and replaces it with the signal-surface architecture defined by Decision 153 LOCKED. The cutover is a single commit (per Q-B=B-E4) on the existing `hf-193-signal-surface` branch, delivered after offline dev-environment verification proves the CRP $566,728.97 pre-clawback baseline reproduces under signal-surface calculations (per Q-D=D-E2).

On this commit:
- All nine `plan_agent_seeds` code references across seven preservation points are removed
- All `plan_agent_seeds` JSONB contents are deleted from `rule_sets.input_bindings` across all tenants
- The AI→engine bridge produces L2 Comprehension signal specifications, persisted via `fn_bridge_persistence` RPC (Phase 2.2a foundation)
- The convergence service reads L2 signals via direct composite-key query (no wrapper)
- The HF-165/HF-192 completeness gate defers to E1 convergence binding check (signal presence, not seeds presence)
- Baseline verification against CRP ($566,728.97), BCL ($312,033), Meridian (MX$185,063) passes in dev before PR opens

---

## 1. GOVERNANCE CONTEXT

### 1.1 Decision 153 dispositions authorizing this work

Seven locked dispositions from Decision 153 LOCKED lock ceremony (2026-04-20):

- **Q-A=A2** — Typed columns `rule_set_id UUID`, `metric_name TEXT`, `component_index INTEGER` on `classification_signals` with composite partial index on `(signal_type, rule_set_id, metric_name, component_index) WHERE signal_type = 'metric_comprehension'`. **Already live** from HF-193-A Phase 1.2 (commit `9ad419d2`).
- **Q-B=B-E4** — Feature-complete signal path before atomic cutover commit. No intermediate state on main where both paths coexist.
- **Q-C=C2** — Completeness gate defers to E1 convergence binding check; gate no longer evaluates "has plan_agent_seeds" but "can E1 bind required metrics."
- **Q-D=D-E2** — Offline verification, single-event cutover. No phased parallel operation, tenant-by-tenant rollout, or feature flag.
- **Q-E=E1** — Direct composite-key query in convergence service; no wrapper abstraction.
- **Q-F=F2** — Signal write at AI→engine bridge function via `fn_bridge_persistence` stored procedure. **Stored procedure already live** from HF-193-A Phase 2.2a (commits `fb0b86a5` + `b812d956` Option X refinement).
- **Q-G=G3** — Hybrid address-based within-scope binding. Within-scope is HF-193; cross-scope is future work (scope boundary per §3 MUST NOT).

### 1.2 Decision 153 Principle (authoritative lock language, verbatim)

> "When the plan agent interprets a plan document and comprehends the semantic relationship between metric labels and their derivation from raw data, that comprehension is persisted as Level 2 Comprehension signals in the `classification_signals` table. The convergence service reads these signals via direct composite-key query at calculation time. Intelligence flows through the shared signal surface — never through private JSONB keys in execution structures.
>
> The `plan_agent_seeds` mechanism introduced by HF-191 is eradicated. Every reference in the VP codebase (9 code locations across 7 preservation points plus bridge translation and system prompt) is diagnostic debt that HF-193 fully closes."

### 1.3 Architect disposition on Decision 30 extension prerequisite — SR-42 step 3 affirmation

The Decision 153 lock ceremony language states: *"Hard prerequisite to execution: IGF-T2-E29 (Decision 30) extension with L2 Comprehension scoping vocabulary."* Architect disposition (2026-04-22, SR-42 step 3 applicability determination):

**Dispositioned: procedural-not-mechanical.** HF-193's VP code compiles and runs independently of IGF-T2-E29 v2 substrate content. The VP columns, index, and stored procedure cited in Decision 153 dispositions Q-A, Q-E, Q-F are already live in VP substrate from Phase 1.2 + Phase 2.2a — without dependency on the VG substrate entry's extension. The "before HF-193 branch work begins" language in the lock ceremony is a governance sequencing commitment, not a VP runtime dependency.

Under SR-42 (Locked-Rule Halt Discipline) step 3, architect has authority to disposition rule applicability. Architect affirmed 2026-04-22 that the prerequisite is procedural, does not gate VP code authoring or execution, and Decision 30 v2 extension is queued as ICA capture for future session governance work (§9).

**This disposition is recorded here as the authoritative trace** of architect decision per SR-42 step 3. Decision 153 LOCKED language remains locked; only the prerequisite's applicability to current HF-193 authoring is dispositioned.

### 1.4 Governing principles (IGF T1/T0 bindings from IRA Consultation 3)

- **T1-E907 Fix Logic, Not Data** — no workarounds, configuration changes, reduced scope tests, or interim measures. HF-193 is structural fix.
- **T1-E930 Choose Right Over Quick** — atomic cutover is correct; phased coexistence is quick-but-incorrect (rejected).
- **T1-E931 Locked Decision Immutability** — every code change traces to a Decision 153 locked disposition; scope creep is supersession-in-disguise.
- **T1-E904 Calculation Sovereignty** — engine depends only on committed data (signals) + active plan (rule_set); no ambient context.
- **T1-E903 No Hardcoded Assumptions (LLM-Primary, Deterministic Fallback, Human Authority)** — `metric_name` is AI-determined; no string-match logic on its content.
- **T1-E910 Korean Test** — typed scoping columns (UUID, TEXT, INTEGER); structural discriminators, not language-dependent.
- **T1-E906 Closed-Loop Intelligence** — signals accumulate per three-flywheel architecture; shared signal surface is authoritative.
- **T1-E902 Carry Everything, Express Contextually** — signals persisted at import; context activates at calculation time.

---

## 2. MUST ADDRESS (scope bound per Decision 153 items 1-9)

HF-193 MUST address the following. Each item cites the authorizing Decision 153 disposition and is non-separable from atomic cutover per Q-B=B-E4.

### 2.1 Bridge function — produce L2 Comprehension signal specifications

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Function:** `bridgeAIToEngineFormat` (existing)
**Change:** Modify return shape to produce `SignalWriteSpec[]` for L2 Comprehension signals. Remove any bridge output shape that produces `plan_agent_seeds` content in `input_bindings`. Bridge output feeds `fn_bridge_persistence` RPC (Phase 2.2a stored procedure) as `p_signals` parameter.
**Authorization:** Q-F=F2 (write at AI→engine bridge function)
**Non-separability:** Without bridge producing signals, atomic cutover has no signal source; without bridge omitting seeds, cutover leaves seeds-shaped data in `input_bindings` — partial eradication contradicts Q-B=B-E4.

### 2.2 Caller-site RPC conversion — all caller sites

**Files + routes identified from Phase 2.2b reverted work:**
- `web/src/app/api/import/sci/execute/route.ts` (caller at approximately lines 1265-1320 and 1501-1560 per Phase 2.2a completion report)
- `web/src/app/api/import/sci/execute-bulk/route.ts`
- `web/src/app/api/import/run/route.ts`
- `web/src/app/api/import/commit/route.ts`

**Change:** Convert any `.from('rule_sets').upsert(...)` or equivalent calls that participate in plan interpretation persistence to `.rpc('fn_bridge_persistence', { p_rule_set, p_signals })`. Caller payloads constructed with `input_bindings` that does NOT include `plan_agent_seeds`. Any narrow-variant access sites on bridge return value preserve tight typing (per §7.1 Phase 2.2b learning).
**Authorization:** Q-F=F2 (bridge is the write site; caller invokes it); Q-B=B-E4 (cutover commit includes all callers)
**Non-separability:** Mixed caller state where some callers use RPC and others use direct upsert violates atomic cutover.

### 2.3 Convergence read change — direct composite-key query

**File:** `web/src/lib/convergence/convergence-service.ts`
**Function:** `convergeBindings` (existing)
**Change:** Replace any seeds-dependent read path with direct query on `classification_signals`:
```sql
SELECT metric_name, component_index, signal_value, ...
FROM classification_signals
WHERE signal_type = 'metric_comprehension'
  AND rule_set_id = $1
  AND metric_name = $2
  AND component_index = $3;
```
No wrapper abstraction (ORM semantic accessor, service-layer method with intent naming). Query hits the composite partial index directly.
**Authorization:** Q-E=E1 (direct composite-key query, no wrapper)
**Non-separability:** Without convergence reading signals, cutover leaves engine reading seeds; path divergence contradicts Q-B=B-E4.

### 2.4 Gate behavior change — defer to E1 convergence binding check

**File:** HF-165/HF-192 completeness gate location (confirm in code survey step — likely in convergence-service.ts or a dedicated gate module)
**Change:** Gate's "can this plan calculate?" predicate changes from "has `plan_agent_seeds` populated" to "does E1 convergence binding query return expected signal set for this rule_set." Gate uses the same query pattern as §2.3.
**Authorization:** Q-C=C2 (gate defers to E1 binding check)
**Non-separability:** Gate still checking seeds presence would false-fail under signal-surface architecture (signals present but seeds absent); false-pass under seeds preservation contradicts eradication.

### 2.5 Seeds code deletion — seven preservation points

Per Decision 153 item 5, **nine code locations across seven preservation points**:

1. `web/src/app/api/import/sci/execute/route.ts` (preservation point 1)
2. `web/src/app/api/import/sci/execute-bulk/route.ts` (preservation point 2 — first instance)
3. `web/src/app/api/import/sci/execute-bulk/route.ts` (preservation point 3 — second instance)
4. `web/src/app/api/import/sci/execute-bulk/route.ts` (preservation point 4 — third instance)
5. `web/src/app/api/import/run/route.ts` (preservation point 5)
6. `web/src/app/api/import/commit/route.ts` (preservation point 6)
7. `web/src/lib/convergence/convergence-service.ts` (preservation point 7 — convergence preservation logic)
8. `web/src/lib/compensation/ai-plan-interpreter.ts` (`bridgeAIToEngineFormat` translation logic)
9. `web/src/lib/ai/anthropic-adapter.ts` (system prompt reference to plan_agent_seeds, if present)

**Change:** All `plan_agent_seeds` references removed. `grep -r plan_agent_seeds web/src` returns empty post-commit.
**Authorization:** Decision 153 Principle ("mechanism is eradicated; every reference is diagnostic debt"); Q-B=B-E4 (single commit closes all debt)
**Non-separability:** Partial removal leaves contaminated code paths that may reactivate or confuse future work.

### 2.6 Seeds JSONB data deletion — all tenants

**Target:** `rule_sets.input_bindings` JSONB key `plan_agent_seeds` across all tenants in VP production and dev Supabase
**Change:** SQL or scripted removal of `plan_agent_seeds` key from `input_bindings` JSONB for all rows. `SELECT count(*) FROM rule_sets WHERE input_bindings ? 'plan_agent_seeds';` returns 0 post-migration.
**Authorization:** Decision 153 item 6 ("Delete `plan_agent_seeds` JSONB contents from `input_bindings` for all tenants")
**Non-separability:** Persisted seeds data without corresponding code path is substrate debt; data cleanup belongs in the atomic cutover commit.

### 2.7 AI re-interpretation trigger — dev environment

**Scope:** Trigger plan agent re-interpretation of CRP, BCL, Meridian plans in dev environment to produce L2 Comprehension signals via the new F2 write-site (post-bridge-change).
**Mechanism:** Invoke plan interpretation pipeline against CRP/BCL/Meridian plan records in dev Supabase. Fresh interpretation output flows through modified bridge → `fn_bridge_persistence` RPC → signals land in `classification_signals`.
**Authorization:** Decision 153 item 7
**Non-separability:** Baseline verification (item 8) requires signals present; signals present requires re-interpretation.

### 2.8 Baseline verification — dev environment, offline, before PR opens

**Targets:**
- CRP pre-clawback: $566,728.97 (10 periods × 4 primitives)
- BCL: $312,033
- Meridian: MX$185,063

**Proof shape:**
1. Clean-slate state in dev: `plan_agent_seeds` removed from JSONB; signals present in `classification_signals` from re-interpretation
2. Full calculation run across all periods for each tenant via signal-surface path (no seeds fallback available)
3. Engine output matches baselines exactly (per T1-E905 Prove Don't Describe; evidence chain to source data)
4. Verification script committed to repo as part of HF-193 artifacts (per T1-E929 CC Standing Rule — live running state evidence)

**Authorization:** Q-D=D-E2 (offline verification before cutover); Decision 153 item 8
**Non-separability:** Cutover without baseline verification risks regression; verification after PR is already-shipped risk materialization.

### 2.9 Decision 30 extension prerequisite disposition — recorded in commit message and completion report

**Scope:** Record architect A2 disposition (§1.3) in HF-193 commit message and completion report. This is not a code change — it is traceability for post-merge governance audit.
**Authorization:** SR-42 step 3 disposition
**Non-separability:** Without explicit record, post-merge audit may surface the prerequisite as un-executed without the architect's applicability determination; recording here preserves forensic trail.

---

## 3. MUST NOT ADDRESS (scope boundary; Decision 153 item "MUST NOT")

HF-193 MUST NOT address the following. Each is scope creep per T1-E931 violation pattern.

1. **Any `plan_agent_seeds` reference preservation** — every reference is debt HF-193 fully closes (Decision 153 Principle).
2. **Seed-based execution as fallback or rollback path** — seeds are aberration being eradicated, not prior state being preserved.
3. **Mechanical transformation of seed contents into signals** — seeds do not contain comprehension at correct granularity; signals are produced by AI re-interpretation through F2 write-site.
4. **Ambient state introduction** — per-tenant configuration flags, feature toggles, environment variables to select between paths. Contradicts Q-B=B-E4 atomic cutover.
5. **Calculation engine core logic modification** — engine reads committed data and active plan per T1-E904; HF-193 changes what signals are available, not how engine calculates.
6. **Cross-scope binding implementation** — Q-G=G3 affinity-based cross-scope is architectural infrastructure for future work; not required for HF-193.
7. **`plan_agent_seeds` JSONB column deletion from `rule_sets.input_bindings` schema** — Decision 153 scope says delete contents for all tenants (item 6); full column/schema deletion if separable is follow-on cleanup, not HF-193.
8. **Clawback engine implementation** — separate scope per Handoff Section 20 Path post-HF-193.
9. **Decision 30 v2 substrate entry authoring** — dispositioned A2 as procedural-not-mechanical; queued ICA capture (§9). Not this session, not this HF.
10. **DIAG-018 Plan 3 period-switch regression diagnosis** — separate scope (Path B per Handoff Section 20); SEQ-1 sequencing intent places it after HF-193 verification harness.

---

## 4. ATOMIC CUTOVER OPERATIONAL SHAPE (per Q-B=B-E4 + Q-D=D-E2)

### 4.1 Single commit vs. preparation-then-cutover

**Operational shape:** Feature-complete signal path built on branch via normal development commits (preparation); atomic cutover commit is the commit that **removes all seeds-path code and activates signal-surface path**. Branch-level state before cutover commit can have preparation work; main-branch state after squash-merge shows the single cutover as the transition event.

**Sequence on `hf-193-signal-surface` branch:**

- Preparation commits (bridge modification, caller-site preparation, convergence read preparation, gate preparation, verification script, baseline verification run) — may be multiple commits for review granularity
- Atomic cutover commit — removes all seeds code, removes JSONB contents, activates signal-surface path, runs end-to-end verification
- PR to main as squash-merge — single commit lands on main representing the cutover event (Decision 153 Q-B=B-E4 semantic preserved via squash-merge convention per SR-41 reasoning)

**No intermediate state on main where seeds-path and signals-path coexist.** Squash-merge ensures this.

### 4.2 Commit ordering constraints on branch

Dependency-ordered preparation (may be multiple commits):

1. Bridge modification (produces signal specs, stops producing seeds-shaped output) — depends on Phase 2.2a stored procedure
2. Caller-site preparation (payload construction without seeds; RPC invocation path wired) — depends on bridge change
3. Convergence service change (direct composite-key query against signals) — independent of bridge; can precede or follow
4. Gate change (defer to E1 binding check) — depends on convergence service change
5. Verification script added — independent; can be added anytime
6. Dev AI re-interpretation triggered — depends on bridge change
7. Baseline verification run in dev — depends on steps 1-6 complete
8. **Atomic cutover commit** — removes all seeds references across seven preservation points + JSONB contents cleanup migration; final verification run proves baseline still reproduces post-removal

### 4.3 Branch strategy

**Proceeds on existing `hf-193-signal-surface` branch.** Phase 1.2 and Phase 2.2a foundations are already committed on this branch. Revert commit `37111ab7` for Phase 2.2b contamination is also on this branch (forensic trail per SR-41). No fresh branch cut. No sub-branch required.

Branch starting HEAD: `ed7c70d7` (session-close batch commit per Handoff Section 2.1).

### 4.4 PR strategy

**Single PR at HF-193 close.** Base: `main`. Head: `hf-193-signal-surface`. Squash-merge on approval. Squash-merge conflates branch history (preparation + revert + cutover) into single mainline commit representing the HF-193 event — clean history per SR-41 reasoning composability.

No intermediate PRs to main. No hotfix branching off the branch mid-work.

---

## 5. VERIFICATION CRITERION

### 5.1 Build-level verification

`npm run build` passes clean in VP repo. TypeScript compilation clean. No `any`, `unknown`, or casting introduced to silence type errors (Phase 2.2b build-failure lesson per §7.1).

### 5.2 Integration-level verification

End-to-end signal flow proven:
1. AI interpretation of plan → bridge produces signal specs → RPC invoked → signals land in `classification_signals` with three scoping columns populated
2. Convergence service direct composite-key query returns signals → engine binds metrics → calculation produces numeric output
3. Gate behavior defers to E1 binding check; gate response matches signal presence state

### 5.3 Baseline proof (per T1-E905 + T1-E929)

**CRP $566,728.97 pre-clawback reproduces in dev environment under signal-surface architecture with seeds deleted.**

Proof shape:
- Clean-slate dev Supabase: seeds JSONB data removed from `rule_sets.input_bindings`; signals re-populated via fresh AI re-interpretation through modified bridge
- Full CRP calculation run across all 10 periods × 4 primitives via signal-surface path exclusively (no seeds fallback code exists at this point)
- Engine output: $566,728.97 exactly (matching pre-existing baseline from seeds-path architecture)
- BCL ($312,033) and Meridian (MX$185,063) same shape of proof

Verification script committed to repo under `web/scripts/` naming convention (per prior session naming pattern like `hf-193-a-phase-2-2a-rpc-verification.ts`). Script output pasted into HF-193 completion report as evidence (per T1-E929 live-state evidence requirement).

### 5.4 Regression protection

Permanent coverage:
- Grep guard test: `grep -r 'plan_agent_seeds' web/src` returns empty. Committed as a CI check or a shell-gate in the verification script.
- Convergence-signal-read path test: integration test that proves convergence reads signals (not seeds) for a test rule_set.
- Gate-defer test: gate's binding check uses E1 query; test verifies gate returns false if signals absent and true if signals present.

### 5.5 Lock readiness for Decision 153 final status

**Decision 153 transitions from LOCKED to IMPLEMENTED upon HF-193 PR merge and baseline verification confirmation in dev** (per Decision 153 §IGF-T2-E08 status transition language).

HF-IGF-XX migration to transition IGF-T2-E08 status from `active` to `implemented` in VG substrate is a separate artifact after HF-193 merges — not part of HF-193 itself. Queued for post-merge governance batch.

**AUD-002 v2 findings V-001 (seeds primary write) and V-007 (seven preservation points) CLOSE on HF-193 ship** per Decision 153 downstream substrate implications.

---

## 6. PER-DISPOSITION AUTHORIZATION TRACE

Bidirectional mapping. Decision 153 disposition → HF-193 work items; work items → disposition authorization.

| Decision 153 Disposition | HF-193 Items |
|---|---|
| Q-A=A2 typed columns + composite index | §2.3 (read uses composite index); §2.4 (gate uses composite index). Columns already exist per Phase 1.2. |
| Q-B=B-E4 atomic cutover | §2.5 (seeds code removal); §2.6 (JSONB cleanup); §4 operational shape; §2.9 (commit-message trace) |
| Q-C=C2 gate to E1 query | §2.4 |
| Q-D=D-E2 offline single-event cutover | §2.8 (offline verification); §4.1 (squash-merge single event); §2.7 (dev re-interpretation) |
| Q-E=E1 direct composite-key convergence read | §2.3 |
| Q-F=F2 bridge write-site | §2.1 (bridge change); §2.2 (caller RPC conversion). Stored procedure exists per Phase 2.2a. |
| Q-G=G3 within-scope binding | §2.1 + §2.3 use rule_set_id + metric_name + component_index composite. Cross-scope excluded per §3 item 6. |

| HF-193 Item | Authorizing Disposition |
|---|---|
| §2.1 Bridge produces signals, stops producing seeds | Q-F=F2 (write site) + Decision 153 Principle (seeds eradicated) |
| §2.2 Caller RPC conversion | Q-F=F2 (caller invokes bridge via RPC) + Q-B=B-E4 (all callers in cutover) |
| §2.3 Convergence direct composite-key query | Q-E=E1 |
| §2.4 Gate defers to E1 | Q-C=C2 |
| §2.5 Seven preservation points removed | Decision 153 Principle + Q-B=B-E4 |
| §2.6 JSONB data cleanup | Decision 153 item 6 + Q-B=B-E4 |
| §2.7 AI re-interpretation dev | Decision 153 item 7 |
| §2.8 Baseline verification | Q-D=D-E2 + Decision 153 item 8 + T1-E905 + T1-E929 |
| §2.9 Commit-message disposition record | SR-42 step 3 (architect A2 disposition trace) |

**No work items without disposition authorization. No dispositions without corresponding work items.**

---

## 7. CONTAMINATION RISK ASSESSMENT

### 7.1 Attractors from Closing Report Section 4.2 (all four named explicitly)

1. **"Seeds work today."** CRP $566,728.97 baseline currently produced by seeds-path (HF-191 implementation). Removing seeds requires signal-surface reproducing baseline. Non-trivial verification work — **mitigated by §2.8 offline verification in dev before cutover; baseline must reproduce before PR opens.**

2. **"Additive migration is industry-standard."** "Add new path, verify, remove old" feels safe. Decision 153 explicitly rejects this (Q-B=B-E4 atomic cutover; Q-D=D-E2 single-event). **Mitigated by §3 MUST NOT items 1-4 explicitly forbidding any coexistence pattern; prior session's Phase 2.2b contamination reverted per SR-41 as substrate evidence.**

3. **"Seven preservation points feel like minimum-touch."** Preserving seeds writes at preservation points feels disciplined. **Mitigated by §2.5 naming all seven preservation points verbatim with explicit removal mandate; §3 MUST NOT item 1 forbids any preservation.**

4. **"The correct path is harder."** Atomic cutover + baseline re-verification + simultaneous removal of seven preservation points + convergence read change + gate change = large coordinated commit with baseline at stake. **Acknowledged. The cost is part of correct execution. Shortcuts invite recurrence #4 of the drift pattern.**

### 7.2 Fabrication-risk language (from Phase 2.2b contamination pattern)

The following framings are explicitly forbidden in HF-193 code, comments, commit messages, completion report, or any CC directive:

- "additive policy"
- "D13 additive"
- "phased coexistence"
- "minimum-touch refactor"
- "preserve seeds as fallback"
- "HF-193-A (additive) / HF-193-B (eradication)" split
- "preserve for rollback"
- "legacy path compatibility shim"
- any wording that implies both paths coexist on main

Any such language appearing in CC output or Claude drafts is SR-41 trigger: revert contamination, surface cause, re-derive from Decision 153 primary.

### 7.3 Recusal Gate assessment (per IRA C3 Finding 8 + Decision 153 §HF-193 Recusal Gate implications)

**HF-193 does NOT trigger Recusal Gate.** Work is implementation of locked architectural decisions (Decision 147 + Decision 153) via signal-surface. No governance-layer modification. No Tier 0 entries affected. Decision 30 extension is Tier 2 (not Tier 0); architect dispositioned procedural-not-mechanical per §1.3 anyway.

No Gate-scoped sub-OB required.

### 7.4 Architect CRF surfacing points during execution

Explicit architect halt-and-review points where CRF discipline should fire:

- **CRF-1: Before bridge modification commit.** Review bridge diff for any residual seeds-path code. Catch attractor #3 (preservation drift).
- **CRF-2: Before caller-site commits.** Review payload construction for any `plan_agent_seeds` key. Catch attractor #2 (additive framing).
- **CRF-3: Before atomic cutover commit.** Full diff review of the cutover commit; seven preservation points confirmed removed; grep guard returns empty; baseline verification output pasted as evidence.
- **CRF-4: Before PR opens.** Final review of branch state; squash-merge behavior confirmed; commit message captures §1.3 architect disposition trace.

---

## 8. EXECUTION GATES (sequenced halts for architect review)

Each gate halts CC for architect disposition. CC reports evidence; architect dispositions proceed / redraft / halt.

**Gate A — Code site survey**
CC surveys all seven preservation points + gate location + any additional seeds references via grep. Reports: file paths, line numbers, surrounding context snippets. Architect confirms scope matches §2.5.

**Gate B — Bridge modification**
CC modifies `bridgeAIToEngineFormat` per §2.1. Reports: full diff; TypeScript build result; any type-loosening flagged for architect review. Halts for architect CRF-1.

**Gate C — Caller-site conversion**
CC converts caller sites per §2.2. Reports: full diffs per file; TypeScript build result; narrow-variant access site preservation confirmed (Phase 2.2b lesson). Halts for architect CRF-2.

**Gate D — Convergence read change**
CC modifies `convergeBindings` per §2.3. Reports: full diff; direct composite-key query confirmed (no wrapper abstraction).

**Gate E — Gate behavior change**
CC modifies completeness gate per §2.4. Reports: full diff; gate now uses E1 binding check.

**Gate F — Verification script**
CC authors verification script per §5.3. Reports: script content; runs script against pre-cutover branch state to establish baseline measurement mechanism.

**Gate G — Dev re-interpretation**
CC triggers AI re-interpretation in dev per §2.7. Reports: plan agent invocation output; signals count in `classification_signals` post-re-interpretation.

**Gate H — Baseline verification**
CC runs verification script per §5.3. Reports: exact output; CRP $566,728.97 match confirmed; BCL $312,033 match confirmed; Meridian MX$185,063 match confirmed. Architect reviews evidence; dispositions proceed-to-cutover or halt-for-diagnosis.

**Gate I — Atomic cutover commit**
CC removes all seeds code references across seven preservation points (§2.5) + JSONB cleanup migration (§2.6) in a single commit. Reports: full commit diff; `grep -r plan_agent_seeds web/src` returns empty; JSONB cleanup migration result (0 rows remain with seeds key). Halts for architect CRF-3.

**Gate J — Final verification + PR**
CC runs verification script against post-cutover state. Reports: verification output confirming baselines still reproduce post-removal. Halts for architect CRF-4; on disposition, CC opens PR with `gh pr create --base main --head hf-193-signal-surface` and appropriate title + body.

**No CC self-attestation. No PASS verdict without pasted evidence at each gate.**

---

## 9. ICA CAPTURE — QUEUED GOVERNANCE WORK

### 9.1 IGF-T2-E29 (Decision 30) extension — deferred per architect A2 disposition

**Context:** Decision 153 LOCKED lock ceremony (2026-04-20) named Decision 30 extension as "hard prerequisite to HF-193 branch work." Architect dispositioned 2026-04-22 per SR-42 step 3 that the prerequisite is procedural-not-mechanical and does not gate VP HF-193 code authoring or execution. Decision 30 extension remains valid governance work but is queued for future session rather than blocking HF-193.

**Required extension scope (verbatim from Decision 153 lock ceremony):**

- L2 Comprehension signal type definition
- Three scoping columns (`rule_set_id` as plan-component address, `metric_name` as AI-determined metric identifier, `component_index` as positional index within a plan component)
- Composite index specification
- Relationship to L1 Classification and L3 Convergence signal types

**Additional STEP BACK scope identified 2026-04-22 (architect-directed) for inclusion in future Decision 30 v2:**

- Seeds ambient-JSONB pattern as framework-level anti-pattern (elevated from implicit to critical violation_pattern)
- Explicit critical violation_patterns for: any plan_agent_seeds reference preservation; any additive/phased/coexistence transition pattern; any of the seven preservation points remaining post-HF-193 cutover
- Adherence patterns including grep guard ("grep -r plan_agent_seeds web/src returns empty post-HF-193")
- Cross-references: Decision 153, Decision 64 v2, Decision 118, HF-191 (seeds origin), HF-193 (eradication vehicle), AUD-002 V-001 + V-007 (anti-pattern source)

**Execution path when unblocked:** Future session authors IGF-T2-E29 v2 substrate entry (Pattern C version control: v1 preserved, v2 additive, `supersession_id: null`). Migration file at `~/vialuce-governance/supabase/migrations/YYYYMMDDHHMMSS_hf_igf_XX_decision_30_extension.sql`. CC migration directive issued from that future session.

**Current session produced a 400-line draft** of Decision 30 v2 content during the disposition process (architect accepted, then STEP BACK reassessed scope on cost-benefit grounds). Draft content preserved in this session's chat history for future session reference. Minimum-viable variant (~30-40 lines) identified as alternative scope — architect decides scope on pickup.

### 9.2 Lock-ceremony-to-execution sequencing gap — ICA observation

**Process pattern observed:** Decision 153 lock ceremony (April 20) committed to executing Decision 30 extension "next turn in this session per architect sequencing." That did not happen; lock shipped without prerequisite execution. HF-193-A Phase 1.2 and Phase 2.2a proceeded on VP without the VG prerequisite, surfacing only when this session's IRA C3 Finding 9 made the gap explicit.

**Pattern-level finding for ICA capture:** Locked-decision execution sequences can stall between lock ceremony and first downstream work when (a) the downstream work is scoped across two repos (VG governance + VP code), (b) the prerequisite is governance-only and does not block VP code compilation, and (c) the prerequisite's cost is non-trivial relative to its procedural weight.

**Mitigations for substrate ingestion (IRA C3 Finding 10 gap candidate):**
- Locked-decision execution plans include explicit checkbox per dependency in lock ceremony artifact
- IGF-T2-E08 status workflow adds "prerequisite-dispositioned" intermediate state between `active` and `implemented`
- SR-42 (this session's new standing rule) provides architect explicit-disposition authority on prerequisite applicability, reducing future sessions' temptation to bypass reasoning

### 9.3 Phase 2.2b reverted work scope preservation for HF-193

**Preserved learnings from reverted Phase 2.2b (commit 3c628702 reverted at 37111ab7 per SR-41):**

- BridgeOutput narrow-variant access sites exist at `execute/route.ts:1328` and `:1567` — loosening typing to `unknown[]` breaks compilation; HF-193 bridge change preserves tight typing
- `engineFormat.components.variants` access pattern uses aliased return value; grep for `bridgeAIToEngineFormat` callers alone misses these sites
- Caller-site grep must cover (a) direct function calls, (b) aliased return value usage, (c) internal property access on returned objects

These learnings inform HF-193 §2.1, §2.2, and Gate C.

---

## 10. SEQUENCING AND OPEN ITEMS

### 10.1 Relative to other Handoff Section 20 paths

- **Path A (this HF-193):** PRIMARY. Execute first.
- **Path B (DIAG-018):** SEQ-1 post-HF-193 verification harness per architect lean; finalize after HF-193 baseline verification shape known.
- **Path C (Governance Index + CLT Registry maintenance):** Parallel non-blocking. Can execute alongside HF-193 preparation commits.

### 10.2 Open items this artifact resolves

- R3 (Decision 30 prerequisite) — dispositioned A2 per §1.3; queued ICA §9.1
- Q2 (Decision 30 extension prerequisite status) — resolved via §1.3 + §9.1

### 10.3 Open items this artifact propagates

- R1 (seeds contamination recurrence) — §7 contamination risk assessment applies; CRF-1 through CRF-4 architect gates; attractors named
- R2 (CRP baseline break on execution) — §2.8 + §5.3 verification gate addresses; mitigation via pre-cutover offline verification
- R5 (DIAG-018 interaction) — §10.1 SEQ-1 disposition carries forward

---

## 11. COMPLETION REPORT REQUIREMENTS

HF-193 completion report (`docs/completion-reports/HF_193_SEEDS_ERADICATION_COMPLETION_REPORT.md`) at PR open includes:

- Gate-by-gate evidence (A through J) with pasted output
- Grep guard confirmation: `grep -r 'plan_agent_seeds' web/src` output (empty)
- Baseline verification script output: CRP, BCL, Meridian exact numeric matches
- JSONB cleanup migration result: 0 rows remain with `plan_agent_seeds` key
- TypeScript build clean output
- Branch state at PR open: `git log --oneline hf-193-signal-surface` showing preparation commits + atomic cutover commit
- Architect CRF disposition trace: CRF-1 through CRF-4 points where architect reviewed and dispositioned
- Decision 153 LOCKED → IMPLEMENTED trigger note (actual status transition migration is separate artifact post-merge)
- AUD-002 V-001 + V-007 closure note
- §1.3 architect A2 disposition on Decision 30 prerequisite referenced as forensic-trail record

---

## 12. ARTIFACTS REFERENCED

Primary substrate (read-first, authoritative):
- `Decision_153_LOCKED_20260420.md` — all seven dispositions; Principle; HF-193 scope bound items 1-9
- `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — CC operational rules; Anti-Pattern Registry
- Phase 2.2a completion report `docs/completion-reports/HF_193_A_Phase_2_2a_COMPLETION_REPORT.md` — stored procedure foundation

Session context (read before execution):
- `SESSION_CLOSING_REPORT_20260422.md` Section 4.2 — four contamination attractors
- `SESSION_HANDOFF_20260422.md` Section 2.1 — repo state; Section 18 — risks R1, R2, R5
- `IRA_Consultation_3_HF_193_Scope_Synthesis_20260422_RESPONSE.md` — 19 ip_entries; Findings 1-10 substrate

Governance substrate references:
- IGF-T2-E08 v3 (Decision 153 LOCKED substrate entry)
- AUD-002 v2 findings V-001 and V-007
- Prior session reverted commit 3c628702 (Phase 2.2b contamination; forensic trail)
- Revert commit 37111ab7 (SR-41 first operational application)

---

## 13. EXECUTION CHANNEL DISCIPLINE

**Architect/CC channel separation throughout:**
- Architect reviews this HF-193 artifact, dispositions accept / revise / reject
- On architect accept: separate turn issues CC directive with paste-ready execution sequence
- CC executes per directive; halts at each Gate A-J for architect CRF disposition
- All evidence (build output, grep output, verification script output, git diffs) pastes to architect channel
- No CC self-attestation; no "PASS" without pasted evidence
- Architect CRF-1 through CRF-4 halts mandatory

**SR-41 applies throughout:** contamination catches trigger `git revert <SHA>` on the branch; no force-push; forensic trail preserved.

**SR-42 applies throughout:** any locked-rule dictate surfaced mid-execution halts for architect disposition.

---

*HF-193 · Seeds Eradication to Signal-Surface Architecture · Atomic Cutover · Decision 153 LOCKED execution vehicle · 2026-04-22 · Authored per architect A2 disposition on Decision 30 prerequisite + full Decision 153 lock ceremony scope items 1-9*
