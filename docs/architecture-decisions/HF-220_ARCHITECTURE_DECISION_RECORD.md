# HF-220 — Architecture Decision Record

**Hotfix:** HF-220 — Legacy Derivation Path Retirement (Concordance Shadow Removal)
**Date:** 2026-05-12
**Predecessors:** HF-188 (Decision 151 sole authority); HF-218 (binding verification); HF-219 (correction + flywheel + signal-registry eradication); Decision 25 (SUPERSEDED-PENDING VERIFICATION — closed by three-tenant clean-slate verification preceding this HF).

---

## Problem

The legacy derivation path (HF-188 "concordance shadow") runs alongside the intent executor on every calculation run, producing per-component values that are discarded by design — the OB-118 merge-guard at lines 2222–2249 of `web/src/app/api/calculation/run/route.ts` exists solely to prevent legacy-derived values from overwriting convergence-resolved values. Decision 151 (HF-188) designated the intent executor as sole calculation authority; Decision 25 (Feb 22) required dual-path validation before legacy retirement and was marked SUPERSEDED-PENDING VERIFICATION by April 2026 governance handoff. The architect's three-tenant clean-slate verification (BCL $312,033 / CRP $4,219,229 / Meridian per `Meridian_Resultados_Esperados.xlsx`) closes Decision 25; intent-executor-only operation produces ground-truth-exact totals across all three. Substrate authority (Decision 151) and verification completion (Decision 25 closure) place HF-220 — alignment of operative code with substrate-declared truth.

**Decisions in this ADR are IMPLEMENTATION-MECHANISM only.** Removal scope is dispositioned per HF-220 directive Dispositions 1–4. This ADR is NOT for scope re-evaluation.

---

## Decision 1 — `perComponentMetrics` population strategy post-R1

The intent executor reads from `perComponentMetrics[ci.componentIndex]` at the HF-205 Shape C invariant site (route.ts:2426) and throws if any component's metrics are missing. Currently the array is populated at route.ts:2324 inside the legacy-block for-loop. R1 removes legacy execution but must preserve the population path.

### Options

**A.** Preserve the per-component for-loop with legacy operations excised; `perComponentMetrics.push(metrics)` remains as the single populator at the same loop-body position. The loop's responsibility narrows from "produce legacy result + collect metrics for intent executor" to "resolve convergence bindings + produce metrics for intent executor + push placeholder ComponentResult".

**B.** Introduce a slim shim function that wraps cbMetrics resolution + perComponentMetrics population at the same site (structurally equivalent to A but isolated as a named function).

**C.** Restructure: merge the first loop into the intent executor loop, building `ComponentResult` from intent outcome directly (single-pass per entity).

### Constraints

- HF-205 Shape C invariant (route.ts:2427–2434) must continue to fire when `perComponentMetrics[componentIndex]` is missing (intent executor handoff fail-fast preserved).
- Korean Test: no domain-specific population logic; structural population only (component metadata from `selectedComponents[ci.componentIndex]`, metrics from convergence binding resolver).
- Atomicity: array population must succeed for every component before intent-executor reads it.
- Disposition 3: intent executor remains sole authority post-HF-220; HF-220 does not modify intent executor behavior. Option C would reshape the intent loop; rejected.

### CHOSEN: A

Because Phase 0 verified that convergence binding resolution + band normalization (route.ts:1830–2308) already live inside the per-component for-loop and already produce `metrics`. The minimal change is to:
1. Remove the `applyMetricDerivations` invocation that produced `derivedMetrics` (route.ts:1814–1816)
2. Remove the OB-118 merge-guard block that merged `derivedMetrics` into `metrics` (route.ts:2222–2249 — Phase 3 / R2)
3. Remove the `evaluateComponent` legacy invocation + legacy rounding (route.ts:2309–2321)
4. Replace `componentResults.push(result)` (route.ts:2323) with a placeholder push (`{componentId, componentName, componentType, payout: 0, metricValues: metrics, details: {}}`) so intent executor's index-overwrite at route.ts:2461 has a target slot
5. Preserve `perComponentMetrics.push(metrics)` at route.ts:2324 unchanged

Option B's "slim shim" introduces a named function for a 3-line operation co-located with its only caller — adds indirection without independent reuse. Option C violates Disposition 3.

### REJECTED: B, C

**B** because the wrapper has zero independent callers and would obscure the loop's behavior with no structural benefit. **C** because Disposition 3 mandates intent executor unchanged.

### Governing Principles Evaluation

- **G1 Standard:** N/A (mechanism choice within established calculation architecture; no new standard introduced)
- **G2 Architectural embodiment:** Single-populator pattern preserves HF-205 Shape C invariant (Decision 153 atomic cutover completion); compliance survives reimplementation because the invariant fires when the contract is violated.
- **G3 Traceability:** Audit chain — Decision 151 (sole authority) → HF-205 Shape C invariant (fail-fast on missing metrics) → Decision 153 (atomic cutover) → HF-220 R1 (legacy excision preserving invariant target) — verifiable from documentation alone.
- **G4 Discipline:** Software engineering — single-writer / single-reader contract pattern (Hoare, communicating sequential processes, 1978).
- **G5 Abstraction:** Universal — the single-writer-to-array invariant applies in any domain consuming structured collections under fail-fast contracts.
- **G6 Innovation boundary:** No innovation; established pattern.

---

## Decision 2 — Fallback path when convergence-binding resolution returns null

Per AUD-005 verbatim, the current fallback when `cbMetrics === null || Object.keys(cbMetrics).length === 0` is `buildMetricsForComponent` (legacy). Post-HF-218 + HF-219, this fallback is operative only when convergence has resolved bindings for a component but the resolver returned empty (data anomaly). A second fallback at route.ts:2206 fires when `compBindings` is absent for the component entirely (no convergence bindings).

### Options

**A.** Remove the fallback entirely; if convergence-binding resolution returns null OR compBindings absent, the per-component loop does nothing for that component (perComponentMetrics gets no push for the index); the HF-205 Shape C invariant fires (throws) when intent executor reaches that component.

**B.** Emit `engine:exception` signal (preserved HF-218 Component 4a observability) + set `metrics = {}`; component evaluates to zero per Decision 153 atomic cutover completion; calculation proceeds for other slices. (Mirrors existing HF-218 Component 2 structural_exception gentle-fail pattern.)

**C.** Other.

### Constraints

- Per Disposition 3, intent executor remains sole authority; no third path introduced.
- Per HF-218 Component 2, engine emits `engine:structural_exception` on missing/unverified bindings; this is the operative path post-HF-218 for the binding-verification failure mode.
- Per HF-219 R2, structural_exception path invokes flywheel decrement when binding traces to fingerprint.
- Per Decision 153 atomic cutover completion: convergence is sole metrics authority; legacy compute paths must not survive.
- HF-218 Component 4a observability: T3-style exceptions mirror into `classification_signals` for closed-loop visibility.

### CHOSEN: B

Because preserving observability is a non-negotiable architectural property (HF-218 Component 4a established the pattern); the gentle-fail path matches existing HF-218 Component 2 structural_exception handling (set `metrics = {}` and continue); and Option A would convert any data anomaly into a full-entity calculation failure, regressing user-facing behavior for a code-path retirement that should be invisible at runtime.

The two fallback sites are unified under a single observability pattern:

- **Site 1 (route.ts:2196 — binding present, resolver returned empty):** existing `engine:exception` signal at route.ts:2177–2192 is preserved verbatim (HF-218 Component 4a observability); `buildMetricsForComponent(...)` callback replaced with `metrics = {}`.
- **Site 2 (route.ts:2206 — `compBindings` absent entirely):** new `engine:exception` signal emit with `type: 'no_convergence_bindings_for_component'`; `buildMetricsForComponent(...)` callback replaced with `metrics = {}`.

Both sites then push placeholder ComponentResult + `metrics = {}` to perComponentMetrics. Intent executor reads `{}`, computes zero, proceeds.

### REJECTED: A, C

**A** because converting data anomalies into full-entity calculation failures regresses runtime behavior; the directive's verification proof gate is "intent-executor path behavior unchanged"; choosing A would surface as user-visible exceptions for any tenant with binding-resolver-empty cases (a class of cases that currently degrade gracefully). **C** is unused — no third option proposed.

### Governing Principles Evaluation

- **G1 Standard:** GP-1 architectural compliance — observability is a property of the architecture, not a procedure. HF-218 Component 4a established `classification_signals` as the operative observability surface.
- **G2 Architectural embodiment:** Signal emission at every binding/resolution failure is the audit control; "we observe failures" is structurally embodied by the signal write, not procedurally guaranteed by logging discipline.
- **G3 Traceability:** Audit chain — Decision 151 → HF-218 Component 4a (signal observability) → HF-220 R1 Site 1+2 (preserved observability, removed legacy fallback) — verifiable from documentation alone.
- **G4 Discipline:** Control systems theory (Wiener, 1948) — feedback loops act on measurements, not just report them. Signal emission feeds Flywheel + Adaptive Emergence (AP-26 pattern subscribers).
- **G5 Abstraction:** Universal — gentle-fail-with-observability is a domain-agnostic pattern; applies in any system where partial degradation is preferable to full failure.
- **G6 Innovation boundary:** No innovation; established HF-218 Component 4a pattern extended uniformly.

---

## Decision 3 — `perComponentMetrics` array reference site cleanup

After R1 removal, references to `perComponentMetrics` in legacy-context locations may become dead code. The Phase 0 grep enumerated three references: the declaration (route.ts:1824), the push (route.ts:2324), the consumer at HF-205 invariant (route.ts:2426). All three are live post-restructure (declaration + single push + single consumer).

### Options

**A.** Verify all references are live (declaration + push + consumer); delete any dead reference identified via grep.

**B.** Comment dead references with `// HF-220: legacy path removed` rather than delete.

### Constraints

- Korean Test: no domain-specific naming added in comments.
- SR-34 (No bypass): if a reference is unreachable, delete it; do not leave it as a "safety placeholder".

### CHOSEN: A

Because Phase 0 already verified all three references are live; there are no dead references to clean up. The declaration remains; the push remains; the consumer remains. The for-loop's body has legacy operations excised around the push, but the push itself is the surviving operative line. No additional grep-based cleanup is required post-R1 implementation; CC re-runs the verification grep in Phase 6 to confirm zero dead references.

### REJECTED: B

Because SR-34 prohibits "safety placeholder" comments for unreachable code; if a reference is dead, delete it.

### Governing Principles Evaluation

- **G2 Architectural embodiment:** Live references only; the architecture admits no dead code. SR-34 is the structural rule.
- **G3 Traceability:** Audit chain — SR-34 → HF-220 Decision 3 — verifiable from rules alone.

---

## Cross-cutting evaluations

- **Scale test:** Removal reduces per-calculation cost proportionally to entity_count × component_count (Meridian: 79 entities × 6 components × per-iteration legacy-derivation cost). Signal table write amplification reduces by `ob118MergeGuardFired_count` per run (474 in the Meridian 2026-05-12 case). At "Enterprise" (50K entities × 10 components × monthly cadence), the savings compound to ~6M discarded derivations + ~6M discarded `engine:exception` signal writes annually per tenant.
- **AI-first:** No hardcoding introduced (R1–R4 are removals, not additions; the substituted `engine:exception` signal type literals at Decision 2 Site 2 use `type: 'no_convergence_bindings_for_component'` which describes the engine state, not a domain-specific identifier — Korean Test compliant).
- **Transport:** No new HTTP body row data introduced (this is calc-engine internal restructuring).
- **Atomicity:** Removal is single-PR (Disposition 2); the per-component for-loop's restructure leaves no partial state — every component either gets a placeholder ComponentResult + metrics or doesn't (uniform fallback handling per Decision 2).
- **G1–G6:** Evaluated per-decision above.
- **Anti-Pattern Registry (AP-1 through AP-26):** No new pattern introduced. AP-26 (closed-vocabulary signal registries) is not engaged — R1–R4 do not introduce any new signal_type vocabulary; the surviving `engine:exception` signal_type is unchanged from HF-218 Component 4a.

---

## Substrate state

HF-220 introduces **no substrate change**. CC_STANDING_ARCHITECTURE_RULES.md is unchanged (no new anti-pattern; this is a removal, not a new pattern). The existing AP-26 registry remains operative. The substrate debt queue from prior HFs (E924/E904/E902 HF-218 carry-forward; OB-199 D154/155 reversal ratification from HF-219 Disposition 5) remains unchanged — HF-220 adds nothing to it.
