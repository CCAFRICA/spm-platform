# OB-248 — Distribution Capability: Fan-Out Calculation via Graph-Resolved Recipients

**Directive file (VP):** `docs/vp-prompts/OB-248_DISTRIBUTION_CAPABILITY_DIRECTIVE_20260627.md`
**Date:** 2026-06-27 · **Category:** OB (objective build — new capability) · **Mode:** ULTRACODE `/effort` (autonomous)
**Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `ob-248-distribution-capability` (NEW branch from main)
**Prerequisites:** HF-350 merged (column batching) + PR #601 R7 merged (four fidelity properties). Both must be on main before this branch starts. If either is not yet merged, HALT — do not begin.
**Design authority:** `Robles Maquinaria — Import / Plan-Interpretation / Convergence Requirements` (architect-reviewed, approved as design specification — no separate Design Gate required).
**Proof tenant:** Robles Maquinaria. tenant_id assigned at import time.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11).

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Load-bearing for this directive:

- **AP-25 / Korean Test (Decision 154, LOCKED)** — zero `Robles`, zero Spanish literals, zero role→rate / role→recipient registry, zero product→factor / channel→factor mapping table. One canonical declaration; every boundary derives from it. Structured failure on unrecognized.
- **Decision 158 (LOCKED)** — LLM recognizes; deterministic code constructs and guarantees. The LLM recognizes the distribution intent, the recipient roles, the factor model, the modifier shapes. Code constructs the fan-out, the graph traversal, the constraint pass, the temporal state. "The LLM chose to fan out" framing is prohibited.
- **The Validation Premise Law (HF-339, LOCKED)** — checks against carried reality only. The graph edges are carried reality. The reference tables are carried reality. The factor tables are carried reality.
- **Carry Everything, Express Contextually (T1-E902 v2)** — the sale imports as ONE row carrying all columns. Recipients are resolved at convergence/calc time via the graph. Fan-out is a derivation, not an ingestion artifact. Do NOT explode a sale into N rows at import.
- **C0 — No Fixed Taxonomy** — extension or annotation in lieu of deletion is failure.
- **C2 — Fail Loud** — unresolvable graph traversal, missing reference rate, missing factor table entry → diagnostic message, not silent $0.
- **SR-2 — Scale by Design** — the distribution capability works for any tenant whose plan describes a distribution. No Robles-specific code.
- **SR-34 — No Bypass** — diagnose and fix at class layer. No workarounds.
- **Vertical Slice Rule** — import → SCI → engine contract → calculate → rendered result. One PR. One OB.
- **D64 — Dual Intelligence** — convergence matches plan requirements against data dimensions.
- **D117 / D118** — import identifies, convergence routes. AI-primary matching.
- **D127 — validatePrimeTree CRITICAL** — terminal completeness; every DAG node validates before calc. Extended: distribution DAG nodes validate too.

**First action:** write this directive to `docs/vp-prompts/OB-248_DISTRIBUTION_CAPABILITY_DIRECTIVE_20260627.md` and commit (`"OB-248: directive committed"`).

**Channel boundary:** CC creates/edits application code only. Governance surfaces → ARTIFACT SYNC delta in the completion report; architect applies.

**Reconciliation-channel separation:** Robles ground-truth values live in the architect channel only (`RoblesMaquinaria_Resultados_Esperados.xlsx`). CC reports calculated values verbatim; the architect reconciles.

**Execution authority (ULTRACODE — binding):** CC owns the entire execution path within the substrate boundaries. CC makes every design decision, commits each as an ADR, and proves it. **CC halts only on premise failures (§4). Difficulty is not a halt condition.**

---

### §0.1 — ANTI-SCOPE-NARROWING ENFORCEMENT (binding)

Carried from HF-341 R7. Every clause applies to OB-248:

1. **No partial fixes.** This directive contains 12 capability items across 4 pipeline stages. All 12 are in scope. CC does not defer any item to "a future OB."
2. **Subtraction over addition.** Every correct extension REUSES existing surfaces. If CC finds itself creating a new code surface for distribution-specific logic, STOP — that is wrong.
3. **Disconnection is not deletion.** Code that runs is live code.
4. **"Inert" is not an acceptable state.** Code that computes and writes is live regardless of readers.
5. **Tests assert carried reality, not registries.** Tests assert structural properties of the distribution.
6. **No deviation path.** Zero grep hits is the gate.
7. **No scope-limiting assumptions as safety.** The HALT-CALC anchors are the only safety gates.

### §0.2 — ANTI-PARALLEL-PATH ENFORCEMENT (binding — new for OB-248)

**This enforcement exists because Decision 158 requires a unified path.** Distribution is an EXTENSION of the existing pipeline, not a parallel pipeline. CC must extend, not duplicate:

1. **No new files for distribution-specific logic.** The plan interpreter extends inside `ai-plan-interpreter.ts` (or equivalent). The convergence service extends inside `convergence-service.ts`. The engine evaluator extends inside `route.ts` / `intent-executor.ts`. The entity resolver extends inside `entity-resolution.ts`. **CC does not create** `distribution-interpreter.ts`, `distribution-convergence.ts`, `distribution-executor.ts`, `cascade-engine.ts`, or any file whose name implies a distribution-specific code surface.

2. **Exception: test files and ADR.** New test files (`__tests__/ob248-*.test.ts`) and the ADR (`docs/adr/OB-248_ADR.md`) are expected. New utility functions within existing files are expected. New TYPE definitions in existing type files are expected. The prohibition is on new *execution surfaces* — files that contain business logic for the distribution path.

3. **The evaluation entry point is singular.** The engine must not have two entry points — one for per-entity evaluation, one for distribution evaluation. There is ONE evaluation entry point. Distribution is a mode that the entry point dispatches based on the convergence contract's content (does it contain a distribution derivation? → distribution mode. Otherwise → per-entity mode). The per-entity path is unchanged.

4. **The convergence entry point is singular.** `convergeBindings` (or equivalent) handles both per-entity and distribution plans. Distribution-specific logic is a branch inside the existing function, not a separate function.

5. **Verification:** `find web/src -name "*.ts" -newer [directive commit SHA] -not -path "*test*" -not -path "*__tests__*"` — every new `.ts` file that is NOT a test is a violation. CC pastes this find result in the completion report.

---

## §1 — PROBLEM STATEMENT

### §1.1 — The capability being unlocked

**Distribution calculation** — one committed transaction produces N payout rows via graph-resolved recipients. Every reconciled tenant to date (BCL, Meridian, CRP, MIR, Sabor) produces one payout per entity per period. Robles Maquinaria is the first distribution tenant: one sale → 4–6 payout rows via a typed relationship graph. The originator sells; the branch head, zone manager, director, and conditionally a product specialist and key-accounts manager each receive a calculated share.

This is the defining asymmetry. The DAG today evaluates to `one number per entity-in-context`. Distribution extends this to `one number per resolved-recipient-in-context, constrained and modified per the contract`.

Robles Maquinaria (a Peruvian industrial equipment distributor) is the ICM-domain proof tenant. The capability is domain-agnostic — any tenant whose plan describes a distribution exercises the same path.

### §1.2 — What must be true at completion (the 12 properties)

Every property is a structural invariant — it holds for any tenant, any plan, any domain.

**IMPORT (3 properties)**

**P-I1: Hierarchy ingestion.** A sheet whose structure describes an organizational hierarchy (typed relationships between entities — vertical chain, overlay/conditional edges) imports into `entity_relationships` with typed, directed, temporal edges. The LLM recognizes the hierarchy structure; code constructs the edges. No hardcoded relationship types. The existing `entity_relationships` table, CRUD, and `traverseGraph` BFS are reused.

**P-I2: Reference table ingestion.** Sheets containing per-entity keyed rates (Anexo) and category-keyed factors (product factors, channel factors) import as `reference_data` / `reference_items`. The HF-329 Meridian reference-join pattern is reused. No new reference infrastructure.

**P-I3: Import neutrality.** Importing Robles data does not change the import path for non-distribution tenants. BCL/Meridian/MIR data imports identically.

**COMPREHENSION (3 properties)**

**P-C1: Distribution intent recognition.** The plan interpretation prompt recognizes when a plan describes a distribution (one transaction → multiple recipients via a hierarchy) and emits a distribution intent: ordered recipient roles, per-role inclusion condition (always / attribute-conditioned), and the distribution graph shape. This is a structural extension of the existing comprehension output, not a parallel output class.

**P-C2: Multiplicative factor model.** The plan interpretation recognizes `participant_rate = ref(base, recipient) × ref(factor_1, attribute_1) × ref(factor_2, attribute_2)` — a composed multiply over reference reads where the entity key varies per factor. R7's `composesInto` mechanism extends to N factors. The factors are flagged as reference-sourced (numbers not inlined — Korean Test).

**P-C3: Modifier shape recognition.** The plan interpretation recognizes and emits five modifier shapes, each classified structurally with parameters:
- Cross-recipient cap (per-transaction, proportional reduction across all recipients)
- Volume cliff (binary rate multiplier based on own-period aggregate exceeding threshold)
- Component-scoped floor (minimum per originator per period on one component)
- Consecutive-period streak (N-period accumulator with reset, reading `entity_period_outcomes`)
- Cascade reversal / retro recompute (atomic reversal or delta recompute of multi-recipient cascade)

Each modifier is emitted as a structural description with parameters — not as a named modifier type from a registry (Korean Test).

**CONVERGENCE (3 properties)**

**P-V1: Graph-resolved recipient set.** For each committed sale row in a distribution plan, convergence resolves the recipient set by traversing `entity_relationships` from the originator entity, following typed edges (the types come from the plan's distribution intent, not hardcoded), plus overlay edges conditioned on row attributes. The traversal uses the existing `traverseGraph` BFS. The resolved set is per-row, not per-entity — different sales by the same originator may have different overlay recipients based on product/channel.

**P-V2: Distribution derivation.** Convergence writes a distribution derivation to `input_bindings.metric_derivations` that coexists with per-entity derivations (HF-234 rule). The distribution derivation specifies: recipient-resolution spec (edge types + overlay conditions from P-V1), per-recipient factor-model derivation (from P-C2), and modifier specs (from P-C3). CC determines the JSONB shape within the constraint that it EXTENDS the existing `metric_derivations` structure.

**P-V3: Contract validation.** Convergence validates the distribution contract structurally (Validation Premise Law — no frozen expectations): every recipient role resolves to at least one graph edge (referential resolution), factor tables cover every product/channel value present in committed data (conservation), base rate reference covers every resolved recipient (conservation). Each binding decision emits a fingerprinted Level 3 signal (Progressive Performance). Failed validation → C2 fail-loud diagnostic.

**ENGINE (3 properties)**

**P-E1: Row-emitting distribution evaluation.** The engine evaluates a distribution plan by producing N payout rows per committed sale row — one per resolved recipient. Each recipient's amount = the factor-model derivation evaluated for that recipient against that row's attributes. The evaluation entry point is singular (§0.2 rule 3): the existing per-entity path runs when the contract contains no distribution derivation; the distribution path runs when it does. Both paths use the same DAG evaluation primitives (arithmetic, aggregate, filter, conditional, scope, constant, reference). The distribution path extends the evaluation context, not the evaluation algebra.

**P-E2: Cross-recipient constraint (tope).** After the per-recipient amounts are computed for one transaction, the cross-recipient cap applies: if the sum exceeds the cap (expressed as a percentage of the sale amount), every recipient's amount is proportionally reduced so the sum equals the cap. This is a post-evaluation pass over the materialized per-transaction cascade — not a per-recipient DAG modifier.

**P-E3: Temporal modifiers.** Two temporal capabilities:
- Volume cliff: at calculation time, the engine reads the originator's own-period aggregate (from committed data or `entity_period_outcomes`) and applies the binary rate multiplier. This is a conditional that reads an aggregate — expressible in the existing DAG algebra as `conditional(compare(aggregate(own_net), gte, threshold), rate × multiplier, rate)`.
- Consecutive-period streak: the engine reads the entity's `entity_period_outcomes` for the prior N periods, checks if a threshold was met consecutively, and applies a bonus or resets the accumulator. This requires reading cross-period state — a new input to the evaluation context, sourced from an existing table.
- Component-scoped floor: the originator's sale-earnings component has a minimum per period. Expressible as `arithmetic(max, computed_amount, constant(floor_value))`.

**P-E4: Cascade reversal and retro recompute.** When a return (devolución) is processed, the engine traces the original sale's distribution cascade (from `calculation_results` or `calculation_traces`) and reverses every recipient's payout for that sale. When a price correction occurs, the engine recomputes the cascade at the corrected net and posts the delta per recipient. Both operations produce new `calculation_results` rows that reference the original.

---

## §2 — SUBSTRATE-BOUND DISCIPLINE

- **Decision 158.** The LLM recognizes distribution intent, recipient roles, factor models, modifier shapes. Code constructs the graph traversal, the fan-out evaluation, the constraint pass, the temporal state read, the reversal trace. The boundary is sharp: the LLM's output is a structural description stored in `classification_signals` / `rule_sets`. Code reads the description and executes deterministically.
- **Korean Test.** No role names (vendedor, jefe de zona, director, especialista, cuentas clave) in code or prompts as string literals. No product category names. No channel names. The prompt teaches the PATTERN ("a sale distributes to recipients identified by traversing a hierarchy graph, with overlay edges conditioned on row attributes") with domain-agnostic examples.
- **Carry Everything.** The sale row imports once with all columns. Fan-out happens at convergence/calc time. No import-time row explosion.
- **Validation Premise Law.** Contract validation checks: recipient role resolves to graph edge (referential), factor table covers data values (conservation), base rate covers recipients (conservation). No frozen-expectation checks.
- **C2 Fail-Loud.** Five specific silent-failure paths prevented: unresolvable graph traversal, missing base rate, missing factor entry, tope applied to zero recipients, reversal with no original trace.
- **Progressive Performance.** Second Robles-shaped encounter = Tier 1. The distribution intent recognition, the convergence bindings, and the factor-model derivation are all fingerprinted. A surface producing cold-start on every encounter is failure.

---

## §3 — PHASES (ULTRACODE `/effort` — autonomous, with strict D158 controls)

CC determines the implementation strategy for all 12 properties. The directive constrains WHAT properties must hold at completion and WHERE the code lives (§0.2), not HOW to achieve them. CC commits the ADR before implementation begins.

### §3.0 — EVIDENCE GATE (mandatory before implementation)

CC investigates the existing codebase to evidence the extension points for each pipeline stage. No implementation code until this gate clears and the ADR is committed.

| Stage | Required evidence | The question it answers |
|---|---|---|
| **Import** | Paste the existing `entity_relationships` table structure, the `createRelationship` function, and the `traverseGraph` function. Paste the existing reference_data/reference_items import path. | **What exists that distribution extends?** |
| **Comprehension** | Paste the `<<PRIME_GRAMMAR>>` prompt section and the skeleton/interpretation output structure. Paste the `composesInto` mechanism from R7. | **Where does distribution intent fit in the existing output?** |
| **Convergence** | Paste the `convergeBindings` function signature and the `metric_derivations` JSONB structure it writes. Paste the reference-join path (HF-329). | **What shape does the distribution derivation take within the existing structure?** |
| **Engine** | Paste the evaluation entry point (`evaluate` or equivalent in `route.ts`). Paste the `resolveColumnFromBatch` data-fetch path. Paste `calculation_results` write path. | **Where does distribution mode branch inside the existing entry point?** |

**ADR commitment (mandatory before Tier 1):** `docs/adr/OB-248_ADR.md` documents the evidenced extension points, the chosen shape for each extension, the blast radius (which other tenants/plans exercise the changed surfaces), and why each extension is inside an existing file (§0.2 compliance).

### §3.1 — TIER 1: PROPERTY ESTABLISHMENT (CC determines implementation strategy)

CC implements all 12 properties. Each property extends an existing code surface (§0.2). CC determines ordering, commit granularity, and internal structure within the substrate boundaries.

**STRICT D158 CONTROLS (binding — these are NOT ULTRACODE-delegated):**

1. **The LLM prompt extension for distribution intent (P-C1/P-C2/P-C3) must use domain-agnostic structural examples.** The worked example in the prompt must NOT use Spanish, NOT use Robles role names, NOT use product category names. It must use structural placeholders: "a sale distributes to recipients via a hierarchy: originator → level_1_manager → level_2_manager → top_manager, with conditional overlay recipients when row attributes match reference categories." CC pastes the prompt extension in the completion report for architect review.

2. **The graph traversal for recipient resolution (P-V1) reads edge types from the convergence contract, not from code.** The code path is: convergence contract says "traverse edges of types [X, Y, Z] from the originator" → engine reads [X, Y, Z] from the contract → `traverseGraph` filters by those types. The types are the LLM's recognition of the plan's hierarchy, stored in the contract. Code never contains a string literal for a relationship type.

3. **The factor-model evaluation (P-E1) reads factor table names and key columns from the convergence contract.** The code path is: contract says "for each recipient, read base_rate from reference_table_A keyed by recipient_id, multiply by factor from reference_table_B keyed by row.product_column, multiply by factor from reference_table_C keyed by row.channel_column" → engine reads these specs from the contract → evaluates the arithmetic. Code never contains a reference table name or key column name.

4. **The modifier parameters (P-E2/P-E3/P-E4) come from the convergence contract.** The tope percentage, the cliff threshold, the floor value, the streak period count, the streak threshold — all are in the contract. Code reads them. Code never contains a numeric threshold for a specific plan.

### §3.2 — TIER 2: PROOF GATES (sequential — dependency-ordered)

**PG-1 — Import proof.** Robles data imports: (a) transaction data sheets commit to `committed_data` with correct entity_id and source_dates; (b) hierarchy sheet creates `entity_relationships` edges with typed, directed, temporal relationships — paste the edge count and sample edges; (c) reference tables (Anexo + factor tables) import to `reference_data`/`reference_items` — paste reference item count per table.

**PG-2 — Comprehension proof.** Robles plan PDFs interpret correctly: (a) distribution intent is emitted — paste the stored signal showing recipient roles and inclusion conditions; (b) factor model is recognized — paste the stored signal showing `base × factor_1 × factor_2` structure with reference flags; (c) modifier shapes are recognized — paste the stored signal showing all 5 modifiers with parameters.

**PG-3 — Contract proof.** Convergence writes the distribution contract: (a) paste the `input_bindings.metric_derivations` JSONB showing the distribution derivation with recipient-resolution spec, per-recipient factor-model, and modifier specs; (b) paste the convergence validation output showing referential resolution (all roles → edges), conservation (factor tables cover data values), and base rate coverage.

**PG-4 — Basic distribution proof.** Engine evaluates one sale → N payout rows: (a) for one committed sale row, paste the resolved recipient set (who, via which edge type); (b) paste each recipient's computed amount showing the factor-model evaluation; (c) paste the `calculation_results` rows written — one per recipient per sale. Grand total is non-zero.

**PG-5 — Modifier proof.** (a) Tope: paste a sale where the unconstrained cascade sum exceeds the cap — show the proportional reduction and the post-tope per-recipient amounts. (b) Volume cliff: paste an originator whose monthly net exceeds the cliff threshold — show the rate multiplier applying. (c) Floor: paste an originator whose sale-earnings are below the floor — show the floor applying.

**PG-6 — Temporal proof.** (a) Streak: paste an entity's `entity_period_outcomes` for 3 consecutive periods showing threshold met — show the streak bonus applying. Paste a period where the threshold is missed — show the reset. (b) Reversal: paste a return transaction — show the original cascade being traced and every recipient's payout reversed. (c) Correction: paste a price correction — show the cascade recomputed and the delta posted per recipient.

**PG-7 — Neutrality (HALT-CALC).** Calculate BCL → $312,033. Calculate Meridian → $556,985. Calculate MIR Plan 2 → 210,000. MIR Plan 5 → 0. **Any movement → HALT. Do not attempt repair.**

**PG-8 — Progressive Performance.** Second Robles import (same fingerprint) = Tier 1. Zero LLM calls. Plan interpretation cached. Convergence cached. Paste the fingerprint match log showing Tier 1.

**PG-9 — Korean Test / SR-2 / §0.2 compliance.** Grep evidence:
(a) Zero Robles-specific column/value/tenant/role literals in production code.
(b) Zero relationship_type string literals in engine/convergence code (types read from contract).
(c) Zero reference table name literals in engine code (names read from contract).
(d) Zero new production `.ts` files (§0.2 anti-parallel-path). Paste `find` result.
(e) Zero component-type→distribution-mode registry.

---

## §4 — HALT CONDITIONS

- **HALT-CALC.** BCL $312,033, Meridian $556,985, MIR Plan 2 = 210,000, or MIR Plan 5 = 0 moves. Stop all work. Report the delta. Do not attempt repair.
- **HALT-PARALLEL.** Any new production `.ts` file created for distribution-specific logic. Stop. The fix is wrong. Refactor into the existing surface.
- **HALT-REGISTRY.** Any fix introduces a mapping table, enum, or condition that names a specific role, product, channel, relationship type, or tenant. Stop. Redesign toward contract-driven.
- **HALT-COLLISION.** In-flight work on `main` modifies the same code surfaces. Stop. Report.
- **HALT-LOCKED-RULE (SR-42).** A locked rule dictates action that contradicts another locked rule. Surface both. Halt.
- **HALT-PREREQUISITE.** HF-350 or PR #601 (R7) is not on main when the branch starts. Do not begin.

---

## §5 — REPORTING DISCIPLINE

**Completion report:** `docs/completion-reports/OB-248_COMPLETION_REPORT.md`

Structure (Rules 25–28):
1. Summary (properties established, lines changed, files extended)
2. Investigation evidence (pasted per §3.0)
3. ADR (committed separately, referenced)
4. Per-property evidence (pasted code showing the extension, pasted grep showing no new files)
5. Proof gate results (PG-1 through PG-9, each with pasted evidence)
6. D158 control evidence (prompt extension pasted for architect review, contract-driven verification)
7. HALT conditions encountered (if any)
8. ARTIFACT SYNC block

---

## §6 — OUT OF SCOPE

- MIR Plans 3/4 reconciliation divergence — architect-channel investigation, not a code change.
- OB-234 R3 theme regression — CSS tokens, not engine/convergence.
- CRP Plans 2/4 — unaffected by distribution capability.
- Marketing materials / collateral — SAY-TODAY ratchet.
- Schema migration — if the distribution derivation requires a new column on an existing table, surface it in ARTIFACT SYNC for architect disposition. If it fits within existing JSONB fields (`input_bindings`, `metric_derivations`, `calculation_traces`), no migration needed.
- Financial Agent / Sabor — separate tenant, no shared code surface.
- Persona-based data visibility (DIAG-077) — separate OB.

---

## §6A — RESIDUALS

None. All 12 properties are in scope. The five modifier shapes, the temporal state, the cascade reversal — all in scope. This is the comprehensive OB. The only follow-on is the architect's reconciliation of Robles calculated values against the sealed GT, which is SR-44 (architect-only, post-merge).

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*OB-248 — Distribution Capability: Fan-Out Calculation via Graph-Resolved Recipients*
*File IS the prompt. No §7. No tail summary. CC reads end-to-end and executes.*
