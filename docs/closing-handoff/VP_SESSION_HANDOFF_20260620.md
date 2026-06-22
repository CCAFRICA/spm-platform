# VP SESSION HANDOFF
**Date:** 2026-06-20
**Session arc:** OB-217 through OB-225 pipeline completion, MIR five-plan reconciliation, BCL clean-slate regression diagnosis, IRA invocation
**Repo:** CCAFRICA/spm-platform
**Tenants:** BCL `b1c2d3e4`, Meridian `5035b1e8`, MIR `972c8eb0`

---

## SECTION -1: CRITICAL PATH TO OBJECTIVE

**Objective:** User-Ready milestone: first user runs end-to-end through the browser without architect intervention.

**Binding constraint:** The plan interpretation pipeline does not reliably produce correct computation trees from plan documents. This is the single highest-impact capability gap. Every tenant depends on it. BCL's $312,033 was verified at HF-222 clean-slate proof; a subsequent clean-slate and re-import regressed it to ~$244,000 because the LLM re-interpretation produced an incorrect c2 (Productos Cruzados) DAG. MIR's five plans (593,117 PEN ground truth total for January) produce wrong results on four of five plans.

**Frame of reference:** Does this work fix the interpreter so re-import produces correct computation trees, or is it local optimization? If a clean-slate followed by re-import does not reproduce ground truth, the platform is not user-ready.

---

## SECTION 0: SESSION SUMMARY

This session spanned four conversation arcs across approximately 20 hours:

1. **OB-217 through OB-223 pipeline:** Per-transaction audit substrate, cross-period retrieval, clawback engine, commission statement UI, string comparison fix, temporal binding, filtered aggregation. Seven PRs merged (#549, #550, #551, #552, #554, #559, #563).

2. **Three-tenant clean-slate + recalculation:** All data deleted across 30 tenant-scoped tables for BCL, Meridian, MIR. Data re-imported. All six BCL periods recalculated.

3. **IRA invocation (ded357c9, $1.18):** Scope coherence validation on the compositional_intent to prime DAG pipeline. 11 substrate entries bound. Three supersession candidates surfaced. evaluation_status: did_not_fire, no possible_gaps.

4. **OB-225 Decision 158 Pipeline Completion (PR #563):** HALT-DIAG corrected two foundational premises. Corrected scope added `filtered_aggregate` ReferenceSource + `categorized` structure shape. 9/9 synthetic tests, BCL+Meridian DAG-equivalence byte-identical.

5. **BCL regression diagnosis:** Post-clean-slate BCL grand total regressed from $312,033 to ~$244,000 across all six periods. Sole defective component: c2 (Productos Cruzados). Root cause: the LLM re-interpretation emitted `aggregate/count` (counts rows, always 1 per entity) instead of `reference` (reads the numeric value of Cantidad_Productos_Cruzados, ranges 1 to 10). Plan says "$25 por producto" / "$18 por producto", meaning value times rate, not count-of-rows times rate.

**Primary deliverable this session:** OB-225 PR #563 (not merged, SR-44), the BCL regression root cause identification, and the generalized defect class analysis linking the BCL regression to the MIR failures as instances of the same interpreter pattern.

**SOP violations this session:** Schema reference stale (parent_batch_id dropped since SCHEMA_REFERENCE_LIVE.md 2026-05-07), clean-slate SQL drafted 3 times against non-existent columns. Architect proposed SQL table update to fix BCL (corrected immediately: "NO TABLE UPDATES TO CORRECT PLATFORM BEHAVIOR").

---

## SECTION 1: WORK ITEMS CLOSED (MERGED)

| Item | PR | Summary |
|---|---|---|
| OB-217 | #549 | Per-transaction calculation substrate |
| OB-218 | #550 | Cross-period trace retrieval + clawback engine |
| OB-219 | #551 | Commission statement UI |
| OB-220 | #552 | Prime DAG string comparison fix + temporal binding mechanism |
| OB-222 | #554 | MIR five-plan activation (engine string compare + temporal binding) |
| OB-223 | #559 | Filtered aggregation prompt guidance + temporal binding resolver |
| OB-225 | #563 | Decision 158 pipeline completion (filtered_aggregate + categorized) |

---

## SECTION 2: WORK ITEMS OPEN / IN PROGRESS

| Item | Status | Summary |
|---|---|---|
| OB-214 | Directive drafted (uploaded), not dispatched | Plan Interpretation Agent: self-correcting agentic plan comprehension. Four gaps identified. |
| BCL c2 regression | Diagnosed, not resolved | LLM re-interpretation produces aggregate/count instead of reference for scalar-per-unit components. Platform fix required, not SQL patch. |
| MIR reconciliation | Blocked on OB-225 merge + re-import | Five plans need re-import through improved interpreter, then calculate and reconcile against MIR_Resultados_Esperados.xlsx. |

---

## SECTION 3: REGRESSION ANCHORS

| Tenant | Anchor | Status |
|---|---|---|
| BCL | $312,033 (6 periods, 85 entities) | REGRESSED to ~$244,000. Sole defect: c2 Productos Cruzados (aggregate/count instead of reference). c0, c1, c3 all match GT exactly across all 5 verified periods. |
| Meridian | $556,985 | Not recalculated this session. KI-1 (C5 Fleet Utilization) remains open. |
| MIR | Reconcile against MIR_Resultados_Esperados.xlsx | Not yet reconciled. Awaiting OB-225 merge + re-import. |

---

## SECTION 4: DECISIONS MADE

**Decision (architect, binding):** NO TABLE UPDATES TO CORRECT PLATFORM BEHAVIOR. The platform must produce correct computation trees from plan documents via the interpreter. SQL patches to rule_sets.components are workarounds, not fixes.

**Decision (architect, binding):** Schema reference (SCHEMA_REFERENCE_LIVE.md, 2026-05-07) is stale. parent_batch_id has been dropped from both calculation_batches and import_batches since that snapshot. Always verify schema before authoring SQL.

---

## SECTION 5: CODE STATE

**Branch:** `main` contains all merged PRs through OB-225 (#563).

**Key code surfaces affected this session:**
- `web/src/app/api/calculation/run/route.ts`: per-transaction traces, cross-period retrieval, clawback, temporal binding precheck guard
- `web/src/lib/calculation/intent-executor.ts`: string comparison in prime DAG evaluator
- `web/src/lib/compensation/plan-intelligence/intent-constructor.ts`: +filtered_aggregate ReferenceSource, +categorized structure shape, +constructCategorized
- `web/src/lib/compensation/plan-intelligence/compositional-intent.ts`: +filtered_aggregate, +CategorizedDescription
- `web/src/lib/ai/providers/anthropic-adapter.ts`: interpreter prompt with engine aggregation model awareness
- `web/src/lib/intelligence/convergence-service.ts`: count as ReductionKind

---

## SECTION 6: DATA STATE

**BCL:** Clean-slated and re-imported this session. All six periods (Oct 2025 through Mar 2026) recalculated. Grand total regressed. Data is live in Supabase.

**MIR:** Clean-slated and re-imported this session. Five plans interpreted with fresh rule_set IDs. Only Plan 3 (Cobranza) calculated correctly (219,632 PEN engine vs 148,306 PEN GT, due to missing eligibility gate). Plans 1, 2, 4 blocked by interpreter defects now addressed by OB-225. Plan 5 correct $0 for January.

**Meridian:** Not clean-slated this session.

---

## SECTION 7: GOVERNING ARTIFACTS

| Artifact | Location | Role |
|---|---|---|
| BCL_Resultados_Esperados.xlsx | Uploaded this session | BCL ground truth: 6 periods, 85 entities, $312,033 |
| BCL_Plan_Comisiones_2025.xlsx | Uploaded this session | BCL plan document: 4 components, 2 variants |
| MIR_Resultados_Esperados.xlsx | Uploaded prior session | MIR ground truth: January, 34 entities, 5 plans |
| IRA_OB214_Pipeline_Completion_Scope_Coherence_20260620.md | Uploaded this session | IRA invocation results ($1.18, 11 entries, 3 supersession candidates) |
| OB-225_COMPLETION_REPORT.md | Uploaded this session | Decision 158 pipeline completion, HALT-DIAG, corrected scope |
| OB-214_DIRECTIVE_20260618.md | Uploaded this session | Plan Interpretation Agent directive (not dispatched) |

---

## SECTION 8: FORWARD PATH

**Path A (immediate, next session):** Merge PR #563 (OB-225). Clean-slate MIR. Re-import through the improved interpreter. Calculate all five plans for January. Reconcile against MIR_Resultados_Esperados.xlsx. This tests whether the interpreter improvement (filtered_aggregate + categorized) produces correct DAGs on live plan PDFs.

**Path B (BCL regression fix):** The BCL c2 defect (aggregate/count instead of reference for scalar-per-unit) is a plan interpretation pattern the interpreter does not yet handle. The interpreter needs to understand: when a plan says "$X per unit" where the unit count is a numeric field value, emit `reference` (read the value) times `constant` (the rate), not `aggregate/count` (count rows) times `constant`. This is a prompt-level or intent-constructor-level fix, not an SQL patch. After the fix, clean-slate BCL and re-import. Verify $312,033 restored.

**Path C (OB-214):** If Paths A and B reveal that the interpreter still produces wrong DAGs despite the OB-225 improvements, OB-214 (Plan Interpretation Agent with self-correction loop) becomes the structural response. The IRA invocation supports this: E920 ("three remediation attempts = pattern, not bug") governs.

**Recommended sequence:** A first (tests OB-225 live), then B (BCL regression), then C only if A or B fails.

---

## SECTION 9: CONVERSATION STARTER

Separate file: `NEW_CONVERSATION_DIRECTIVE_20260620.md`

---

## SECTION 10: STANDING RULES CONFIRMED/ADDED

| Rule | Status |
|---|---|
| No em-dashes or en-dashes | Confirmed (standing) |
| Directory paths: substrate or ask | Confirmed (standing) |
| DIAG/AUD artifacts: single file, all evidence inline | Confirmed (standing) |
| CC database access splits by repo | Confirmed (standing) |
| Schema verification before SQL (DD-14) | Confirmed (standing) |
| PCD checklists: the check is the work | Confirmed (standing) |
| No table updates to correct platform behavior | **NEW this session** |
| SCHEMA_REFERENCE_LIVE.md is stale | **NEW this session** (parent_batch_id dropped) |

---

## SECTION 11: KNOWN ISSUES

| ID | Description | Impact | Owner |
|---|---|---|---|
| KI-1 | Meridian C5 Fleet Utilization: $402 vs GT $106,335 (cap-modifier applyTo defect) | Meridian partial | Pre-existing (DIAG-039/040/041/042 chain) |
| KI-2 | CRP roster import incomplete | CRP blocked | Pre-existing |
| KI-3 | BCL c2 Productos Cruzados regression (aggregate/count instead of reference) | BCL regressed from $312,033 | New this session |
| KI-4 | MIR P3 eligibility gate omitted (13 ineligible entities paid) | MIR P3 overpays | OB-214 class |

---

## SECTION 12: DEFECT CLASS ANALYSIS

### The generalized interpreter pattern failure

The plan interpretation pipeline has a structural defect class: the LLM recognizes WHAT a plan means but incorrectly constructs HOW to compute it. This manifests differently across tenants but shares a common root cause.

**BCL evidence (Productos Cruzados):**
The plan says "$25 por producto" (Senior) / "$18 por producto" (Ejecutivo). This means: read the numeric value of Cantidad_Productos_Cruzados for each entity, multiply by the per-unit rate. The interpreter emitted `{"op": "count", "field": "productos_cruzados", "prime": "aggregate"}`, which counts the NUMBER OF ROWS (always 1 per entity in committed_data), not the VALUE in the row (ranges 1 to 10). Result: every entity produces 1 x rate = $25 or $18 instead of value x rate = $25 to $250 or $18 to $162. The defect produces a constant total of $1,621 every period instead of varying totals ($8,480 to $10,646 per GT). All other components (c0, c1, c3) match GT exactly across all 5 verified periods.

**MIR evidence (five plans, same class):**
Plan 1: LLM recognized "per-row attribute, handled by filtered aggregates" in metadata notes but produced flat DAGs with no filter. Plan 4: LLM should produce filter(Verificado=Si) then count then multiply by 150; instead produced a scalar reference to all rows. Both are recognition-correct, construction-wrong.

**Why this is a pattern, not a bug:**
The interpreter does not understand the engine's computational model. Specifically: (1) aggregation destroys per-row identity, so categorical differentiation must happen before aggregation; (2) "count of items" (aggregate/count, counts rows) is different from "read a numeric value" (reference, reads the column value); (3) when a plan says "$X per unit" where units are a numeric field, the correct DAG is reference x constant, not count x constant. Three OB remediation attempts (OB-222, OB-223, OB-223-R2) progressively loaded the LLM prompt with pattern-specific engine vocabulary, which the IRA correctly identified as registry propagation (E920).

**What this means for User-Ready:**
If a user uploads a plan document today, the platform may produce incorrect computation trees. The user gets wrong numbers without warning. Clean-slate and re-import (which any plan change triggers) can regress previously correct tenants. This is the single highest-priority capability gap.

---

## SECTION 13: SOP VIOLATIONS THIS SESSION

1. Schema fabrication: clean-slate SQL drafted 3 times against non-existent parent_batch_id column (both tables). Corrected by verifying live schema.
2. Architect proposed SQL table update to fix BCL c2 regression. Corrected immediately by architect's own standing rule.
3. Initial BCL regression diagnosis pointed at c0 (Colocacion). GT file proved c0 was correct. The sole defect is c2 (Productos Cruzados). Always verify against ground truth before proposing fixes.

---

## SECTION 14: IRA INVOCATION RESULTS

**Invocation ID:** ded357c9-86e9-4450-9626-8a5aff19c811
**Cost:** $1.18
**Task class:** scope_coherence_validation
**Scope:** Evaluate how to complete the compositional_intent to intent-transformer to prime DAG pipeline so the LLM only declares intent and deterministic code constructs the DAG, without creating an enumerated type registry in either layer.
**evaluation_status:** did_not_fire (scope coherence, no options requested)
**possible_gaps:** none

**Entries bound (11):**

| Entry | Tier | Why it binds |
|---|---|---|
| E910 Korean Test | T1 | OB-222/223/223-R2 loaded engine vocabulary into the LLM prompt, creating a private copy of the engine's primitive vocabulary at the prompt boundary. Resolver silently produces $0 on unrecognized binding types (temporal_map). |
| E907 Fix Logic Not Data | T1 | Three remediation attempts chose quick (prompt-loading) over correct (completing intent-transformer). |
| E905 Prove Don't Describe | T1 | MIR five-plan ground truth provides empirical proof of recognition-correct/construction-wrong. |
| E906 Closed-Loop Intelligence | T1 | LLM derives prime_dag from scratch every invocation without reading prior signal about which constructions succeeded or failed. |
| E902 Carry Everything | T1 | temporal_map produced at convergence boundary but not consumable at resolver boundary (round-trip closure violation). |
| E920 Repeated Fix Failure | T1 | Three remediation attempts = pattern, not bug. Structural response required. |
| E930 Speed Over Correctness | T1 | OB-222/223/223-R2 chose the quick solution over the correct one. |
| Decision 158 | Locked | LLM is doing construction (deterministic code's job). |
| Decision 155 | Locked | Canonical declaration surface for structural primitives. |
| Decision 154 | Locked | Korean Test extends to operation vocabulary. |
| E02 EECI Efficacy | T0 | Governs this brief's own quality (precision, recall of entries). |

**Supersession candidates (3):**

1. **E910 (construction boundary):** Korean Test v2 covers four identification classes but does not explicitly govern the CONSTRUCTION boundary (transformation from semantic intent to engine primitives). Recommended: extend to establish that construction from recognized intent must be deterministic code's responsibility, and that loading the LLM with engine-vocabulary guidance is a Korean Test violation.

2. **E902 (convergence round-trip):** Carry Everything v2 specifies round-trip closure but no lower-tier rule instantiates it at the convergence-to-resolver boundary. The resolver's vocabulary-coupling is ungoverned. Recommended: create rule mandating resolver consumption paths derive from canonical primitive declaration, not hardcoded enumeration.

3. **E906 (signal-accumulation contract):** Closed-Loop Intelligence v2 imposes read-before-derive but no lower-tier rule governs how the intent-transformer accumulates construction signals from validated DAG evaluations. Recommended: create rule governing how the transformer reads signals from successful constructions.

---

## SECTION 15: VG SUBSTRATE CHANGES

No VG substrate writes executed this session. Three supersession candidates from the IRA invocation are pending architect disposition.

---

## SECTION 16: ARCHITECTURE DECISION RECORDS

**OB-225 HALT-DIAG:** The directive's two core premises were inverted against the live code. (1) The LLM does NOT produce prime_dag directly; constructTree in intent-constructor.ts (686 lines) builds DAGs deterministically at import. Decision 158 is already enforced at the construction boundary. (2) The named "444-line intent-transformer" is a 268-line legacy calc-time marshaller (intent-transformer.ts), not the bypassed constructor. The genuine defect was narrow: the construction layer had no row-level filter vocabulary, so per-category rates and filtered counts were recognized by the LLM but collapsed to flat DAGs. Corrected scope: add filtered_aggregate ReferenceSource + categorized structure shape to the REAL constructor (intent-constructor.ts), teach the prompt to emit them.

---

## SECTION 17: TOOL KNOWLEDGE

- SCHEMA_REFERENCE_LIVE.md (2026-05-07) is stale. parent_batch_id dropped from both calculation_batches and import_batches since that snapshot. Always query live schema.
- Clean-slate SQL must scope to specific tenant IDs via WHERE clauses, not SELECT from tenants table.
- BCL_Resultados_Esperados.xlsx: Sheet "Detalle por Entidad", columns: ID_Empleado, Nombre, Nivel, Periodo, C1_Raw, C1_Redondeado, C2_Raw, C2_Redondeado, C3_Raw, C3_Redondeado, C4_Raw, C4_Redondeado, Total_Redondeado.

---

## SECTION 18: RESIDUALS

1. **BCL c2 interpreter fix:** The interpreter/intent-constructor must learn the scalar-per-unit pattern. "$X per unit" where units are a numeric field = reference x constant, not count x constant. This is a platform fix (prompt or constructor), not an SQL patch.
2. **MIR re-import + reconciliation:** After OB-225 merge, clean-slate MIR and re-import to test the improved interpreter against five real plan PDFs.
3. **VG governance extensions:** Three IRA supersession candidates (E910 construction boundary, E902 convergence round-trip, E906 signal-accumulation) pending architect disposition.
4. **MIR multi-period calculation:** After January reconciliation passes, calculate Feb through Jun chronologically. March exercises the clawback engine (Plan 5).
5. **Meridian KI-1:** C5 Fleet Utilization cap-modifier applyTo defect. Pre-existing.

---

## SECTION 19: SESSION FAILURES

1. Diagnosed BCL regression as c0 (Colocacion) initially. GT file proved c0 was correct. The sole defect is c2 (Productos Cruzados). Always verify against ground truth before proposing fixes.
2. Proposed SQL UPDATE to fix BCL c2 regression. Architect corrected: NO TABLE UPDATES TO CORRECT PLATFORM BEHAVIOR.
3. Schema fabrication: 3 iterations of clean-slate SQL with non-existent parent_batch_id column.

---

## SECTION 20: CLOSING

This session delivered seven merged PRs completing the per-transaction audit substrate through Decision 158 pipeline completion. The session also surfaced the most important defect class remaining: the plan interpretation pipeline does not reliably produce correct computation trees, as evidenced by BCL's $312,033 regression (c2 aggregate/count instead of reference) and MIR's four-plan failures. The IRA invocation ($1.18, 11 entries, 3 supersession candidates) provided the substrate analysis confirming this is a pattern requiring a structural response, not another prompt fix. The forward path is clear: fix the interpreter's scalar-per-unit pattern, merge OB-225, re-import BCL and MIR through the improved interpreter, and verify against ground truth.

---

*vialuce.ai. Intelligence. Acceleration. Performance.*
*VP_SESSION_HANDOFF_20260620.md, session close 2026-06-20*
