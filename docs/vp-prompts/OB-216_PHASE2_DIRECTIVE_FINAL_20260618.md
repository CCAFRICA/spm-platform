# OB-216 — Phase 2 Directive (FINAL, Direction A): Clean Labeled Candidates + LLM Binding with Abstention + Light Structural Validation

**Supersedes** the REVISED Phase 2 directive's heavy agentic elements. **Withdrawn from OB-216 (deferred to a dedicated Convergence Binding Agent OB, sibling to OB-214): the §S.4 self-correction loop, the §S.5 binding fingerprint cache, and binding-as-an-agent on the OB-212 harness.** Those are a deliberate agentic build with their own EECI work, on the shared harness — not part of a convergence defect fix.

**Retained for OB-216 (the focused fix that unblocks MIR):** sheet-labeled, role-aware candidate assembly → one unified LLM binding pass with **abstention permitted** → light **deterministic structural validation** → batchIds union. One path, all plans, no per-plan branch, no registry, no threshold.

**Applies to:** `ob-216-convergence-unified-path` (HEAD `ac25d827`, EPG-1 released). Self-gate to EPG-2; next mandated pause EPG-3′. CC has read the live `generateAllComponentBindings`, `resolveColumnMappingsViaAI`, and the adapter prompt — implement surgically against that live structure.

---

## §A — Scope boundary (Direction A)

| In OB-216 Phase 2 (focused fix) | Deferred to the Convergence Binding Agent OB |
|---|---|
| Candidate assembly: all sheet capabilities, **labeled + role-tagged** (not measure-only) | Self-correction loop (re-invoke LLM with validation-failure feedback) |
| One LLM binding pass over labeled candidates, **abstention permitted** | Binding-specific fingerprint cache / Progressive-Performance reuse |
| Light **structural** validation (existence + role-consistency, no threshold) | Binding implemented as an agent on `agent-runner.ts` |
| batchIds = union of bound fields' sheets | EECI optimization of the agentic binding mechanism |
| Remove the forced-no-abstention prompt defect | — |

The fix makes all 5 plans bind correctly (DIAG-073: "with a correctly scoped pool the same prompt yields the right answer"). The agentic machinery is robustness/generality, built deliberately later.

---

## §B — Candidate assembly (deterministic, structural)

Replace the measure-only, cross-sheet, unlabeled `measureColumns` pool (`convergence-service.ts:2700-2736`) with a **labeled, role-aware** candidate set built from the Phase-1 sheet capabilities: every capability's columns, each carrying its **sheet label** (`partitionKey`/sheet identity), **structuralType**, **contextualIdentity**, and value stats. Admit all role-bearing columns (measure, count, **attribute** — so `Verificado` is a candidate), each tagged with its role. The label is the discriminator the original mapper lacked (DIAG-073 §2.3: the defect was *unlabeled* cross-sheet candidates, not their presence).

Korean-Test: the label is the opaque `partitionKey` (structural); no column-name literal, no role-by-name branch.

---

## §C — LLM binding pass (one pass, all fields, abstention permitted)

`resolveColumnMappingsViaAI` (`convergence-service.ts:2355-2534`) receives the component's requirements (declared field names + the component's calculation intent) and the §B labeled candidate set, and recognizes per field: the target column, its sheet, and a confidence. One unified pass handles all field kinds — literal fields (`Monto_Total`→`Monto_Total`) trivially, abstract fields (`ventas_brutas_mensuales`→`Monto_Total` (Ventas); `cuota_mensual_asignada`→`Enero_2025` (Cuotas)) semantically, cross-sheet where the component requires it.

**Remove the forced-no-abstention defect.** Update the `convergence_mapping` system prompt (`anthropic-adapter.ts:940-945`) to permit "insufficient evidence" for a field, with a reason. An abstained field → a **structured convergence gap** (surfaced), NOT a forced pick. (No loop re-attempt in OB-216 — that's the deferred agent OB. The focused-fix behavior is: bind confidently, or emit a gap.)

The prompt instructs semantic matching over the labeled candidates by meaning + label + role; it carries NO column-name literal and NO threshold. The old `match_pass:2` "AI-only, bind anyway regardless of validation" path is removed.

---

## §D — Light structural validation (deterministic, no threshold) — §S.3 = option (1)

Each LLM-proposed binding is validated **structurally** — not re-scored against a cutoff:

1. **Existence:** the proposed column exists in the proposed sheet capability.
2. **Role-consistency (option 1 — needed-type derived from intent usage):** derive the requirement's needed-type **deterministically from how the field is used in the component's `calculationIntent`**, by walking the intent structurally:
   - field referenced inside an **arithmetic op** (`multiply`/`subtract`/`divide`/etc.) or an **aggregate** (`sum`/etc.) → needs **numeric** (structuralType `measure` or `count`).
   - field referenced inside a **compare / conditional / filter** context → **may bind an attribute/categorical** (a numeric column is also acceptable there).
   A numeric-needed field binding an **attribute** column → validation **fails** → gap. An attribute-needed field binding an attribute → valid. This is exactly what lets Plan 4's `Verificado` (used in a count/condition) validly bind the `Verificado` attribute, while no numeric reference can bind an attribute unchecked.

Validation is existence + role-consistency only — structural, Korean-Test-clean (walks operation types in the intent AST, never a column-name literal), **no bare-float**. A binding that fails validation is NOT silently accepted; it becomes a convergence gap.

**Why option (1) and not (2)/(3):** (2) has the LLM also state the role, which is redundant with code that can derive it and introduces a disagreement-handling case (Decision 158: code derives what code can derive). (3) drops role-consistency, letting a numeric reference bind an attribute unchecked — too weak. (1) is deterministic, threshold-free, and sufficient.

---

## §E — batchIds union

A component's `batchIds` = the union of all capabilities carrying its bound columns. A literal column present in multiple sheets unions them (Plan 1: `Monto_Total` ∈ {Ventas, Ventas_Marzo} → both, so Jan rows in Ventas and March rows in Ventas_Marzo both resolve). A cross-sheet component unions its fields' sheets (Plan 2: {Ventas, Cuotas}). `resolveColumnFromBatch` (column-name scan across batches) then reaches the right rows. No separate deterministic matcher — the sheets fall out of the bound columns.

---

## §F — Plan 5 (clawback) — deferred to Phase 5 (not a Phase 2 gap)

Plan 5's declared fields are cross-period (materialize from the original January sale; §F/§3.3 of the amendment). Its current-period requirement (`Folio_Original`) is injected by Phase 5; the same §B–§E path then binds it to Ventas_Marzo. EPG-2 records Plan 5 as "deferred to Phase 5."

---

## §G — EPG-2 (self-gate; reviewed in completion report)

Paste, per plan, the LLM-recognized bindings + structural-validation result:

| Plan | Field → column (sheet) | batchIds | Role-validation |
|---|---|---|---|
| 1 | `Monto_Total→Monto_Total (Ventas)`; `Categoria→Categoria (Ventas)` attribute/filter | {Ventas, Ventas_Marzo} | numeric→measure ✓; attribute→attribute ✓ |
| 3 | `Monto_Cobrado→Monto_Cobrado (Cobranza)`; `Saldo_Pendiente→Saldo_Pendiente (Cobranza)` | {Cobranza} | numeric→measure ✓ |
| 4 | `Verificado→Verificado (Clientes_Nuevos)` | {Clientes_Nuevos} | attribute→attribute ✓ |
| 2 | `ventas_brutas_mensuales→Monto_Total (Ventas)`; `cuota_mensual_asignada→Enero_2025 (Cuotas)` | {Ventas, Cuotas} | numeric→measure ✓ |
| 5 | deferred → Phase 5 | — | — |

Plus:
- The updated `convergence_mapping` system prompt (abstention permitted) — paste it; confirm no column-name literal, no threshold.
- Evidence that NO plan binds to another sheet's columns (original defect gone): paste each binding line showing same-sheet (or correct cross-sheet for Plan 2) resolution.
- The structural-validation code (§D) — paste; confirm existence + intent-usage-derived role-consistency, no bare-float.
- Whether any field abstained → gap (and which).
- BCL single-file regression: one cap per data_type → bindings unchanged.

**Architect reconciles values vs ground truth (SR-44).** EPG-2 proves *binding* correctness (right sheet, right column, structurally valid). *Compute-non-zero* is the EPG-3′ gate (after Phase 3′ reduction; Plan 1's `Categoria` crash also closed by the §G.1 reference-prime guard).

---

## §H — Notes
- One mechanism for all plans (SR-34, structural-class; no per-plan branch, no registry). The LLM generality replaces the earlier literal/abstract bifurcation; the determinism is in structural validation (§D) and the downstream calculation (Decision 158 correctly placed).
- Removing the forced-no-abstention is itself a defect fix (it caused DIAG-073's garbage picks). Without the deferred loop, abstention surfaces as a gap rather than re-attempting — acceptable for the fix; the loop is the agent-OB enhancement.
- The Convergence Binding Agent OB (later) layers the self-correction loop + binding fingerprint cache + harness-based agent ON this corrected path, and is where the agentic EECI work happens. Phase 2 here is built so that OB can layer cleanly (the binding pass + validation are the seam).
- The abstract-field origin (`ventas_brutas_mensuales` etc.) traces to plan interpretation (OB-214's recognizer emits those names); a smarter interpreter grounding field names in data vocabulary would shrink the binding burden — relevant to sequencing the Binding Agent OB after OB-214.
- All other OB-216 / amendment disciplines stand (Korean Test, Decision 110, SR-2, SR-38, SR-44, reconciliation-channel separation — no ground-truth values in CC outputs).

---

*OB-216 Phase 2 directive (final, Direction A) · clean labeled candidates + LLM binding with abstention + structural validation · 2026-06-18 · vialuce.ai*
